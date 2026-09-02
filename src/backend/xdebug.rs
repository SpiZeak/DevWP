use crate::backend::docker;
use crate::backend::settings::{read_settings, write_settings};
use crate::backend::utils::{emit_notification, project_root, NotificationType};
use crate::state;
use std::fs;
use std::path::PathBuf;
use tracing::warn;

pub fn xdebug_config_path() -> PathBuf {
    project_root().join("config/php/conf.d/xdebug.ini")
}

/// Parse `xdebug.mode` from an ini file body: `Some(true)` when an active
/// (non-commented) `xdebug.mode` line enables it, `Some(false)` when it is
/// `off`, `None` when no active line exists.
pub fn parse_xdebug_mode(content: &str) -> Option<bool> {
    let mut found = false;
    let mut enabled = false;

    for line in content.lines() {
        let trimmed = line.trim().to_lowercase();
        if trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }

        if trimmed.starts_with("xdebug.mode") {
            if let Some((key, value)) = trimmed.split_once('=') {
                if key.trim() == "xdebug.mode" {
                    let mode = value.trim();
                    found = true;
                    enabled = mode != "off" && !mode.is_empty();
                }
            }
        }
    }

    found.then_some(enabled)
}

/// Fallback to the persisted setting when the ini carries no mode line.
fn xdebug_setting_fallback() -> bool {
    read_settings()
        .get("xdebug_enabled")
        .map(|v| v == "true")
        .unwrap_or(false)
}

pub fn get_xdebug_status() -> bool {
    let content = match fs::read_to_string(xdebug_config_path()) {
        Ok(content) => content,
        Err(_) => return xdebug_setting_fallback(),
    };
    parse_xdebug_mode(&content).unwrap_or_else(xdebug_setting_fallback)
}

/// Flip Xdebug to the opposite of its current state (GUI switch).
pub async fn toggle_xdebug() -> Result<bool, String> {
    set_xdebug(!get_xdebug_status()).await
}

/// Enable or disable Xdebug by writing `xdebug.mode` in the mounted ini and
/// restarting the php service. The CLI calls this directly so `on`/`off` are
/// idempotent rather than blind toggles.
pub async fn set_xdebug(target_enabled: bool) -> Result<bool, String> {
    state::set_xdebug_toggling(true);
    state::set_xdebug_enabled(Some(target_enabled));

    let config_path = xdebug_config_path();
    let current = fs::read_to_string(&config_path).unwrap_or_default();
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

    fs::write(config_path, format!("{}\n", lines.join("\n"))).map_err(|e| {
        state::set_xdebug_toggling(false);
        state::set_xdebug_enabled(Some(get_xdebug_status()));
        format!("Failed to update xdebug.ini: {e}")
    })?;

    // Restart php through the Docker API so the ini change takes effect
    // (`docker compose restart php` equivalent — the fixed container name).
    let restart =
        docker::restart_container(crate::backend::wp_cli::PHP_CONTAINER_NAME.to_string()).await;

    let restart_failed = restart.err();
    if let Some(error) = restart_failed {
        state::set_xdebug_toggling(false);
        state::set_xdebug_enabled(Some(get_xdebug_status()));
        emit_notification(
            NotificationType::Error,
            format!("Xdebug toggle failed: {error}"),
        );
        return Err(error);
    }

    let final_status = target_enabled;
    state::set_xdebug_toggling(false);
    state::set_xdebug_enabled(Some(final_status));

    let mut settings = read_settings();
    settings.insert("xdebug_enabled".to_string(), final_status.to_string());
    if let Err(error) = write_settings(&settings) {
        warn!("Failed to persist xdebug_enabled setting: {error}");
    }

    Ok(final_status)
}

#[cfg(test)]
mod tests {
    use super::parse_xdebug_mode;

    #[test]
    fn parse_xdebug_mode_reads_active_line() {
        assert_eq!(
            parse_xdebug_mode("xdebug.mode = develop,debug\n"),
            Some(true)
        );
        assert_eq!(parse_xdebug_mode("xdebug.mode=off\n"), Some(false));
        assert_eq!(parse_xdebug_mode("xdebug.mode =\n"), Some(false));
    }

    #[test]
    fn parse_xdebug_mode_ignores_comments_and_wrong_keys() {
        assert_eq!(parse_xdebug_mode("; xdebug.mode = develop\n"), None);
        assert_eq!(parse_xdebug_mode("# xdebug.mode = develop\n"), None);
        assert_eq!(parse_xdebug_mode("xdebug.modez = develop\n"), None);
        assert_eq!(parse_xdebug_mode("zend_extension=xdebug.so\n"), None);
    }

    #[test]
    fn parse_xdebug_mode_last_active_line_wins() {
        assert_eq!(
            parse_xdebug_mode("xdebug.mode = develop\nxdebug.mode = off\n"),
            Some(false)
        );
    }
}
