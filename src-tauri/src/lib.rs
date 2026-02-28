pub mod docker;
pub mod settings;
pub mod site;
pub mod sonarqube;
pub mod system;
pub mod utils;
pub mod wp_cli;
pub mod xdebug;

use tauri_plugin_log::log::{error, info, LevelFilter};
use utils::run_command;

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
            docker::get_status,
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
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri::Emitter;
                tauri_plugin_log::log::info!("Starting Docker services...");
                let _ = app_handle.emit("docker-status", crate::docker::DockerStatusPayload {
                    status: "starting".to_string(),
                    message: "Starting core services...".to_string(),
                });

                let result = run_command("docker", &["compose", "up", "-d", "nginx"]);
                match result {
                    Ok(_) => {
                        tauri_plugin_log::log::info!("Docker services started successfully.");
                        let _ = app_handle.emit("docker-status", crate::docker::DockerStatusPayload {
                            status: "complete".to_string(),
                            message: "Core services started".to_string(),
                        });
                    },
                    Err(e) => {
                        tauri_plugin_log::log::error!("Failed to start Docker services: {}", e);
                        let _ = app_handle.emit("docker-status", crate::docker::DockerStatusPayload {
                            status: "error".to_string(),
                            message: format!("Failed to start Docker services: {}", e),
                        });
                    },
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
