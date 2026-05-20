pub mod docker;
pub mod settings;
pub mod site;
pub mod sonarqube;
pub mod system;
pub mod utils;
pub mod wp_cli;
pub mod xdebug;

use crate::docker::{BuildState, BuildStatusPayload, DockerLogPayload, DockerStatusPayload};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_log::log::{error, info, LevelFilter};
use utils::run_command;
use utils::run_command_streaming;

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
            sonarqube::scan_site_sonarqube,
            wp_cli::run_wp_cli,
            wp_cli::run_composer_update,
        ])
        .manage(BuildState(Mutex::new(HashMap::new())))
        .setup(|app| {
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
                let result = run_command("docker", &["compose", "down"]);
                match result {
                    Ok(_) => {
                        info!("Docker services stopped successfully.");
                        let _ = app_handle.emit(
                            "docker-status",
                            DockerStatusPayload {
                                status: "stopped".to_string(),
                                message: "Services stopped".to_string(),
                            },
                        );
                    }
                    Err(e) => {
                        error!("Failed to stop Docker services: {}", e);
                        let _ = app_handle.emit(
                            "docker-status",
                            DockerStatusPayload {
                                status: "error".to_string(),
                                message: format!("Failed to stop Docker services: {}", e),
                            },
                        );
                    }
                };
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
