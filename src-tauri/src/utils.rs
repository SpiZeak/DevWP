use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::Emitter;

pub const DOCKER_SITE_ROOT_PATH: &str = "/src/www";

#[derive(Debug, Clone, Serialize)]
pub struct OperationResult {
    pub success: bool,
    pub message: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotificationPayload {
    #[serde(rename = "type")]
    pub notification_type: String,
    pub message: String,
}

pub fn state_root() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".devwp-tauri")
}

pub fn ensure_state_root() -> Result<PathBuf, String> {
    let root = state_root();
    fs::create_dir_all(&root).map_err(|e| format!("Failed to create state directory: {e}"))?;
    Ok(root)
}

pub fn logs_dir() -> Result<PathBuf, String> {
    let dir = ensure_state_root()?.join("logs");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create logs directory: {e}"))?;
    Ok(dir)
}

pub fn home_dir() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home);
    }

    if let Some(user_profile) = std::env::var_os("USERPROFILE") {
        return PathBuf::from(user_profile);
    }

    PathBuf::from(".")
}

pub fn default_webroot() -> PathBuf {
    home_dir().join("www")
}

pub fn run_command(command: &str, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new(command)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute command `{command}`: {e}"))
}

pub fn emit_notification(
    app: &tauri::AppHandle,
    notification_type: &str,
    message: impl Into<String>,
) {
    let _ = app.emit(
        "notification",
        NotificationPayload {
            notification_type: notification_type.to_string(),
            message: message.into(),
        },
    );
}

pub fn open_target(target: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", target]);
        c
    };

    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(target);
        c
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(target);
        c
    };

    cmd.spawn()
        .map_err(|e| format!("Failed to open `{target}`: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_webroot_ends_with_www() {
        assert!(default_webroot().to_string_lossy().ends_with("www"));
    }
}
