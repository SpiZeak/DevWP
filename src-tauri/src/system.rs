use crate::utils::{logs_dir, open_target, OperationResult};

#[tauri::command]
pub fn get_log_dir() -> Result<String, String> {
    Ok(logs_dir()?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_update_ready() -> bool {
    false
}

#[tauri::command]
pub fn install_update_now() -> OperationResult {
    OperationResult {
        success: false,
        message: "Updates are not yet implemented in the Tauri migration.".to_string(),
        error: Some("Updater integration pending".to_string()),
    }
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    open_target(&url)
}

#[tauri::command]
pub fn open_directory(path: String) -> Result<(), String> {
    open_target(&path)
}
