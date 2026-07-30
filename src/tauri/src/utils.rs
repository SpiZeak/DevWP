use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;
use tauri::Emitter;

static PROJECT_ROOT: OnceLock<PathBuf> = OnceLock::new();

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

/// Set the project root once (called during app setup with the app data directory).
/// Subsequent calls are no-ops.
pub fn init_project_root(path: PathBuf) {
    PROJECT_ROOT.get_or_init(|| path);
}

/// Walk up from CWD until we find the directory containing `compose.yml`.
/// Falls back to CWD if not found.
pub fn project_root() -> PathBuf {
    // If the project root was initialized during app setup, use it.
    if let Some(root) = PROJECT_ROOT.get() {
        return root.clone();
    }

    // Fall back to the walk-up algorithm (used in development / tests).
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

pub fn state_root() -> PathBuf {
    project_root().join(".devwp-tauri")
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
        .current_dir(project_root())
        .output()
        .map_err(|e| format!("Failed to execute command `{command}`: {e}"))
}

/// Run a command and stream stdout/stderr line-by-line to the provided callback.
/// Returns `Ok(true)` if the process exits successfully, `Ok(false)` on non-zero exit.
pub fn run_command_streaming<F>(command: &str, args: &[&str], on_line: F) -> Result<bool, String>
where
    F: Fn(String) + Send + Sync + 'static,
{
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;
    use std::sync::Arc;

    let on_line = Arc::new(on_line);

    let mut child = Command::new(command)
        .args(args)
        .current_dir(project_root())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn `{command}`: {e}"))?;

    let stdout = child.stdout.take();
    let on_line_stdout = Arc::clone(&on_line);
    let stdout_thread = stdout.map(|stdout| {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(|l| l.ok()) {
                on_line_stdout(line);
            }
        })
    });

    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(|l| l.ok()) {
            on_line(line);
        }
    }

    if let Some(t) = stdout_thread {
        t.join().ok();
    }

    let status = child
        .wait()
        .map_err(|e| format!("Failed to wait for `{command}`: {e}"))?;

    Ok(status.success())
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
