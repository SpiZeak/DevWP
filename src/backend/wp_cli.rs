use crate::backend::docker::{exec_in_container, ExecOptions};
use crate::backend::site::{validate_site_name, Site};
use crate::backend::utils::{
    ensure_state_root, load_json_or_default, save_json, DOCKER_SITE_ROOT_PATH,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

pub const WP_CLI_ERROR_REPORTING: &str = "error_reporting=E_ALL & ~E_DEPRECATED & ~E_WARNING";
pub const PHP_CONTAINER_NAME: &str = "devwp_php";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WpCliRequest {
    pub site: Site,
    pub command: String,
}

/// Full argv (without the container name) for a wp-cli invocation inside the
/// php container.
fn wp_cli_argv(extra: &[String]) -> Vec<String> {
    let mut argv = vec![
        "php".to_string(),
        "-d".to_string(),
        WP_CLI_ERROR_REPORTING.to_string(),
        "/usr/local/bin/wp".to_string(),
    ];
    argv.extend(extra.iter().cloned());
    argv
}

/// Whether a wp-cli command is side-effect free, so re-running it with
/// `--debug` (to flush WP-CLI's buffered error output) can never duplicate a
/// partial mutation. Global flags (`--url=…`, `--skip-plugins`, …) precede
/// the verb and are skipped.
fn is_read_only_wp_command(wp_args: &[String]) -> bool {
    let mut args = wp_args.iter().skip_while(|a| a.starts_with('-'));
    match (args.next(), args.next()) {
        (Some(cmd), _) if cmd == "cli" => true,
        (Some(cmd), Some(sub)) if cmd == "core" && (sub == "version" || sub == "is-installed") => {
            true
        }
        _ => wp_args.len() == 1 && (wp_args[0] == "--info" || wp_args[0] == "--version"),
    }
}

/// WP-CLI's exception handler buffers its output and may never flush it when the
/// process has produced no prior output (a known WP-CLI + piped-stream issue).
/// If both stdout and stderr are empty on a non-zero exit we re-run read-only
/// commands with `--debug` which forces the buffer to flush, then strip the
/// noisy debug lines so only the actual error is returned. The retry reuses
/// `opts` so it runs in the same working directory (otherwise wp-cli reports
/// "not a WordPress install" instead of the real error). Mutating commands are
/// never re-run — a partial side effect must not be duplicated.
fn extract_error(stdout: &str, stderr: &str, wp_args: &[String], opts: &ExecOptions) -> String {
    if !stderr.is_empty() {
        return stderr.to_string();
    }
    if !stdout.is_empty() {
        return stdout.to_string();
    }

    if !is_read_only_wp_command(wp_args) {
        return "WP-CLI command failed with no output".to_string();
    }

    // Both empty – retry with --debug to flush WP-CLI's internal output buffer.
    let mut debug_args = wp_args.to_vec();
    debug_args.push("--debug".to_string());
    let argv = wp_cli_argv(&debug_args);
    let cmd_refs: Vec<&str> = argv.iter().map(|s| s.as_str()).collect();

    if let Ok(output) = exec_in_container(PHP_CONTAINER_NAME, &cmd_refs, opts) {
        let meaningful: Vec<&str> = output
            .stderr
            .lines()
            .chain(output.stdout.lines())
            .filter(|line| !line.starts_with("Debug ("))
            .collect();

        if !meaningful.is_empty() {
            return meaningful.join("\n");
        }
    }

    "WP-CLI command failed with no output".to_string()
}

/// The container working directory for a site, honoring its web root.
pub fn container_work_dir(site: &Site) -> Result<String, String> {
    let site_name = validate_site_name(&site.name)?;
    Ok(if let Some(web_root) = site.web_root.as_deref() {
        format!("{}/{}/{}", DOCKER_SITE_ROOT_PATH, site_name, web_root)
    } else {
        format!("{}/{}", DOCKER_SITE_ROOT_PATH, site_name)
    })
}

pub async fn run_composer_update(site: Site) -> Result<serde_json::Value, String> {
    let work_dir = container_work_dir(&site)?;

    // Read the host's composer auth.json so private-package credentials are
    // available inside the container without requiring an interactive prompt.
    // The secret is passed via the exec environment (it travels over the
    // Docker API socket), never through a child process's argv.
    let composer_auth = {
        let home = crate::backend::utils::home_dir();
        let xdg = home.join(".config/composer/auth.json");
        let legacy = home.join(".composer/auth.json");
        std::fs::read_to_string(&xdg)
            .or_else(|_| std::fs::read_to_string(&legacy))
            .ok()
    };

    let result = tokio::task::spawn_blocking(move || {
        let env = composer_auth
            .map(|auth| vec![format!("COMPOSER_AUTH={auth}")])
            .unwrap_or_default();
        exec_in_container(
            PHP_CONTAINER_NAME,
            &["composer", "update"],
            &ExecOptions {
                working_dir: Some(work_dir),
                env,
            },
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;

    let output = result?;
    let success = output.success();
    let stdout = output.stdout;
    let stderr = output.stderr;

    if success {
        Ok(serde_json::json!({
            "success": true,
            "output": stdout,
            "error": stderr
        }))
    } else {
        let error = if !stderr.is_empty() { stderr } else { stdout };
        Ok(serde_json::json!({
            "success": false,
            "output": "",
            "error": error
        }))
    }
}

pub async fn run_wp_cli(request: WpCliRequest) -> Result<serde_json::Value, String> {
    let work_dir = container_work_dir(&request.site)?;

    let cmd_parts: Vec<String> =
        shell_words::split(&request.command).map_err(|e| format!("Invalid command: {e}"))?;
    let opts = ExecOptions {
        working_dir: Some(work_dir.clone()),
        env: Vec::new(),
    };
    let history_site = request.site.name.clone();
    let history_command = request.command.clone();

    tokio::task::spawn_blocking(move || {
        // Record the attempt before exec: shell-style history keeps failed
        // commands too, and this one path covers both the GUI modal and
        // `devwp wp`.
        record_history(&history_site, &history_command);
        let argv = wp_cli_argv(&cmd_parts);
        let cmd_refs: Vec<&str> = argv.iter().map(|s| s.as_str()).collect();
        let output = exec_in_container(PHP_CONTAINER_NAME, &cmd_refs, &opts)?;
        let success = output.success();
        let stdout = output.stdout;
        let stderr = output.stderr;

        if success {
            Ok(serde_json::json!({
                "success": true,
                "output": stdout,
                "error": stderr
            }))
        } else {
            let error = extract_error(&stdout, &stderr, &cmd_parts, &opts);
            Ok(serde_json::json!({
                "success": false,
                "output": stdout,
                "error": error
            }))
        }
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

// ── Command history ───────────────────────────────────────────

/// Number of commands retained in the history file (oldest dropped first).
pub const MAX_HISTORY_ENTRIES: usize = 100;

/// Serializes read-modify-write cycles on wp-cli-history.json (mirrors
/// `settings.rs::SETTINGS_LOCK`) so concurrent saves cannot lose updates.
static HISTORY_LOCK: Mutex<()> = Mutex::new(());

/// One previously run command, scoped to the site it ran against.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WpCliHistoryEntry {
    pub site: String,
    pub command: String,
}

pub fn history_file() -> Result<PathBuf, String> {
    Ok(ensure_state_root()?.join("wp-cli-history.json"))
}

/// Stored oldest → newest. A missing or corrupt file yields an empty
/// history (the corrupt copy is backed up by `load_json_or_default`).
pub fn load_history() -> Vec<WpCliHistoryEntry> {
    match history_file() {
        Ok(path) => load_json_or_default(&path),
        Err(_) => Vec::new(),
    }
}

/// Pure core of [`record_history`]: drop any earlier identical entry for the
/// site (re-running a command moves it to the newest slot instead of
/// duplicating it), append the new entry, and cap the list at
/// [`MAX_HISTORY_ENTRIES`].
fn push_history_entry(entries: &mut Vec<WpCliHistoryEntry>, site: &str, command: &str) {
    entries.retain(|e| !(e.site == site && e.command == command));
    entries.push(WpCliHistoryEntry {
        site: site.to_string(),
        command: command.to_string(),
    });
    let excess = entries.len().saturating_sub(MAX_HISTORY_ENTRIES);
    entries.drain(..excess);
}

/// Record a command run for `site`, persist it, and refresh the global
/// signal. Failures are logged, not fatal — history is a convenience.
pub fn record_history(site: &str, command: &str) {
    let _lock = HISTORY_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut history = load_history();
    push_history_entry(&mut history, site, command);
    persist_history(&history);
    crate::state::set_wp_cli_history(history);
}

/// Forget every recorded command for `site`; other sites keep theirs.
pub fn clear_history(site: &str) {
    let _lock = HISTORY_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut history = load_history();
    history.retain(|e| e.site != site);
    persist_history(&history);
    crate::state::set_wp_cli_history(history);
}

fn persist_history(history: &[WpCliHistoryEntry]) {
    if let Ok(path) = history_file() {
        if let Err(e) = save_json(&path, history, "wp-cli history") {
            tracing::warn!("Failed to save wp-cli history: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        is_read_only_wp_command, push_history_entry, WpCliHistoryEntry, MAX_HISTORY_ENTRIES,
    };

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    fn entry(site: &str, command: &str) -> WpCliHistoryEntry {
        WpCliHistoryEntry {
            site: site.to_string(),
            command: command.to_string(),
        }
    }

    #[test]
    fn read_only_commands_are_recognized() {
        assert!(is_read_only_wp_command(&args(&["cli", "info"])));
        assert!(is_read_only_wp_command(&args(&["cli", "version"])));
        assert!(is_read_only_wp_command(&args(&["--info"])));
        assert!(is_read_only_wp_command(&args(&["--version"])));
        assert!(is_read_only_wp_command(&args(&["core", "version"])));
        assert!(is_read_only_wp_command(&args(&["core", "is-installed"])));
        // Global flags before the verb are skipped.
        assert!(is_read_only_wp_command(&args(&[
            "--skip-plugins",
            "core",
            "version"
        ])));
    }

    #[test]
    fn mutating_commands_are_rejected() {
        assert!(!is_read_only_wp_command(&args(&[
            "plugin", "install", "akismet"
        ])));
        assert!(!is_read_only_wp_command(&args(&["post", "delete", "1"])));
        assert!(!is_read_only_wp_command(&args(&["core", "download"])));
        assert!(!is_read_only_wp_command(&args(&[
            "db", "query", "SELECT 1"
        ])));
        assert!(!is_read_only_wp_command(&args(&["eval", "echo 1;"])));
        assert!(!is_read_only_wp_command(&args(&[
            "search-replace",
            "a",
            "b"
        ])));
        assert!(!is_read_only_wp_command(&args(&[])));
    }

    #[test]
    fn history_push_moves_repeated_command_to_newest() {
        let mut history = Vec::new();
        push_history_entry(&mut history, "a.test", "plugin list");
        push_history_entry(&mut history, "a.test", "core version");
        // Same command for a different site is a separate entry.
        push_history_entry(&mut history, "b.test", "plugin list");
        push_history_entry(&mut history, "a.test", "plugin list");

        assert_eq!(
            history,
            vec![
                entry("a.test", "core version"),
                entry("b.test", "plugin list"),
                entry("a.test", "plugin list"),
            ]
        );
    }

    #[test]
    fn history_push_caps_the_list_dropping_oldest() {
        let mut history = Vec::new();
        for i in 0..MAX_HISTORY_ENTRIES + 5 {
            push_history_entry(&mut history, "a.test", &format!("cmd-{i}"));
        }

        assert_eq!(history.len(), MAX_HISTORY_ENTRIES);
        assert_eq!(history.first().map(|e| e.command.as_str()), Some("cmd-5"));
        let newest = format!("cmd-{}", MAX_HISTORY_ENTRIES + 4);
        assert_eq!(
            history.last().map(|e| e.command.as_str()),
            Some(newest.as_str())
        );
    }
}
