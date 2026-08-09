//! Integration tests that exercise the backend directly (no IPC) against the
//! real compose stack. These require Docker with the DevWP services up;
//! they skip gracefully when Docker is unavailable. Side-effectful flows that
//! mutate the host (create/delete site → nginx configs, /etc/hosts, certs)
//! are intentionally not covered here.

use dioxus::dioxus_core::{NoOpMutations, RuntimeGuard, VirtualDom};
use dioxus::prelude::*;

use devwp::backend::docker;
use devwp::backend::settings;
use devwp::backend::wp_cli;
use devwp::backend::xdebug;
use devwp::state;

fn docker_available() -> bool {
    std::process::Command::new("docker")
        .args(["info"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Run `f` inside a Dioxus runtime (root scope) so global signal writes have
/// a home.
fn with_runtime<T>(f: impl FnOnce() -> T) -> T {
    let mut dom = VirtualDom::new(|| rsx! { div { "test" } });
    let mut noop = NoOpMutations;
    dom.rebuild(&mut noop);
    let runtime = dom.runtime();
    let guard = RuntimeGuard::new(runtime.clone());
    let result = runtime.in_scope(dioxus::core::ScopeId::ROOT, f);
    drop(guard);
    result
}

/// Ensure the test state lives in a temp dir, never the real `.devwp-tauri`.
fn with_test_state<T>(f: impl FnOnce() -> T) -> T {
    std::env::set_var("DEVWP_TEST_MODE", "1");
    let dir = std::env::temp_dir().join("devwp-test-state");
    let _ = std::fs::remove_dir_all(&dir);
    let result = f();
    std::env::remove_var("DEVWP_TEST_MODE");
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
        assert_eq!(nginx.state, "running");
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
    // The container workdir is the site's mounted dir (~/www, the default
    // webroot); create a throwaway site dir and remove it afterwards.
    let site_dir = devwp::backend::utils::default_webroot().join("example.test");
    let _ = std::fs::create_dir_all(&site_dir);
    let result = block_on(wp_cli::run_wp_cli(WpCliRequest {
        site: devwp::backend::site::Site {
            name: "example.test".to_string(),
            path: site_dir.to_string_lossy().to_string(),
            url: "https://example.test".to_string(),
            status: "active".to_string(),
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
    assert_eq!(error, "", "no error expected, got: {result}");
}
use devwp::backend::wp_cli::WpCliRequest;

#[test]
fn global_signal_state_handlers_roundtrip() {
    with_runtime(|| {
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

        state::set_docker_status("complete", "integration check");
        assert_eq!(state::docker_status().status, "complete");

        state::push_notification("success", "integration notification");
        assert_eq!(
            state::notifications().last().map(|n| n.message.as_str()),
            Some("integration notification")
        );
    });
}
