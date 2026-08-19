use crate::state;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};

pub const DOCKER_SITE_ROOT_PATH: &str = "/src/www";

/// Database credentials — must match `MARIADB_ROOT_PASSWORD` in `compose.yml`.
pub const DB_ROOT_USER: &str = "root";
pub const DB_ROOT_PASSWORD: &str = "root";
pub const DB_HOST: &str = "devwp_mariadb";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationType {
    Success,
    Error,
    Warning,
    Info,
    #[serde(other)]
    Unknown,
}

impl std::fmt::Display for NotificationType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Success => "success",
            Self::Error => "error",
            Self::Warning => "warning",
            Self::Info => "info",
            Self::Unknown => "unknown",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OperationResult {
    pub success: bool,
    pub message: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct NotificationPayload {
    #[serde(rename = "type")]
    pub notification_type: NotificationType,
    pub message: String,
}

/// Walk up from CWD until we find the directory containing `compose.yml`.
/// Falls back to CWD if not found.
pub fn project_root() -> PathBuf {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut dir = cwd.clone();
    loop {
        if dir.join("compose.yml").exists() {
            return dir;
        }
        match dir.parent() {
            Some(parent) => dir = parent.to_path_buf(),
            None => return cwd,
        }
    }
}

static TEST_MODE: AtomicBool = AtomicBool::new(false);

pub fn set_test_mode(enabled: bool) {
    TEST_MODE.store(enabled, Ordering::SeqCst);
}

/// Headless (CLI) mode. Set when the binary is invoked with a subcommand
/// instead of launching the GUI; background jobs (certificate regeneration)
/// must then run inline so the process cannot exit before they finish.
static HEADLESS_MODE: AtomicBool = AtomicBool::new(false);

pub fn set_headless_mode(enabled: bool) {
    HEADLESS_MODE.store(enabled, Ordering::SeqCst);
}

pub fn headless_mode() -> bool {
    HEADLESS_MODE.load(Ordering::SeqCst)
}

/// State directory. In test mode the state is redirected to a temp dir so
/// integration tests never touch the developer's real state.
pub fn state_root() -> PathBuf {
    if TEST_MODE.load(Ordering::SeqCst) {
        return std::env::temp_dir().join("devwp-test-state");
    }
    project_root().join(".devwp-tauri")
}

pub fn ensure_state_root() -> Result<PathBuf, String> {
    let root = state_root();
    fs::create_dir_all(&root).map_err(|e| format!("Failed to create state directory: {e}"))?;
    Ok(root)
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

/// Run a command in the project root and capture its output. Only used for
/// host tooling that has no Docker Engine API equivalent (mkcert).
pub fn run_command(command: &str, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new(command)
        .args(args)
        .current_dir(project_root())
        .output()
        .map_err(|e| format!("Failed to execute command `{command}`: {e}"))
}

/// Push a notification; safe from any thread.
pub fn emit_notification(notification_type: NotificationType, message: impl Into<String>) {
    state::push_notification(notification_type, message);
}

/// `open_target` hands the target to `cmd /C start` on Windows (which
/// re-parses the string) and to `xdg-open`/`open` elsewhere — reject
/// metacharacters so renderer-supplied values can never inject commands.
fn is_safe_target(target: &str) -> bool {
    !target.chars().any(|c| {
        c.is_control()
            || matches!(
                c,
                '&' | '|' | '>' | '<' | '^' | '%' | '!' | '\'' | '"' | '`' | '$' | '(' | ')'
            )
    })
}

pub fn open_target(target: &str) -> Result<(), String> {
    if !is_safe_target(target) {
        return Err(format!("Unsafe characters in target: `{target}`"));
    }

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

    #[test]
    fn strip_ansi_removes_escape_sequences() {
        use crate::state::strip_ansi;
        assert_eq!(strip_ansi("\u{1b}[31mred\u{1b}[0m"), "red");
        assert_eq!(strip_ansi("line1\r\nline\u{1b}[2K2"), "line1\nline2");
        assert_eq!(strip_ansi("plain"), "plain");
    }
}
