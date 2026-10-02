use crate::backend::docker::{
    exec_in_container, exec_in_container_streaming, require_containers_running_sync, ExecOptions,
};
use crate::backend::site::{validate_site_name, Site};
use crate::backend::utils::{
    ensure_state_root, load_json_or_default, save_json, NotificationType, DOCKER_SITE_ROOT_PATH,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

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

/// Parse a raw wp-cli command string into argv, tolerating (and stripping) a
/// leading `wp` token — users used to the `wp` shell binary naturally type
/// `wp plugin list`, which must not run as `wp wp plugin list`. Parsing first
/// means quoted arguments containing "wp" are left alone. An empty command
/// (or one that was only `wp`) is refused.
fn parse_wp_command(command: &str) -> Result<Vec<String>, String> {
    let mut parts = shell_words::split(command).map_err(|e| format!("Invalid command: {e}"))?;
    if parts.first().map(String::as_str) == Some("wp") {
        parts.remove(0);
    }
    if parts.is_empty() {
        return Err("Empty command".to_string());
    }
    Ok(parts)
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
            .filter(|line| !line.starts_with("Debug (") && !is_php_noise_line(line))
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

// ── PHP warning/deprecation filtering ─────────────────────────

/// Whether a line is PHP warning/deprecation noise (either PHP's own
/// `PHP Warning:` rendering or WP-CLI's bare `Warning:` form).
fn is_php_noise_line(line: &str) -> bool {
    let trimmed = line.trim_start();
    ["PHP Warning:", "PHP Deprecated:", "Warning:", "Deprecated:"]
        .iter()
        .any(|prefix| trimmed.starts_with(prefix))
}

/// Drop warning/deprecation lines from complete output text, preserving the
/// trailing newline if the input had one.
fn filter_php_noise(text: &str) -> String {
    let mut out: String = text
        .lines()
        .filter(|line| !is_php_noise_line(line))
        .collect::<Vec<&str>>()
        .join("\n");
    if text.ends_with('\n') && !out.is_empty() {
        out.push('\n');
    }
    out
}

/// Line-buffered [`filter_php_noise`] for streamed text: emits only complete
/// lines, buffering a trailing partial line until more text arrives or
/// [`PhpNoiseStreamFilter::flush`] runs. Chunk boundaries can split a line in
/// half, so streaming cannot filter per-chunk.
struct PhpNoiseStreamFilter {
    partial: String,
}

impl PhpNoiseStreamFilter {
    fn new() -> Self {
        Self {
            partial: String::new(),
        }
    }

    /// Buffer `text` and return the filtered complete lines it completed.
    fn push(&mut self, text: &str) -> String {
        self.partial.push_str(text);
        let Some(idx) = self.partial.rfind('\n') else {
            return String::new();
        };
        let mut complete = self.partial.split_off(idx + 1);
        std::mem::swap(&mut complete, &mut self.partial);
        complete
            .lines()
            .filter(|line| !is_php_noise_line(line))
            .map(|line| format!("{line}\n"))
            .collect()
    }

    /// Return the buffered partial line (empty if it is noise).
    fn flush(&mut self) -> String {
        let rest = std::mem::take(&mut self.partial);
        if is_php_noise_line(&rest) {
            String::new()
        } else {
            rest
        }
    }
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
        require_containers_running_sync(&[PHP_CONTAINER_NAME])?;
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

    let cmd_parts: Vec<String> = parse_wp_command(&request.command)?;
    let opts = ExecOptions {
        working_dir: Some(work_dir.clone()),
        env: Vec::new(),
    };
    let history_site = request.site.name.clone();
    let history_command = request.command.clone();

    tokio::task::spawn_blocking(move || {
        // Refuse before recording history: a refused command never ran and
        // must not pollute the shell-style history.
        require_containers_running_sync(&[PHP_CONTAINER_NAME])?;
        // Record the attempt before exec: shell-style history keeps failed
        // commands too, and this one path covers both the GUI modal and
        // `devwp wp`.
        record_history(&history_site, &history_command);
        let argv = wp_cli_argv(&cmd_parts);
        let cmd_refs: Vec<&str> = argv.iter().map(|s| s.as_str()).collect();
        let output = exec_in_container(PHP_CONTAINER_NAME, &cmd_refs, &opts)?;
        let success = output.success();
        let stdout = filter_php_noise(&output.stdout);
        let stderr = filter_php_noise(&output.stderr);

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

/// GUI variant of [`run_wp_cli`]: streams demuxed output through `on_output`
/// as it arrives (already warning/deprecation-filtered, line-buffered) and
/// honours `cancelled` — a set flag SIGTERMs (then SIGKILLs) the container
/// process and returns a `cancelled: true` result.
pub async fn run_wp_cli_interactive(
    request: WpCliRequest,
    cancelled: Arc<AtomicBool>,
    on_output: impl FnMut(&str, bool) + Send + 'static,
) -> Result<serde_json::Value, String> {
    let work_dir = container_work_dir(&request.site)?;

    let cmd_parts: Vec<String> = parse_wp_command(&request.command)?;
    let opts = ExecOptions {
        working_dir: Some(work_dir),
        env: Vec::new(),
    };
    let history_site = request.site.name.clone();
    let history_command = request.command.clone();

    tokio::task::spawn_blocking(move || {
        require_containers_running_sync(&[PHP_CONTAINER_NAME])?;
        record_history(&history_site, &history_command);
        let argv = wp_cli_argv(&cmd_parts);
        let cmd_refs: Vec<&str> = argv.iter().map(|s| s.as_str()).collect();
        let mut on_output = on_output;
        let mut stdout_filter = PhpNoiseStreamFilter::new();
        let mut stderr_filter = PhpNoiseStreamFilter::new();
        let result = exec_in_container_streaming(
            PHP_CONTAINER_NAME,
            &cmd_refs,
            &opts,
            &cancelled,
            &mut |text: &str, is_stderr: bool| {
                let filter = if is_stderr {
                    &mut stderr_filter
                } else {
                    &mut stdout_filter
                };
                let filtered = filter.push(text);
                if !filtered.is_empty() {
                    on_output(&filtered, is_stderr);
                }
            },
        )?;

        // Push any trailing unterminated line to the display; the result
        // below is built from the exec's complete captured text instead.
        let flush_stdout = stdout_filter.flush();
        if !flush_stdout.is_empty() {
            on_output(&flush_stdout, false);
        }
        let flush_stderr = stderr_filter.flush();
        if !flush_stderr.is_empty() {
            on_output(&flush_stderr, true);
        }

        if result.cancelled {
            return Ok(serde_json::json!({
                "success": false,
                "cancelled": true,
                "output": "",
                "error": "Command cancelled.",
            }));
        }

        // The exec's captured stdout/stderr is the complete text (the
        // stream filters above exist only for the display callback).
        let stdout = filter_php_noise(&result.output.stdout);
        let stderr = filter_php_noise(&result.output.stderr);

        if result.output.success() {
            Ok(serde_json::json!({
                "success": true,
                "cancelled": false,
                "output": stdout,
                "error": stderr
            }))
        } else {
            let error = extract_error(&stdout, &stderr, &cmd_parts, &opts);
            Ok(serde_json::json!({
                "success": false,
                "cancelled": false,
                "output": stdout,
                "error": error
            }))
        }
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

// ── Tracked (backgroundable) runs ─────────────────────────────

/// Finished runs retained in the in-memory registry (oldest dropped first).
pub const MAX_WP_CLI_JOBS: usize = 20;

/// One WP-CLI run tracked process-wide so it can keep streaming after its
/// modal closes ("send to background"). In-memory only: quitting the app
/// abandons the container-side exec, exactly like the old modal-bound runs.
#[derive(Debug, Clone, PartialEq)]
pub struct WpCliJob {
    pub id: u64,
    pub site: String,
    pub command: String,
    /// stdout streamed so far (warning/deprecation-filtered); overwritten
    /// with the definitive text when the run finishes.
    pub output: String,
    /// stderr streamed so far; overwritten with the definitive text on
    /// finish (cancellation notice, extracted error, …).
    pub error: String,
    pub running: bool,
    /// Cancellation requested but the exec not confirmed dead yet.
    pub cancelling: bool,
    /// The user left the run's modal (explicit "send to background" or any
    /// close while running); completion is then reported as a notification
    /// instead of only in the output panel.
    pub backgrounded: bool,
    /// Meaningful once `running` is false.
    pub success: bool,
    /// The run was stopped via cancellation, never a success.
    pub cancelled: bool,
}

static WP_CLI_JOB_SEQ: AtomicU64 = AtomicU64::new(1);

/// Cancel flags per tracked job, reachable after the owning modal is gone.
static JOB_CANCELS: std::sync::LazyLock<Mutex<HashMap<u64, Arc<AtomicBool>>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// A registered job's identity plus its cancel flag for [`run_wp_cli_job`].
#[derive(Debug)]
pub struct WpCliJobHandle {
    pub id: u64,
    pub cancel: Arc<AtomicBool>,
}

/// Register a tracked WP-CLI run without starting it: validates the request
/// synchronously (so bad input never enters the registry or the command
/// history) and creates the job entry. Split from [`run_wp_cli_job`] so the
/// UI can spawn the future on its own runtime.
pub fn start_wp_cli_job(request: &WpCliRequest) -> Result<WpCliJobHandle, String> {
    container_work_dir(&request.site)?;
    parse_wp_command(&request.command)?;

    // Bound concurrent runs: a registry full of running jobs has nothing
    // safe to drop, so refuse instead of orphaning a run's display.
    let running = crate::state::wp_cli_jobs()
        .iter()
        .filter(|job| job.running)
        .count();
    if running >= MAX_WP_CLI_JOBS {
        return Err(format!(
            "Too many WP-CLI runs are in progress ({MAX_WP_CLI_JOBS}); wait for one to finish or clear finished runs."
        ));
    }

    let id = WP_CLI_JOB_SEQ.fetch_add(1, Ordering::Relaxed);
    let cancel = Arc::new(AtomicBool::new(false));
    JOB_CANCELS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(id, Arc::clone(&cancel));
    crate::state::insert_wp_cli_job(WpCliJob {
        id,
        site: request.site.name.clone(),
        command: request.command.clone(),
        output: String::new(),
        error: String::new(),
        running: true,
        cancelling: false,
        backgrounded: false,
        success: false,
        cancelled: false,
    });
    Ok(WpCliJobHandle { id, cancel })
}

/// Run a registered job to completion: stream demuxed output into the
/// registry entry, then finalize it (definitive output, status, and a
/// completion notification when the job was backgrounded). Spawn this after
/// [`start_wp_cli_job`].
pub async fn run_wp_cli_job(id: u64, request: WpCliRequest, cancel: Arc<AtomicBool>) {
    let on_output = move |text: &str, is_stderr: bool| {
        crate::state::update_wp_cli_job(id, |job| {
            if is_stderr {
                append_job_text(&mut job.error, text);
            } else {
                append_job_text(&mut job.output, text);
            }
        });
    };
    let result = run_wp_cli_interactive(request, cancel, on_output).await;
    finish_wp_cli_job(id, result);
}

/// Finalize a tracked job from a finished exec. Public for tests.
pub fn finish_wp_cli_job(id: u64, result: Result<serde_json::Value, String>) {
    let (success, cancelled, output, error) = job_outcome(&result);
    let mut backgrounded = false;
    crate::state::update_wp_cli_job(id, |job| {
        backgrounded = job.backgrounded;
        job.running = false;
        job.cancelling = false;
        job.success = success;
        job.cancelled = cancelled;
        job.output = clamp_job_text(output);
        job.error = clamp_job_text(error);
    });
    JOB_CANCELS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&id);

    if backgrounded {
        // The entry may be gone (cleared, dropped by the cap) — nothing to
        // report in that case.
        if let Some(job) = crate::state::wp_cli_jobs()
            .iter()
            .find(|job| job.id == id)
            .cloned()
        {
            push_job_notification(&job);
        }
    }
}

/// Pure core of [`finish_wp_cli_job`]'s result handling: `(success,
/// cancelled, stdout, stderr)`. A cancelled exec is never a success.
fn job_outcome(result: &Result<serde_json::Value, String>) -> (bool, bool, String, String) {
    match result {
        Ok(value) => {
            let field = |key: &str| {
                value
                    .get(key)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string()
            };
            let cancelled = value.get("cancelled").and_then(|v| v.as_bool()) == Some(true);
            let success =
                !cancelled && value.get("success").and_then(|v| v.as_bool()) == Some(true);
            (success, cancelled, field("output"), field("error"))
        }
        Err(e) => (false, false, String::new(), e.clone()),
    }
}

/// Keep notification lines scannable: long commands (search-replace with
/// long arguments, eval snippets) are cut at 60 chars.
fn short_command(command: &str) -> std::borrow::Cow<'_, str> {
    if command.chars().count() <= 60 {
        std::borrow::Cow::Borrowed(command)
    } else {
        let cut: String = command.chars().take(60).collect();
        std::borrow::Cow::Owned(format!("{cut}…"))
    }
}

/// Completion line for a finished job, styled like the transfer
/// notifications. Only called for backgrounded jobs.
fn push_job_notification(job: &WpCliJob) {
    let command = short_command(&job.command);
    if job.cancelled {
        crate::state::push_notification(
            NotificationType::Warning,
            format!("WP-CLI `{command}` on {} was cancelled", job.site),
        );
    } else if job.success {
        crate::state::push_notification(
            NotificationType::Success,
            format!("WP-CLI `{command}` on {} finished", job.site),
        );
    } else {
        crate::state::push_notification(
            NotificationType::Error,
            format!("WP-CLI `{command}` on {} failed", job.site),
        );
    }
}

/// Request cancellation of a tracked job (TERM → KILL in the container). A
/// no-op for unknown or already finished jobs.
pub fn cancel_wp_cli_job(id: u64) {
    let flag = JOB_CANCELS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(&id)
        .cloned();
    if let Some(flag) = flag {
        flag.store(true, Ordering::Relaxed);
        crate::state::update_wp_cli_job(id, |job| {
            if job.running {
                job.cancelling = true;
            }
        });
    }
}

/// Mark every running job of `site` as backgrounded: the modal is going
/// away while they run, so completion must be reported as a notification
/// instead of only in the output panel.
pub fn background_running_wp_cli_jobs(site: &str) {
    crate::state::update_wp_cli_jobs(
        |job| job.site == site && job.running,
        |job| job.backgrounded = true,
    );
}

/// Streamed/final text kept per job field. Larger outputs are truncated
/// (head kept, marker appended) — the registry is a viewer, not a log
/// store, and uncapped multi-megabyte outputs would sit in memory for the
/// app's lifetime.
pub const MAX_JOB_TEXT_CHARS: usize = 256 * 1024;

/// Clamp `text` to [`MAX_JOB_TEXT_CHARS`], keeping the head and appending a
/// marker. Cuts on a char boundary.
fn clamp_job_text(text: String) -> String {
    if text.len() <= MAX_JOB_TEXT_CHARS {
        return text;
    }
    let mut cut = MAX_JOB_TEXT_CHARS;
    while !text.is_char_boundary(cut) {
        cut -= 1;
    }
    let mut clamped = String::with_capacity(cut + 48);
    clamped.push_str(&text[..cut]);
    clamped.push_str("\n… truncated (output exceeded 256 KiB) …\n");
    clamped
}

/// Append streamed `text` to a job field, enforcing the cap incrementally
/// so per-chunk cost stays bounded. No-op once capped.
fn append_job_text(target: &mut String, text: &str) {
    if target.len() >= MAX_JOB_TEXT_CHARS {
        return;
    }
    let mut owned = std::mem::take(target);
    owned.push_str(text);
    *target = clamp_job_text(owned);
}

/// Forget a site's finished jobs; running ones stay until they complete.
pub fn clear_finished_wp_cli_jobs(site: &str) {
    crate::state::retain_wp_cli_jobs(|job| job.site != site || job.running);
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
        append_job_text, clamp_job_text, filter_php_noise, is_read_only_wp_command, job_outcome,
        parse_wp_command, push_history_entry, short_command, PhpNoiseStreamFilter,
        WpCliHistoryEntry, MAX_HISTORY_ENTRIES, MAX_JOB_TEXT_CHARS,
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
    fn parse_wp_command_strips_leading_wp_token() {
        assert_eq!(
            parse_wp_command("wp plugin list").expect("parse"),
            args(&["plugin", "list"])
        );
        // Bare commands are unaffected.
        assert_eq!(
            parse_wp_command("plugin list").expect("parse"),
            args(&["plugin", "list"])
        );
        // Only the first token is stripped, quoted "wp" stays part of argv.
        assert_eq!(
            parse_wp_command("wp eval 'echo wp;'").expect("parse"),
            args(&["eval", "echo wp;"])
        );
        // Flags still come first after the strip.
        assert_eq!(
            parse_wp_command("wp --skip-plugins core version").expect("parse"),
            args(&["--skip-plugins", "core", "version"])
        );
    }

    #[test]
    fn parse_wp_command_rejects_empty_commands() {
        assert!(parse_wp_command("").is_err());
        assert!(parse_wp_command("   ").is_err());
        // A command that was nothing but the prefix.
        assert!(parse_wp_command("wp").is_err());
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

    #[test]
    fn noise_filter_drops_warnings_and_deprecations() {
        let input = "PHP Warning: include(): failed to open stream\n\
                     plugin list output\n\
                     PHP Deprecated: Automatic conversion of false\n\
                     Deprecated: trim(): Passing null\n\
                     Warning: some plugin notice\n\
                     done\n";
        assert_eq!(filter_php_noise(input), "plugin list output\ndone\n");
    }

    #[test]
    fn noise_filter_preserves_trailing_newline_and_plain_text() {
        assert_eq!(filter_php_noise("all good\n"), "all good\n");
        assert_eq!(filter_php_noise("all good"), "all good");
        assert_eq!(filter_php_noise(""), "");
    }

    #[test]
    fn stream_filter_handles_chunk_boundaries() {
        let mut filter = PhpNoiseStreamFilter::new();
        // A warning line split across chunks must still be dropped.
        assert_eq!(filter.push("PHP War"), "");
        assert_eq!(filter.push("ning: split across chunks\nreal "), "");
        assert_eq!(filter.push("output\n"), "real output\n");
        // Partial non-noise line stays buffered until flushed.
        assert_eq!(filter.push("tail"), "");
        assert_eq!(filter.flush(), "tail");
        assert_eq!(filter.flush(), "");
    }

    #[test]
    fn job_outcome_reads_result_fields() {
        let ok = serde_json::json!({
            "success": true,
            "cancelled": false,
            "output": "out",
            "error": ""
        });
        assert_eq!(
            job_outcome(&Ok(ok)),
            (true, false, "out".to_string(), String::new())
        );

        let failed = serde_json::json!({
            "success": false,
            "cancelled": false,
            "output": "",
            "error": "boom"
        });
        assert_eq!(
            job_outcome(&Ok(failed)),
            (false, false, String::new(), "boom".to_string())
        );

        let cancelled = serde_json::json!({
            "success": false,
            "cancelled": true,
            "output": "",
            "error": "Command cancelled."
        });
        assert_eq!(
            job_outcome(&Ok(cancelled)),
            (false, true, String::new(), "Command cancelled.".to_string())
        );

        // A cancelled exec is never reported as a success, whatever the
        // result claims.
        let cancelled_success = serde_json::json!({
            "success": true,
            "cancelled": true,
            "output": "",
            "error": ""
        });
        assert_eq!(
            job_outcome(&Ok(cancelled_success)),
            (false, true, String::new(), String::new())
        );

        assert_eq!(
            job_outcome(&Err("join error".to_string())),
            (false, false, String::new(), "join error".to_string())
        );
    }

    #[test]
    fn short_command_keeps_short_and_truncates_long() {
        assert_eq!(short_command("plugin list"), "plugin list");
        let long = "a".repeat(80);
        let cut = short_command(&long);
        assert_eq!(cut.chars().count(), 61);
        assert!(cut.ends_with('…'));
    }

    #[test]
    fn job_text_clamp_keeps_small_output_and_marks_large() {
        assert_eq!(clamp_job_text(String::new()), "");
        assert_eq!(clamp_job_text("ok".to_string()), "ok");

        let big = "x".repeat(MAX_JOB_TEXT_CHARS + 100);
        let clamped = clamp_job_text(big);
        assert!(clamped.len() < MAX_JOB_TEXT_CHARS + 64);
        assert!(clamped.starts_with("xxx"));
        assert!(clamped.contains("truncated"));
        // The cut must land on a char boundary.
        let multibyte = "ä".repeat(MAX_JOB_TEXT_CHARS / 2 + 10);
        assert!(clamp_job_text(multibyte).ends_with('\n'));
    }

    #[test]
    fn append_job_text_stops_at_the_cap() {
        let mut field = String::new();
        append_job_text(&mut field, "chunk one\n");
        append_job_text(&mut field, "chunk two\n");
        assert_eq!(field, "chunk one\nchunk two\n");

        append_job_text(&mut field, &"x".repeat(MAX_JOB_TEXT_CHARS));
        assert!(field.len() >= MAX_JOB_TEXT_CHARS);
        assert!(field.contains("truncated"));
        let frozen = field.clone();
        // Further chunks are dropped entirely once capped.
        append_job_text(&mut field, "more");
        assert_eq!(field, frozen);
    }
}
