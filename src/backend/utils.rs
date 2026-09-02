use crate::state;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

pub const DOCKER_SITE_ROOT_PATH: &str = "/src/www";

/// Name of the state directory inside the project root (historical
/// Tauri-era name, kept so existing installs keep their state).
pub const STATE_DIR_NAME: &str = ".devwp-tauri";

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
    /// Monotonic id assigned by `state::push_notification`. The toast UI
    /// tracks this instead of the vec length, which stops moving new entries
    /// once the cap in `push_notification` starts draining old ones.
    #[serde(skip)]
    pub seq: u64,
}

/// Walk up from CWD until we find the directory containing `compose.yml`.
/// When launched via a symlinked install (e.g. `/usr/local/bin/devwp` →
/// `…/DevWP/target/release/devwp`) with CWD outside the checkout, CWD finds
/// nothing — so also walk up from the resolved executable path before
/// falling back to CWD.
/// Memoized: the checkout cannot move while the process is running, and this
/// walks the directory tree on every call from hot paths (config paths, state
/// files, command execution).
pub fn project_root() -> PathBuf {
    static ROOT: OnceLock<PathBuf> = OnceLock::new();
    ROOT.get_or_init(|| {
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        find_project_root(&cwd)
            .or_else(|| {
                std::env::current_exe()
                    .ok()
                    .and_then(|exe| find_project_root(&exe))
            })
            .unwrap_or(cwd)
    })
    .clone()
}

fn find_project_root(start: &std::path::Path) -> Option<PathBuf> {
    let mut dir = start.to_path_buf();
    loop {
        if dir.join("compose.yml").is_file() {
            return Some(dir);
        }
        dir = dir.parent()?.to_path_buf();
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
    project_root().join(STATE_DIR_NAME)
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

/// Read a JSON state file, falling back to `T::default()` when it is missing
/// or unreadable. A parse failure backs the file up next to itself as
/// `*.json.corrupt` (before any caller can overwrite it) and also yields the
/// default.
pub fn load_json_or_default<T: serde::de::DeserializeOwned + Default>(path: &Path) -> T {
    match fs::read_to_string(path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(value) => value,
            Err(_) => {
                let _ = fs::copy(path, path.with_extension("json.corrupt"));
                T::default()
            }
        },
        Err(_) => T::default(),
    }
}

/// Like [`load_json_or_default`], but a corrupt or unreadable file is an
/// error (after backing it up) instead of a silent reset to the default —
/// state files whose loss would destroy user data must use this.
pub fn load_json_or_report<T: serde::de::DeserializeOwned + Default>(
    path: &Path,
    what: &str,
) -> Result<T, String> {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).map_err(|e| {
            let _ = fs::copy(path, path.with_extension("json.corrupt"));
            format!(
                "Corrupt {what} file (backed up as {}.json.corrupt): {e}",
                path.display()
            )
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(T::default()),
        Err(e) => Err(format!("Failed to read {what} file: {e}")),
    }
}

/// Pretty-serialize `value` and write it to `path` atomically enough for the
/// small state files this app keeps (`what` names the file in error messages).
pub fn save_json<T: Serialize + ?Sized>(path: &Path, value: &T, what: &str) -> Result<(), String> {
    let content =
        serde_json::to_string_pretty(value).map_err(|e| format!("Serialize {what}: {e}"))?;
    fs::write(path, content).map_err(|e| format!("Write {what}: {e}"))
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
    use std::fs;

    #[test]
    fn default_webroot_ends_with_www() {
        assert!(default_webroot().to_string_lossy().ends_with("www"));
    }

    #[test]
    fn find_project_root_locates_compose_dir_from_descendant() {
        let base = std::env::temp_dir().join("devwp-utils-find-root");
        let nested = base.join("target").join("release");
        fs::create_dir_all(&nested).expect("create nested dir");
        fs::write(base.join("compose.yml"), "services: {}\n").expect("write compose.yml");

        // A path inside the tree resolves upward to the compose dir…
        assert_eq!(find_project_root(&nested), Some(base.clone()));
        // …and a sibling tree without compose.yml does not.
        let bare = std::env::temp_dir().join("devwp-utils-find-root-bare");
        fs::create_dir_all(&bare).expect("create bare dir");
        assert_eq!(find_project_root(&bare), None);

        fs::remove_dir_all(&base).ok();
        fs::remove_dir_all(&bare).ok();
    }

    #[test]
    fn strip_ansi_removes_escape_sequences() {
        use crate::state::strip_ansi;
        assert_eq!(strip_ansi("\u{1b}[31mred\u{1b}[0m"), "red");
        assert_eq!(strip_ansi("line1\r\nline\u{1b}[2K2"), "line1\nline2");
        assert_eq!(strip_ansi("plain"), "plain");
    }

    #[test]
    fn load_json_or_default_roundtrips_and_backs_up_corrupt() {
        let dir = std::env::temp_dir().join("devwp-utils-json");
        fs::create_dir_all(&dir).expect("create dir");
        let path = dir.join("state.json");

        // Missing file yields the default.
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(dir.join("state.json.corrupt"));
        assert_eq!(
            load_json_or_default::<Vec<String>>(&path),
            Vec::<String>::new()
        );

        // Roundtrip through save_json.
        save_json(&path, &vec!["a".to_string(), "b".to_string()], "test").expect("save");
        assert_eq!(
            load_json_or_default::<Vec<String>>(&path),
            vec!["a".to_string(), "b".to_string()]
        );

        // Corrupt content is backed up and yields the default.
        fs::write(&path, "{not json").expect("write corrupt");
        assert_eq!(
            load_json_or_default::<Vec<String>>(&path),
            Vec::<String>::new()
        );
        assert!(dir.join("state.json.corrupt").is_file());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_json_error_names_the_file() {
        let err = save_json(
            Path::new("/proc/definitely/not/writable.json"),
            &1usize,
            "widget",
        );
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("widget"));
    }
}
