use crate::settings::{read_settings, write_settings};
use crate::utils::run_command;
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::Emitter;

pub const XDEBUG_CONFIG_PATH: &str = "config/php/conf.d/xdebug.ini";

#[derive(Debug, Clone, Serialize)]
pub struct XdebugStatusPayload {
    pub status: String,
    pub enabled: Option<bool>,
    pub message: Option<String>,
}

#[tauri::command]
pub fn get_xdebug_status() -> bool {
    let config_path = Path::new(XDEBUG_CONFIG_PATH);
    let content = match fs::read_to_string(config_path) {
        Ok(content) => content,
        Err(_) => return false,
    };

    let disabled = content.lines().any(|line| {
        let trimmed = line.trim();
        !trimmed.starts_with(';')
            && !trimmed.starts_with('#')
            && trimmed.eq_ignore_ascii_case("xdebug.mode = off")
    });

    let enabled = content.lines().any(|line| {
        let trimmed = line.trim().to_lowercase();
        !trimmed.starts_with(';')
            && !trimmed.starts_with('#')
            && trimmed.starts_with("xdebug.mode")
            && !trimmed.ends_with("off")
    });

    if disabled {
        return false;
    }

    enabled
}

#[tauri::command]
pub fn toggle_xdebug(app: tauri::AppHandle) -> Result<bool, String> {
    let target_enabled = !get_xdebug_status();
    let _ = app.emit(
        "xdebug-status",
        XdebugStatusPayload {
            status: "restarting".to_string(),
            enabled: Some(target_enabled),
            message: None,
        },
    );

    let config_path = Path::new(XDEBUG_CONFIG_PATH);
    let current = fs::read_to_string(config_path).unwrap_or_default();
    let mut lines: Vec<String> = current
        .lines()
        .filter(|line| !line.trim().starts_with("xdebug.mode"))
        .map(str::to_string)
        .collect();
    lines.push(if target_enabled {
        "xdebug.mode = develop,debug".to_string()
    } else {
        "xdebug.mode = off".to_string()
    });

    fs::write(config_path, format!("{}\n", lines.join("\n")))
        .map_err(|e| format!("Failed to update xdebug.ini: {e}"))?;

    let restart = run_command("docker", &["compose", "restart", "php"]);
    if let Err(error) = restart {
        let _ = app.emit(
            "xdebug-status",
            XdebugStatusPayload {
                status: "error".to_string(),
                enabled: Some(get_xdebug_status()),
                message: Some(error.clone()),
            },
        );
        return Err(error);
    }

    let final_status = get_xdebug_status();
    let _ = app.emit(
        "xdebug-status",
        XdebugStatusPayload {
            status: "complete".to_string(),
            enabled: Some(final_status),
            message: None,
        },
    );

    let mut settings = read_settings();
    settings.insert("xdebug_enabled".to_string(), final_status.to_string());
    let _ = write_settings(&settings);

    Ok(final_status)
}
