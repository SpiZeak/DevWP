//! Application lifecycle: stack startup on launch and teardown on close.
//!
//! Startup orchestrates the compose stack directly through the Docker Engine
//! API (Bollard) — network/volumes, images (build php/nginx, pull the rest),
//! containers in `depends_on` order with health gates. Teardown stops and
//! removes the project's containers; volumes and the network are kept so data
//! survives and the next start is fast.
//!
//! Close interception pattern (Dioxus 0.7 has no prevent-close API):
//! the window starts with `WindowCloseBehaviour::WindowHides`. When the user
//! requests a close, [`request_shutdown`] runs the teardown in the
//! background and flips the shutdown-done signal; the UI component watching
//! that signal then switches the window to `WindowCloses` and closes it for
//! real. This guarantees teardown finishes before the process exits.

use crate::backend::compose::{self, ComposeFile};
use crate::backend::docker::{
    self, DockerStatus, DEPENDENCY_HEALTH_TIMEOUT, DEPENDENCY_RUNNING_TIMEOUT,
};
use crate::backend::utils;
use crate::state;
use std::path::Path;
use tracing::{error, info};

/// `docker compose up -d nginx` equivalent with build logging, mirroring the
/// previous app startup sequence. Called once from the UI on mount.
pub async fn start_services() {
    info!("Starting Docker services...");
    state::set_docker_status(DockerStatus::Starting, "Starting services...");

    let result = tokio::task::spawn_blocking(start_services_sync)
        .await
        .map_err(|e| format!("Task join error: {e}"))
        .and_then(|result| result);

    // Clear building state regardless of outcome
    state::clear_building();

    match result {
        Ok(()) => {
            info!("Docker services started successfully.");
            state::set_docker_status(DockerStatus::Complete, "Services started");
            refresh_container_status().await;
        }
        Err(e) => {
            error!("Failed to start Docker services: {}", e);
            state::set_docker_status(
                DockerStatus::Error,
                format!("Failed to start Docker services: {e}"),
            );
            refresh_container_status().await;
        }
    }
}

/// Refresh the cached container list from a blocking thread — the sync
/// `get_container_status` drives its own tokio runtime, which cannot be
/// created on a thread that is already inside one.
async fn refresh_container_status() {
    let _ = tokio::task::spawn_blocking(docker::get_container_status).await;
}

/// Bring the stack up through the Docker Engine API (Bollard), shared by the
/// GUI lifecycle and the headless CLI so both start the exact same stack.
pub fn start_services_sync() -> Result<(), String> {
    let compose = compose::load_compose()?;
    let order = compose.service_order()?;

    // Mark every service as building before doing any work — the Services
    // panel shows a placeholder card with a spinner while this runs.
    for service in &order {
        state::mark_service_building(service, true);
    }

    ensure_runtime_bind_dirs(&compose)?;

    docker::docker_block_on(async {
        let client = docker::stack_client()?;
        docker::require_daemon(&client).await?;
        start_stack(&client, &compose, &order).await
    })?
}

/// Bring the stack up: shared resources first, then each service in
/// dependency order (gate on dependency health before starting dependents).
async fn start_stack(
    client: &bollard::Docker,
    compose: &ComposeFile,
    order: &[String],
) -> Result<(), String> {
    docker::ensure_network(client).await?;
    docker::ensure_volumes(client, &compose.volume_names()).await?;

    for service in order {
        let config = &compose.services[service];

        // Dependencies precede us in topo order; wait for their condition.
        for dep in config.dependency_names() {
            let dep_container = compose.services[dep].container_id(dep);
            if config.requires_healthy(dep) {
                docker::wait_for_health(client, &dep_container, DEPENDENCY_HEALTH_TIMEOUT).await?;
            } else {
                docker::wait_for_running(client, &dep_container, DEPENDENCY_RUNNING_TIMEOUT)
                    .await?;
            }
        }

        let image = config.image_ref(service);
        if config.build.is_some() {
            // compose builds only when the image is absent; it never rebuilds
            // an existing tag on plain `up`.
            if !docker::image_exists(client, &image).await? {
                docker::build_image(client, service, &image, config).await?;
            }
        } else {
            docker::ensure_image(client, &image, service).await?;
        }

        docker::ensure_service_container(client, service, config, &image).await?;
    }

    Ok(())
}

/// Create bind-mount host directories that are not checked into the repo
/// (gitignored runtime dirs, webroot). The Docker daemon would create them
/// as root on first mount, which breaks later host-side writes.
fn ensure_runtime_bind_dirs(compose: &ComposeFile) -> Result<(), String> {
    let project = utils::project_root();
    for dir in [
        "config/certs",
        "config/nginx/sites-enabled",
        "config/mariadb/files",
    ] {
        std::fs::create_dir_all(project.join(dir))
            .map_err(|e| format!("Failed to create `{dir}`: {e}"))?;
    }
    for config in compose.services.values() {
        for bind in config.binds()? {
            let Some((host, _rest)) = bind.split_once(':') else {
                continue;
            };
            // Only directory mounts we know compose would auto-create; file
            // mounts (nginx.conf, php.ini, …) are tracked and must exist.
            if bind.contains(":/src/www") && !Path::new(host).exists() {
                std::fs::create_dir_all(host)
                    .map_err(|e| format!("Failed to create webroot `{host}`: {e}"))?;
            }
        }
    }
    Ok(())
}

/// Stop and remove the project's containers when the app is asked to close.
/// `window` is used to finalise the close on the UI thread via
/// [`shutdown_done`]: the UI hook that observes it performs the real close.
pub async fn stop_services() {
    info!("Stopping Docker services...");
    state::set_docker_status(DockerStatus::Stopping, "Stopping services...");

    let result = tokio::task::spawn_blocking(stop_services_sync)
        .await
        .map_err(|e| format!("Task join error: {e}"))
        .and_then(|result| result);

    match result {
        Ok(()) => {
            info!("Docker services stopped successfully.");
            state::set_docker_status(DockerStatus::Stopped, "Services stopped");
        }
        Err(e) => {
            error!("Failed to stop Docker services: {}", e);
            state::set_docker_status(
                DockerStatus::Error,
                format!("Failed to stop Docker services: {e}"),
            );
        }
    }

    state::set_shutdown_done(true);
}

/// Stop and remove the project's containers through the Docker Engine API
/// (Bollard), shared by the GUI teardown and the headless CLI.
pub fn stop_services_sync() -> Result<(), String> {
    docker::docker_block_on(async {
        let client = docker::stack_client()?;
        docker::require_daemon(&client).await?;
        docker::stop_project_containers(&client).await
    })?
}
