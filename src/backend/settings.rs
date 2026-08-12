use crate::backend::utils::{default_webroot, ensure_state_root, OperationResult};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub fn settings_file() -> Result<PathBuf, String> {
    Ok(ensure_state_root()?.join("settings.json"))
}

pub fn read_settings() -> HashMap<String, String> {
    let path = match settings_file() {
        Ok(path) => path,
        Err(_) => return HashMap::new(),
    };

    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(settings) => settings,
            Err(_) => {
                let backup = path.with_extension("json.corrupt");
                let _ = fs::copy(&path, &backup);
                HashMap::new()
            }
        },
        Err(_) => HashMap::new(),
    }
}

pub fn write_settings(settings: &HashMap<String, String>) -> Result<(), String> {
    let path = settings_file()?;
    let content =
        serde_json::to_string_pretty(settings).map_err(|e| format!("Serialize settings: {e}"))?;
    fs::write(path, content).map_err(|e| format!("Write settings: {e}"))
}

pub fn get_webroot_from_settings() -> PathBuf {
    let settings = read_settings();
    settings
        .get("webroot_path")
        .map(PathBuf::from)
        .unwrap_or_else(default_webroot)
}

pub fn ensure_webroot_exists() -> Result<PathBuf, String> {
    let webroot = get_webroot_from_settings();
    fs::create_dir_all(&webroot).map_err(|e| format!("Failed to create webroot directory: {e}"))?;
    Ok(webroot)
}

pub fn get_setting(key: String) -> Option<String> {
    read_settings().get(&key).cloned()
}

pub fn save_setting(key: String, value: String) -> OperationResult {
    let mut settings = read_settings();
    settings.insert(key.clone(), value.clone());

    match write_settings(&settings) {
        Ok(_) => OperationResult {
            success: true,
            message: format!("Saved setting `{key}`"),
            error: None,
        },
        Err(error) => OperationResult {
            success: false,
            message: format!("Failed to save setting `{key}`"),
            error: Some(error),
        },
    }
}

pub fn delete_setting(key: String) -> OperationResult {
    let mut settings = read_settings();
    settings.remove(&key);

    match write_settings(&settings) {
        Ok(_) => OperationResult {
            success: true,
            message: format!("Deleted setting `{key}`"),
            error: None,
        },
        Err(error) => OperationResult {
            success: false,
            message: format!("Failed to delete setting `{key}`"),
            error: Some(error),
        },
    }
}

pub fn get_webroot_path() -> String {
    get_webroot_from_settings().to_string_lossy().to_string()
}

/// Open a directory picker. Must be called synchronously from the UI thread
/// (rfd's GTK backend panics when used off the main thread).
pub fn pick_directory(default_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();

    if let Some(path) = default_path {
        if Path::new(&path).exists() {
            dialog = dialog.set_directory(path);
        }
    }

    dialog
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}
