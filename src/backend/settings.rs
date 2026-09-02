use crate::backend::utils::{
    default_webroot, ensure_state_root, load_json_or_default, save_json, OperationResult,
};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Serializes read-modify-write cycles on settings.json (mirrors
/// `site.rs::SITES_LOCK`) so concurrent saves cannot lose updates.
static SETTINGS_LOCK: Mutex<()> = Mutex::new(());

pub fn settings_file() -> Result<PathBuf, String> {
    Ok(ensure_state_root()?.join("settings.json"))
}

pub fn read_settings() -> HashMap<String, String> {
    match settings_file() {
        Ok(path) => load_json_or_default(&path),
        Err(_) => HashMap::new(),
    }
}

pub fn write_settings(settings: &HashMap<String, String>) -> Result<(), String> {
    save_json(&settings_file()?, settings, "settings")
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

pub fn get_setting(key: &str) -> Option<String> {
    read_settings().get(key).cloned()
}

pub fn save_setting(key: &str, value: &str) -> OperationResult {
    let _lock = SETTINGS_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut settings = read_settings();
    settings.insert(key.to_string(), value.to_string());

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

pub fn delete_setting(key: &str) -> OperationResult {
    let _lock = SETTINGS_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut settings = read_settings();
    settings.remove(key);

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
