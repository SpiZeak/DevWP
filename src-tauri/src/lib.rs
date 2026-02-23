use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Site {
    name: String,
    path: String,
    url: String,
    status: String,
    aliases: Option<String>,
    web_root: Option<String>,
}

#[derive(Debug, Serialize)]
struct OperationResult {
    success: bool,
    message: String,
}

#[derive(Debug, Serialize)]
struct ScanResult {
    success: bool,
    error: Option<String>,
}

#[tauri::command]
fn get_sites() -> Vec<Site> {
    Vec::new()
}

#[tauri::command]
fn get_log_dir() -> String {
    String::new()
}

#[tauri::command]
fn create_site(_site: serde_json::Value) {}

#[tauri::command]
fn delete_site(_site: serde_json::Value) {}

#[tauri::command]
fn update_site(_site: serde_json::Value, _data: serde_json::Value) {}

#[tauri::command]
fn get_container_status() {}

#[tauri::command]
fn restart_container(_container_id: String) {}

#[tauri::command]
fn get_xdebug_status() -> bool {
    false
}

#[tauri::command]
fn toggle_xdebug() -> bool {
    false
}

#[tauri::command]
fn get_settings() -> std::collections::HashMap<String, String> {
    std::collections::HashMap::new()
}

#[tauri::command]
fn get_setting(_key: String) -> Option<String> {
    None
}

#[tauri::command]
fn save_setting(_key: String, _value: String) -> OperationResult {
    OperationResult {
        success: true,
        message: String::from("ok"),
    }
}

#[tauri::command]
fn delete_setting(_key: String) -> OperationResult {
    OperationResult {
        success: true,
        message: String::from("ok"),
    }
}

#[tauri::command]
fn get_webroot_path() -> String {
    String::new()
}

#[tauri::command]
fn get_xdebug_enabled_setting() -> bool {
    false
}

#[tauri::command]
fn pick_directory(_default_path: Option<String>) -> Option<String> {
    None
}

#[tauri::command]
fn get_update_ready() -> bool {
    false
}

#[tauri::command]
fn install_update_now() -> OperationResult {
    OperationResult {
        success: false,
        message: String::from("Updater not implemented in this migration pass"),
    }
}

#[tauri::command]
fn open_external(_url: String) {}

#[tauri::command]
fn open_directory(_path: String) {}

#[tauri::command]
fn scan_site_sonarqube(_site_name: String) -> ScanResult {
    ScanResult {
        success: false,
        error: Some(String::from("SonarQube scan command not implemented yet")),
    }
}

#[tauri::command]
fn run_wp_cli(_request: serde_json::Value) {}

#[tauri::command]
fn start_service(_service_name: String) {}

#[tauri::command]
fn stop_service(_service_name: String) {}

#[tauri::command]
fn get_status(_service_name: Option<String>) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_sites,
            get_log_dir,
            create_site,
            delete_site,
            update_site,
            get_container_status,
            restart_container,
            get_xdebug_status,
            toggle_xdebug,
            get_settings,
            get_setting,
            save_setting,
            delete_setting,
            get_webroot_path,
            get_xdebug_enabled_setting,
            pick_directory,
            get_update_ready,
            install_update_now,
            open_external,
            open_directory,
            scan_site_sonarqube,
            run_wp_cli,
            start_service,
            stop_service,
            get_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_sites_defaults_to_empty_collection() {
        assert!(get_sites().is_empty());
    }
}
