//! Global application state.
//!
//! Every piece of state that can be written from a background thread (tokio
//! tasks, Docker build/pull streams, certificate threads) lives
//! in a `SyncSignal` so writes are safe from any thread. UI-only state stays
//! in local `Signal`s inside the components.

use crate::backend::docker::{Container, DockerStatus, DockerStatusPayload, ServiceProgress};
use crate::backend::site::Site;
use crate::backend::utils::{NotificationPayload, NotificationType};
use crate::backend::wp_cli::WpCliHistoryEntry;
use dioxus::prelude::*;
use std::collections::HashMap;
use std::sync::OnceLock;

/// A process-wide `SyncSignal`. Call the generated function to get the handle.
macro_rules! sync_state {
    ($name:ident, $ty:ty, $init:expr) => {
        pub fn $name() -> &'static SyncSignal<$ty> {
            static CELL: OnceLock<SyncSignal<$ty>> = OnceLock::new();
            CELL.get_or_init(|| SyncSignal::new_maybe_sync($init()))
        }
    };
}

/// Generate a signal accessor, a copy-based reader, and a write setter for
/// simple `Copy + Clone` value types.
macro_rules! global_value {
    ($sig:ident, $reader:ident, $setter:ident, $ty:ty, $init:expr) => {
        pub fn $sig() -> &'static SyncSignal<$ty> {
            static CELL: OnceLock<SyncSignal<$ty>> = OnceLock::new();
            CELL.get_or_init(|| SyncSignal::new_maybe_sync($init))
        }

        pub fn $reader() -> $ty {
            *$sig().read()
        }

        pub fn $setter(value: $ty) {
            let mut sig = *$sig();
            *sig.write() = value;
        }
    };
}

pub type BuildingServices = HashMap<String, bool>;
/// Per-service startup progress (keyed by compose service name), driving the
/// Services panel progress bars; cleared together with the building flags.
pub type ServiceProgressMap = HashMap<String, ServiceProgress>;

sync_state!(containers_signal, Vec<Container>, Vec::new);
sync_state!(building_services_signal, BuildingServices, HashMap::new);
sync_state!(service_progress_signal, ServiceProgressMap, HashMap::new);
sync_state!(docker_status_signal, DockerStatusPayload, || {
    DockerStatusPayload {
        status: DockerStatus::Idle,
        message: String::new(),
    }
});
/// Build log lines, pre-formatted as `[{service_name}] {line}`.
pub const MAX_BUILD_LOG_LINES: usize = 500;
sync_state!(build_logs_signal, Vec<String>, Vec::new);
/// General container log lines (`[{tag}] {line}`): live container output
/// from the background followers, lifecycle/build events (mirrored in
/// [`push_build_log`]), and app notifications (via
/// [`push_notification`]). Feeds the Services log panel.
pub const MAX_CONTAINER_LOG_LINES: usize = 600;
sync_state!(container_logs_signal, Vec<String>, Vec::new);
/// User-facing notifications (pending warnings/errors are printed by the
/// CLI after each command); capped so a busy session can never grow the vec
/// without bound.
pub const MAX_NOTIFICATIONS: usize = 100;
sync_state!(notifications_signal, Vec<NotificationPayload>, Vec::new);
global_value!(
    xdebug_enabled_signal,
    xdebug_enabled,
    set_xdebug_enabled,
    Option<bool>,
    None
);
global_value!(
    xdebug_toggling_signal,
    xdebug_toggling,
    set_xdebug_toggling,
    bool,
    false
);
sync_state!(sites_signal, Vec<Site>, Vec::new);
// WP-CLI command history (oldest → newest); persistence is owned by the
// wp_cli backend, which refreshes this signal after every disk write.
sync_state!(wp_cli_history_signal, Vec<WpCliHistoryEntry>, Vec::new);
global_value!(
    sites_loading_signal,
    sites_loading,
    set_sites_loading,
    bool,
    false
);
global_value!(
    shutdown_done_signal,
    shutdown_done,
    set_shutdown_done,
    bool,
    false
);

/// Create every global signal in the root scope so their storage outlives all
/// child scopes (see the dioxus-signals "Copy Value hoisted" warning).
pub fn init_globals() {
    let _ = containers_signal();
    let _ = building_services_signal();
    let _ = service_progress_signal();
    let _ = docker_status_signal();
    let _ = build_logs_signal();
    let _ = container_logs_signal();
    let _ = notifications_signal();
    let _ = xdebug_enabled_signal();
    let _ = xdebug_toggling_signal();
    let _ = sites_signal();
    let _ = sites_loading_signal();
    let _ = wp_cli_history_signal();
    let _ = shutdown_done_signal();
}

// ── Containers ────────────────────────────────────────────────

pub fn containers() -> ReadableRef<'static, SyncSignal<Vec<Container>>, Vec<Container>> {
    containers_signal().read()
}

pub fn set_containers(containers: Vec<Container>) {
    let mut sig = *containers_signal();
    *sig.write() = containers;
}

// ── Building services ─────────────────────────────────────────

pub fn building_services() -> ReadableRef<'static, SyncSignal<BuildingServices>, BuildingServices> {
    building_services_signal().read()
}

pub fn is_service_building(name: &str) -> bool {
    building_services_signal()
        .read()
        .get(name)
        .copied()
        .unwrap_or(false)
}

pub fn mark_service_building(name: impl Into<String>, building: bool) {
    let name = name.into();
    let mut sig = *building_services_signal();
    let mut map = sig.write();
    if building {
        if map.is_empty() {
            let mut logs_sig = *build_logs_signal();
            logs_sig.write().clear();
        }
        map.insert(name, true);
    } else {
        map.remove(&name);
    }
}

pub fn clear_building() {
    let mut sig = *building_services_signal();
    sig.write().clear();
    let mut progress_sig = *service_progress_signal();
    progress_sig.write().clear();
}

// ── Service progress ──────────────────────────────────────────

/// Progress for a container, accepting either the full container name
/// (`devwp_php`) or the bare compose service name (`php`).
pub fn service_progress(container_or_service: &str) -> Option<ServiceProgress> {
    let map = service_progress_signal().read();
    let service = container_or_service
        .strip_prefix("devwp_")
        .unwrap_or(container_or_service);
    map.get(container_or_service)
        .or_else(|| map.get(service))
        .copied()
}

pub fn set_service_progress(service: &str, progress: ServiceProgress) {
    let mut sig = *service_progress_signal();
    sig.write().insert(service.to_string(), progress);
}

// ── Docker status ─────────────────────────────────────────────

pub fn docker_status() -> ReadableRef<'static, SyncSignal<DockerStatusPayload>, DockerStatusPayload>
{
    docker_status_signal().read()
}

pub fn set_docker_status(status: DockerStatus, message: impl Into<String>) {
    let mut sig = *docker_status_signal();
    let mut s = sig.write();
    s.status = status;
    s.message = message.into();
}

// ── Build logs ────────────────────────────────────────────────

pub fn build_logs() -> ReadableRef<'static, SyncSignal<Vec<String>>, Vec<String>> {
    build_logs_signal().read()
}

/// Append a raw docker log line (ANSI-stripped, trimmed, skipped if empty),
/// formatted as `[{service_name}] {line}`, capped at [`MAX_BUILD_LOG_LINES`].
/// Also mirrored into the unified container log panel.
pub fn push_build_log(service_name: &str, line: &str) {
    let stripped = strip_ansi(line).trim().to_string();
    if stripped.is_empty() {
        return;
    }
    let mut sig = *build_logs_signal();
    let mut logs = sig.write();
    logs.push(format!("[{service_name}] {stripped}"));
    if logs.len() > MAX_BUILD_LOG_LINES {
        let excess = logs.len() - MAX_BUILD_LOG_LINES;
        logs.drain(..excess);
    }
    drop(logs);
    push_container_log(service_name, &stripped);
}

// ── Container logs ────────────────────────────────────────────

pub fn container_logs() -> ReadableRef<'static, SyncSignal<Vec<String>>, Vec<String>> {
    container_logs_signal().read()
}

/// Append a raw container log line (ANSI-stripped, trimmed, skipped if
/// empty), formatted as `[{service_name}] {line}`, capped at
/// [`MAX_CONTAINER_LOG_LINES`].
pub fn push_container_log(service_name: &str, line: &str) {
    let stripped = strip_ansi(line).trim().to_string();
    if stripped.is_empty() {
        return;
    }
    let mut sig = *container_logs_signal();
    let mut logs = sig.write();
    logs.push(format!("[{service_name}] {stripped}"));
    if logs.len() > MAX_CONTAINER_LOG_LINES {
        let excess = logs.len() - MAX_CONTAINER_LOG_LINES;
        logs.drain(..excess);
    }
}

/// Strip ANSI escape sequences and stray carriage returns from a string.
pub fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            // Consume a CSI sequence: ESC [ 0-9;... final-byte
            if chars.peek() == Some(&'[') {
                chars.next();
                for nxt in chars.by_ref() {
                    let is_final = nxt.is_ascii_alphabetic() || nxt == '@';
                    if is_final {
                        break;
                    }
                }
                continue;
            }
            continue;
        }
        if c != '\r' {
            out.push(c);
        }
    }
    out
}

// ── Notifications ─────────────────────────────────────────────

pub fn notifications(
) -> ReadableRef<'static, SyncSignal<Vec<NotificationPayload>>, Vec<NotificationPayload>> {
    notifications_signal().read()
}

/// Surface an app-level success/error/warning/info message. In the GUI it
/// appears as a tagged line in the Services log panel (no toasts); the CLI
/// prints pending warnings/errors to stderr after each command.
pub fn push_notification(notification_type: NotificationType, message: impl Into<String>) {
    let message = message.into();
    push_container_log(&notification_type.to_string(), &message);
    let mut sig = *notifications_signal();
    let mut n = sig.write();
    n.push(NotificationPayload {
        notification_type,
        message,
    });
    if n.len() > MAX_NOTIFICATIONS {
        let excess = n.len() - MAX_NOTIFICATIONS;
        n.drain(..excess);
    }
}

// ── Sites ─────────────────────────────────────────────────────

pub fn sites() -> ReadableRef<'static, SyncSignal<Vec<Site>>, Vec<Site>> {
    sites_signal().read()
}

pub fn set_sites(sites: Vec<Site>) {
    let mut sig = *sites_signal();
    *sig.write() = sites;
}

// ── WP-CLI history ────────────────────────────────────────────

pub fn wp_cli_history(
) -> ReadableRef<'static, SyncSignal<Vec<WpCliHistoryEntry>>, Vec<WpCliHistoryEntry>> {
    wp_cli_history_signal().read()
}

pub fn set_wp_cli_history(history: Vec<WpCliHistoryEntry>) {
    let mut sig = *wp_cli_history_signal();
    *sig.write() = history;
}
