//! Application lifecycle: compose-up on launch and compose-down on close.
//!
//! Close interception pattern (Dioxus 0.7 has no prevent-close API):
//! the window starts with `WindowCloseBehaviour::WindowHides`. When the user
//! requests a close, [`request_shutdown`] runs `docker compose down` in the
//! background and flips the shutdown-done signal; the UI component watching
//! that signal then switches the window to `WindowCloses` and closes it for
//! real. This guarantees compose-down finishes before the process exits.

use crate::backend::docker;
use crate::backend::utils::{run_command, run_command_streaming};
use crate::state;
use tracing::{error, info};

const STARTUP_SERVICES: &[&str] = &["nginx", "php", "mariadb", "redis", "mailpit"];

/// `docker compose up -d nginx` with build logging, mirroring the previous
/// app startup sequence. Called once from the UI on mount.
pub async fn start_services() {
    info!("Starting Docker services...");

    // Mark all services as building before starting
    for svc in STARTUP_SERVICES {
        state::mark_service_building(*svc, true);
    }
    state::set_docker_status("starting", "Starting services...");

    let result = tokio::task::spawn_blocking(move || {
        run_command_streaming("docker", &["compose", "up", "-d", "nginx"], move |line| {
            state::push_build_log("startup", &line);
        })
    })
    .await;

    let result = match result {
        Ok(inner) => inner,
        Err(e) => Err(format!("Task join error: {e}")),
    };

    // Clear building state regardless of outcome
    state::clear_building();

    match result {
        Ok(_) => {
            info!("Docker services started successfully.");
            state::set_docker_status("complete", "Services started");
            let _ = docker::get_container_status();
        }
        Err(e) => {
            error!("Failed to start Docker services: {}", e);
            state::set_docker_status("error", format!("Failed to start Docker services: {e}"));
            let _ = docker::get_container_status();
        }
    }
}

/// Run `docker compose down` when the app is asked to close.
/// `window` is used to finalise the close on the UI thread via
/// [`shutdown_done`]: the UI hook that observes it performs the real close.
pub async fn stop_services() {
    info!("Stopping Docker services...");
    state::set_docker_status("stopping", "Stopping services...");

    let result =
        tokio::task::spawn_blocking(move || run_command("docker", &["compose", "down"])).await;

    match result {
        Ok(Ok(_)) => {
            info!("Docker services stopped successfully.");
            state::set_docker_status("stopped", "Services stopped");
        }
        Ok(Err(e)) => {
            error!("Failed to stop Docker services: {}", e);
            state::set_docker_status("error", format!("Failed to stop Docker services: {e}"));
        }
        Err(e) => {
            error!("Failed to stop Docker services: {}", e);
            state::set_docker_status("error", format!("Failed to stop Docker services: {e}"));
        }
    }

    state::set_shutdown_done(true);
}
