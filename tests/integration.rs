//! Integration tests that exercise the backend directly (no IPC) against the
//! real compose stack. These require Docker with the DevWP services up;
//! they skip gracefully when Docker is unavailable. Side-effectful flows that
//! mutate the host (create/delete site → nginx configs, /etc/hosts, certs)
//! are intentionally not covered here.
//!
//! Every test that touches the Docker stack takes `STACK_LOCK` — several of
//! them mutate shared containers (restart, teardown) and must not race.

use dioxus::dioxus_core::{NoOpMutations, RuntimeGuard, VirtualDom};
use dioxus::prelude::*;

use devwp::backend::docker::{self, ContainerState};
use devwp::backend::lifecycle;
use devwp::backend::settings;
use devwp::backend::utils::NotificationType;
use devwp::backend::wp_cli::{self, WpCliRequest};
use devwp::backend::xdebug;
use devwp::state;
use std::sync::{Mutex, MutexGuard};

/// Serializes tests that operate on the shared devwp stack.
static STACK_LOCK: Mutex<()> = Mutex::new(());

fn stack_lock() -> MutexGuard<'static, ()> {
    STACK_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn docker_available() -> bool {
    devwp::backend::docker::docker_daemon_available()
}

/// Run `f` inside a Dioxus runtime (root scope) so global signal writes have
/// a home.
///
/// The process-wide `SyncSignal`s bind to the runtime that first creates
/// them, so every test must share ONE runtime (per-test runtimes make later
/// signal writes panic with `ValueDroppedError`). `Runtime` is `Rc`-based
/// and cannot live in a static, so a dedicated thread owns it for the
/// lifetime of the test binary and jobs are sent to it.
fn with_runtime<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    use std::sync::mpsc::{channel, Sender};
    use std::sync::OnceLock;

    type Job = Box<dyn FnOnce() + Send + 'static>;
    static RUNTIME_THREAD: OnceLock<Sender<Job>> = OnceLock::new();

    let (done_tx, done_rx) = channel();
    let job: Job = Box::new(move || {
        let _ = done_tx.send(f());
    });

    let sender = RUNTIME_THREAD.get_or_init(|| {
        let (job_tx, job_rx) = channel::<Job>();
        std::thread::Builder::new()
            .name("dioxus-test-runtime".to_string())
            .spawn(move || {
                let mut dom = VirtualDom::new(|| rsx! { div { "test" } });
                let mut noop = NoOpMutations;
                dom.rebuild(&mut noop);
                let runtime = dom.runtime();
                let _guard = RuntimeGuard::new(runtime.clone());
                // Create every global signal on this thread's runtime before
                // any job runs — background threads write these signals and
                // creation off the runtime thread panics (mirrors
                // `state::init_globals()` in the real app's root component).
                runtime.in_scope(dioxus::core::ScopeId::ROOT, state::init_globals);
                for job in job_rx {
                    runtime.in_scope(dioxus::core::ScopeId::ROOT, job);
                }
            })
            .expect("spawn dioxus test runtime thread");
        job_tx
    });

    sender.send(job).expect("dioxus test runtime thread alive");
    done_rx
        .recv()
        .expect("job result from dioxus runtime thread")
}

/// Ensure the test state lives in a temp dir, never the real `.devwp-tauri`.
fn with_test_state<T>(f: impl FnOnce() -> T) -> T {
    devwp::backend::utils::set_test_mode(true);
    let dir = std::env::temp_dir().join("devwp-test-state");
    let _ = std::fs::remove_dir_all(&dir);
    let result = f();
    devwp::backend::utils::set_test_mode(false);
    result
}

fn block_on<F: std::future::Future>(future: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("test runtime")
        .block_on(future)
}

#[test]
fn container_status_reflects_compose_stack() {
    if !docker_available() {
        eprintln!("SKIP: docker unavailable");
        return;
    }
    let _guard = stack_lock();
    with_runtime(|| {
        let containers =
            docker::get_container_status().expect("get_container_status should succeed");
        assert!(
            !containers.is_empty(),
            "expected devwp_* containers to exist"
        );
        let names: Vec<&str> = containers.iter().map(|c| c.name.as_str()).collect();
        for expected in [
            "devwp_nginx",
            "devwp_php",
            "devwp_mariadb",
            "devwp_redis",
            "devwp_mailpit",
        ] {
            assert!(names.contains(&expected), "missing container {expected}");
        }
        let nginx = containers
            .iter()
            .find(|c| c.name == "devwp_nginx")
            .expect("nginx container");
        assert_eq!(nginx.state, ContainerState::Running);
    });
}

#[test]
fn settings_crud_roundtrip_in_test_state() {
    with_test_state(|| {
        settings::save_setting("webroot_path".to_string(), "/tmp/devwp-www".to_string());
        let read = settings::get_setting("webroot_path".to_string());
        assert_eq!(read.as_deref(), Some("/tmp/devwp-www"));
        assert_eq!(settings::get_webroot_path(), "/tmp/devwp-www");
        settings::delete_setting("webroot_path".to_string());
        assert_eq!(settings::get_setting("webroot_path".to_string()), None);
    });
}

#[test]
fn xdebug_toggle_roundtrip_on_running_stack() {
    if !docker_available() {
        eprintln!("SKIP: docker unavailable");
        return;
    }
    let _guard = stack_lock();
    with_runtime(|| {
        with_test_state(|| {
            let initial = xdebug::get_xdebug_status();
            let toggled = block_on(xdebug::toggle_xdebug()).expect("toggle ok");
            assert_ne!(toggled, initial, "xdebug state should flip");
            let restored = block_on(xdebug::toggle_xdebug()).expect("toggle back ok");
            assert_eq!(restored, initial, "xdebug state should restore");
        });
    });
}

#[test]
fn wp_cli_info_runs_against_php_container() {
    if !docker_available() {
        eprintln!("SKIP: docker unavailable");
        return;
    }
    let _guard = stack_lock();
    // The container workdir is the site's mounted dir (~/www, the default
    // webroot); create a throwaway site dir and remove it afterwards. The host
    // dir must actually exist, otherwise docker exec -w fails with a confusing
    // "chdir ... no such file or directory" (e.g. when ~/www is not writable
    // by the test's user).
    let site_dir = devwp::backend::utils::default_webroot().join("example.test");
    std::fs::create_dir_all(&site_dir).unwrap_or_else(|e| {
        panic!(
            "failed to create site dir {} for wp-cli test: {e}. Is the webroot writable?",
            site_dir.display()
        )
    });
    let result = block_on(wp_cli::run_wp_cli(WpCliRequest {
        site: devwp::backend::site::Site {
            name: "example.test".to_string(),
            path: site_dir.to_string_lossy().to_string(),
            url: "https://example.test".to_string(),
            status: devwp::backend::site::SiteStatus::Active,
            aliases: None,
            web_root: None,
            multisite: None,
        },
        command: "--info".to_string(),
    }))
    .expect("wp cli runs");
    let _ = std::fs::remove_dir_all(&site_dir);
    let success = result
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let error = result.get("error").and_then(|v| v.as_str()).unwrap_or("");
    if !success && error.contains("Xdebug") {
        // Xdebug in debug mode attempts (and fails) to connect to a debugger
        // before running; that is environment-dependent, not a wp-cli failure.
        eprintln!("SKIP: xdebug debug mode active: {error}");
        return;
    }
    assert!(success, "wp --info should succeed, got: {result}");
    // The same debugger-connection noise can also land in stderr on a
    // successful run when xdebug debug mode is enabled on the host stack.
    let non_xdebug_noise: Vec<&str> = error
        .lines()
        .filter(|line| !line.trim().is_empty() && !line.trim_start().starts_with("Xdebug"))
        .collect();
    assert!(
        non_xdebug_noise.is_empty(),
        "no error expected beyond xdebug noise, got: {result}"
    );
}

#[test]
fn global_signal_state_handlers_roundtrip() {
    with_runtime(|| {
        let _guard = stack_lock();
        state::push_build_log("nginx", "\u{1b}[31mClean me\u{1b}[0m");
        assert_eq!(
            state::build_logs().last().map(|l| l.as_str()),
            Some("[nginx] Clean me")
        );
        state::push_build_log("nginx", "   \r\n");
        let logs = state::build_logs().clone();
        assert_eq!(logs.len(), 1, "empty ANSI-only lines are dropped");

        state::mark_service_building("nginx", true);
        assert!(state::is_service_building("nginx"));
        state::mark_service_building("nginx", false);
        assert!(!state::is_service_building("nginx"));

        state::set_docker_status(
            devwp::backend::docker::DockerStatus::Complete,
            "integration check",
        );
        assert_eq!(
            state::docker_status().status,
            devwp::backend::docker::DockerStatus::Complete
        );

        state::push_notification(NotificationType::Success, "integration notification");
        assert_eq!(
            state::notifications().last().map(|n| n.message.as_str()),
            Some("integration notification")
        );
    });
}

/// Full-stack validation of the Bollard orchestration: tear the stack down
/// via the Engine API, bring it back up via `lifecycle::start_services`
/// (adopt-or-create + dependency health gates), and verify every service is
/// running afterwards. This is the exact path `cargo run` exercises on app
/// launch. Slow (health waits dominate); CI provisions images beforehand so
/// no build happens here.
#[test]
fn bollard_orchestration_down_and_up_roundtrip() {
    if !docker_available() {
        eprintln!("SKIP: docker unavailable");
        return;
    }
    let _guard = stack_lock();
    with_runtime(|| {
        block_on(lifecycle::stop_services());
        assert_eq!(
            state::docker_status().status,
            devwp::backend::docker::DockerStatus::Stopped,
            "teardown should complete cleanly: {}",
            state::docker_status().message
        );
        let containers = docker::get_container_status().expect("status after teardown");
        assert!(
            containers.is_empty(),
            "project containers should be gone, found: {:?}",
            containers
                .iter()
                .map(|c| c.name.clone())
                .collect::<Vec<_>>()
        );

        block_on(lifecycle::start_services());
        assert_eq!(
            state::docker_status().status,
            devwp::backend::docker::DockerStatus::Complete,
            "startup should complete: {}",
            state::docker_status().message
        );
        let containers = docker::get_container_status().expect("status after startup");
        for expected in [
            "devwp_nginx",
            "devwp_php",
            "devwp_mariadb",
            "devwp_redis",
            "devwp_mailpit",
        ] {
            let container = containers
                .iter()
                .find(|c| c.name == expected)
                .unwrap_or_else(|| panic!("missing container {expected} after startup"));
            assert_eq!(
                container.state,
                ContainerState::Running,
                "{expected} should be running"
            );
        }
    });
}
