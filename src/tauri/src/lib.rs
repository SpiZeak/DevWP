pub mod docker;
pub mod settings;
pub mod site;
pub mod system;
pub mod utils;
pub mod wp_cli;
pub mod xdebug;

use crate::docker::{BuildState, BuildStatusPayload, DockerLogPayload, DockerStatusPayload};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_log::log::{error, info, LevelFilter};
use utils::run_command;
use utils::run_command_streaming;

/// Recursively copy `src` into `dst`, skipping any entry that already exists at the destination.
fn copy_dir_if_missing(src: &Path, dst: &Path) {
    if let Err(e) = fs::create_dir_all(dst) {
        error!("Failed to create directory {}: {}", dst.display(), e);
        return;
    }
    let entries = match fs::read_dir(src) {
        Ok(e) => e,
        Err(e) => {
            error!("Failed to read directory {}: {}", src.display(), e);
            return;
        }
    };
    for entry in entries.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        // Skip files/directories that already exist at the destination so
        // user customisations are preserved across app updates.
        if dst_path.exists() {
            continue;
        }
        if src_path.is_dir() {
            copy_dir_if_missing(&src_path, &dst_path);
        } else if let Err(e) = fs::copy(&src_path, &dst_path) {
            error!(
                "Failed to copy {} -> {}: {}",
                src_path.display(),
                dst_path.display(),
                e
            );
        }
    }
}

/// Copy bundled resources (compose.yml + config/) to `app_data_dir` if they are not already there.
fn ensure_resources_in_app_data(resource_dir: &Path, app_data_dir: &Path) {
    // Copy compose.yml
    let compose_src = resource_dir.join("compose.yml");
    let compose_dst = app_data_dir.join("compose.yml");
    if compose_src.exists() && !compose_dst.exists() {
        if let Err(e) = fs::copy(&compose_src, &compose_dst) {
            error!("Failed to copy compose.yml: {}", e);
        }
    }

    // Copy each config subdirectory that is listed under bundle.resources in
    // tauri.conf.json (nginx, php, mariadb). Existing directories are skipped
    // so user changes are not overwritten on subsequent launches.
    for dir_name in &["nginx", "php", "mariadb"] {
        let src = resource_dir.join("config").join(dir_name);
        let dst = app_data_dir.join("config").join(dir_name);
        if src.exists() && !dst.exists() {
            copy_dir_if_missing(&src, &dst);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            site::get_sites,
            site::create_site,
            site::delete_site,
            site::update_site,
            docker::get_container_status,
            docker::restart_container,
            docker::start_service,
            docker::stop_service,
            docker::get_build_status,
            xdebug::get_xdebug_status,
            xdebug::toggle_xdebug,
            settings::get_settings,
            settings::get_setting,
            settings::save_setting,
            settings::delete_setting,
            settings::get_webroot_path,
            settings::get_xdebug_enabled_setting,
            settings::pick_directory,
            system::get_log_dir,
            system::get_update_ready,
            system::install_update_now,
            system::open_external,
            system::open_directory,
            wp_cli::run_wp_cli,
            wp_cli::run_composer_update,
        ])
        .manage(BuildState(Mutex::new(HashMap::new())))
        .setup(|app| {
            // ----------------------------------------------------------------
            // Initialise the project root from the Tauri app-data directory.
            // On first run, bundled resources (compose.yml, config/) are copied
            // there so that Docker Compose can find them on any platform.
            // ----------------------------------------------------------------
            match app.path().app_data_dir() {
                Ok(app_data_dir) => {
                    if let Err(e) = fs::create_dir_all(&app_data_dir) {
                        error!("Failed to create app data dir: {}", e);
                    } else {
                        if let Ok(resource_dir) = app.path().resource_dir() {
                            ensure_resources_in_app_data(&resource_dir, &app_data_dir);
                        }
                        utils::init_project_root(app_data_dir);
                    }
                }
                Err(e) => error!("Failed to resolve app data dir: {}", e),
            }
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri::Emitter;
                info!("Starting Docker services...");

                // Mark all services as building before starting
                let startup_services = ["nginx", "php", "mariadb", "redis", "mailpit"];
                {
                    let build_state = app_handle.state::<BuildState>();
                    let mut map = build_state.0.lock().expect("build state mutex poisoned");
                    for svc in &startup_services {
                        map.insert(svc.to_string(), true);
                    }
                }
                for svc in &startup_services {
                    let _ = app_handle.emit(
                        "build-status",
                        BuildStatusPayload {
                            service_name: svc.to_string(),
                            status: "building".to_string(),
                        },
                    );
                }

                let _ = app_handle.emit(
                    "docker-status",
                    DockerStatusPayload {
                        status: "starting".to_string(),
                        message: "Starting services...".to_string(),
                    },
                );

                let app_for_log = app_handle.clone();
                let result = tauri::async_runtime::spawn_blocking(move || {
                    run_command_streaming(
                        "docker",
                        &["compose", "up", "-d", "nginx"],
                        move |line| {
                            let _ = app_for_log.emit(
                                "docker-log",
                                DockerLogPayload {
                                    service_name: "startup".to_string(),
                                    line,
                                },
                            );
                        },
                    )
                })
                .await;

                let result = match result {
                    Ok(inner) => inner,
                    Err(e) => Err(format!("Task join error: {e}")),
                };

                // Clear building state regardless of outcome
                {
                    let build_state = app_handle.state::<BuildState>();
                    let mut map = build_state.0.lock().expect("build state mutex poisoned");
                    map.clear();
                }

                match result {
                    Ok(_) => {
                        info!("Docker services started successfully.");
                        let _ = app_handle.emit(
                            "docker-status",
                            DockerStatusPayload {
                                status: "complete".to_string(),
                                message: "Services started".to_string(),
                            },
                        );
                        let _ = docker::get_container_status(app_handle.clone()).await;
                    }
                    Err(e) => {
                        error!("Failed to start Docker services: {}", e);
                        let _ = app_handle.emit(
                            "docker-status",
                            DockerStatusPayload {
                                status: "error".to_string(),
                                message: format!("Failed to start Docker services: {}", e),
                            },
                        );
                        let _ = docker::get_container_status(app_handle.clone()).await;
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Stop Docker services when the app is closed
                let app_handle = window.app_handle().clone();
                use tauri::Emitter;
                info!("Stopping Docker services...");
                let _ = app_handle.emit(
                    "docker-status",
                    DockerStatusPayload {
                        status: "stopping".to_string(),
                        message: "Stopping services...".to_string(),
                    },
                );
                let app_handle_for_blocking = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let result = tauri::async_runtime::spawn_blocking(move || {
                        run_command("docker", &["compose", "down"])
                    })
                    .await;

                    match result {
                        Ok(Ok(_)) => {
                            info!("Docker services stopped successfully.");
                            let _ = app_handle_for_blocking.emit(
                                "docker-status",
                                DockerStatusPayload {
                                    status: "stopped".to_string(),
                                    message: "Services stopped".to_string(),
                                },
                            );
                        }
                        Ok(Err(e)) => {
                            error!("Failed to stop Docker services: {}", e);
                            let _ = app_handle_for_blocking.emit(
                                "docker-status",
                                DockerStatusPayload {
                                    status: "error".to_string(),
                                    message: format!("Failed to stop Docker services: {}", e),
                                },
                            );
                        }
                        Err(e) => {
                            error!("Failed to stop Docker services: {}", e);
                            let _ = app_handle_for_blocking.emit(
                                "docker-status",
                                DockerStatusPayload {
                                    status: "error".to_string(),
                                    message: format!("Failed to stop Docker services: {}", e),
                                },
                            );
                        }
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
