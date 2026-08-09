//! Global application state.
//!
//! Every piece of state that can be written from a background thread (tokio
//! tasks, `run_command_streaming` reader threads, certificate threads) lives
//! in a `SyncSignal` so writes are safe from any thread. UI-only state stays
//! in local `Signal`s inside the components.

use crate::backend::docker::{Container, DockerStatusPayload};
use crate::backend::site::Site;
use crate::backend::utils::NotificationPayload;
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

pub type BuildingServices = HashMap<String, bool>;

sync_state!(containers_signal, Vec<Container>, Vec::new);
sync_state!(building_services_signal, BuildingServices, HashMap::new);
sync_state!(docker_status_signal, DockerStatusPayload, || {
    DockerStatusPayload {
        status: "idle".to_string(),
        message: String::new(),
    }
});
/// Build log lines, pre-formatted as `[{service_name}] {line}`.
pub const MAX_BUILD_LOG_LINES: usize = 500;
sync_state!(build_logs_signal, Vec<String>, Vec::new);
/// User-facing notifications (auto-dismissed by the UI); capped so a busy
/// session can never grow the vec without bound.
pub const MAX_NOTIFICATIONS: usize = 100;
sync_state!(notifications_signal, Vec<NotificationPayload>, Vec::new);
sync_state!(xdebug_enabled_signal, Option<bool>, || None);
sync_state!(xdebug_toggling_signal, bool, || false);
sync_state!(sites_signal, Vec<Site>, Vec::new);
sync_state!(sites_loading_signal, bool, || false);
sync_state!(shutdown_done_signal, bool, || false);

/// Create every global signal in the root scope so their storage outlives all
/// child scopes (see the dioxus-signals "Copy Value hoisted" warning).
pub fn init_globals() {
    let _ = containers_signal();
    let _ = building_services_signal();
    let _ = docker_status_signal();
    let _ = build_logs_signal();
    let _ = notifications_signal();
    let _ = xdebug_enabled_signal();
    let _ = xdebug_toggling_signal();
    let _ = sites_signal();
    let _ = sites_loading_signal();
    let _ = shutdown_done_signal();
}

// ── Containers ────────────────────────────────────────────────

pub fn containers() -> ReadableRef<'static, SyncSignal<Vec<Container>>, Vec<Container>> {
    containers_signal().read()
}

pub fn set_containers(containers: Vec<Container>) {
    let mut sig = *containers_signal();
    let mut s = sig.write();
    *s = containers;
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
            // New build cycle: clear the log panel first.
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
}

// ── Docker status ─────────────────────────────────────────────

pub fn docker_status() -> ReadableRef<'static, SyncSignal<DockerStatusPayload>, DockerStatusPayload>
{
    docker_status_signal().read()
}

pub fn set_docker_status(status: &str, message: impl Into<String>) {
    let mut sig = *docker_status_signal();
    let mut s = sig.write();
    s.status = status.to_string();
    s.message = message.into();
}

// ── Build logs ────────────────────────────────────────────────

pub fn build_logs() -> ReadableRef<'static, SyncSignal<Vec<String>>, Vec<String>> {
    build_logs_signal().read()
}

/// Append a raw docker log line (ANSI-stripped, trimmed, skipped if empty),
/// formatted as `[{service_name}] {line}`, capped at [`MAX_BUILD_LOG_LINES`].
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

/// Push a notification; safe from any thread.
pub fn push_notification(notification_type: &str, message: impl Into<String>) {
    let mut sig = *notifications_signal();
    let mut n = sig.write();
    n.push(NotificationPayload {
        notification_type: notification_type.to_string(),
        message: message.into(),
    });
    if n.len() > MAX_NOTIFICATIONS {
        let excess = n.len() - MAX_NOTIFICATIONS;
        n.drain(..excess);
    }
}

// ── Xdebug ────────────────────────────────────────────────────

pub fn xdebug_enabled() -> Option<bool> {
    xdebug_enabled_signal().read().clone()
}

pub fn set_xdebug_enabled(enabled: Option<bool>) {
    let mut sig = *xdebug_enabled_signal();
    let mut s = sig.write();
    *s = enabled;
}

pub fn set_xdebug_toggling(toggling: bool) {
    let mut sig = *xdebug_toggling_signal();
    let mut s = sig.write();
    *s = toggling;
}

pub fn xdebug_toggling() -> bool {
    xdebug_toggling_signal().read().clone()
}

// ── Sites ─────────────────────────────────────────────────────

pub fn sites() -> ReadableRef<'static, SyncSignal<Vec<Site>>, Vec<Site>> {
    sites_signal().read()
}

pub fn set_sites(sites: Vec<Site>) {
    let mut sig = *sites_signal();
    let mut s = sig.write();
    *s = sites;
}

pub fn sites_loading() -> bool {
    sites_loading_signal().read().clone()
}

// ── Shutdown lifecycle ────────────────────────────────────────

pub fn shutdown_done() -> bool {
    shutdown_done_signal().read().clone()
}

pub fn set_shutdown_done(done: bool) {
    let mut sig = *shutdown_done_signal();
    let mut s = sig.write();
    *s = done;
}
