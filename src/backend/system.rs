use crate::backend::utils::{open_target, OperationResult};

/// Update stubs — the Tauri updater was never wired up, and the Dioxus
/// migration keeps the same behaviour. Uptick (the update framework under
/// consideration) is out of scope for this migration.
pub fn get_update_ready() -> bool {
    false
}

pub fn install_update_now() -> OperationResult {
    OperationResult {
        success: false,
        message: "Updates are not yet implemented.".to_string(),
        error: Some("Updater integration pending".to_string()),
    }
}

pub fn open_external(url: String) -> Result<(), String> {
    open_target(&url)
}

pub fn open_directory(path: String) -> Result<(), String> {
    open_target(&path)
}
