//! Site export/import UI plumbing: the in-flight transfer modal and the
//! task starters shared by the site list buttons and window drag & drop.

use crate::backend::site::Site;
use crate::backend::transfer::{dump_site_database, export_site, import_site, SiteTransferJob};
use crate::backend::utils::NotificationType;
use crate::components::ui::{ModalBase, Spinner};
use crate::state;
use dioxus::prelude::*;
use std::path::{Path, PathBuf};

/// Whether a dropped/opened file looks like a DevWP site archive.
pub fn is_site_archive(path: impl AsRef<Path>) -> bool {
    path.as_ref()
        .to_string_lossy()
        .to_ascii_lowercase()
        .ends_with(".tar.xz")
}

/// Refuse to start when another transfer is already running.
fn already_running() -> bool {
    if state::site_transfer().is_some() {
        state::push_notification(
            NotificationType::Warning,
            "Another export/import is already running",
        );
        true
    } else {
        false
    }
}

/// Export `site` to `dest` on a blocking task (xz -9e can take minutes),
/// showing the transfer modal while it runs. Must be called after the
/// destination was chosen (rfd dialogs must run on the UI thread).
pub fn start_site_export(site: Site, dest: PathBuf) {
    if already_running() {
        return;
    }
    state::set_site_transfer(Some(SiteTransferJob {
        exporting: true,
        site: site.name.clone(),
        message: "Starting export…".to_string(),
        progress: None,
    }));
    spawn(async move {
        let site_name = site.name.clone();
        let progress = |fraction: Option<f32>, message: &str| {
            state::update_site_transfer_message(message);
            state::update_site_transfer_progress(fraction);
        };
        let result = tokio::task::spawn_blocking(move || export_site(site, dest, &progress)).await;
        state::set_site_transfer(None);
        match result {
            Ok(Ok(path)) => state::push_notification(
                NotificationType::Success,
                format!("Site {} exported to {}", site_name, path.display()),
            ),
            Ok(Err(e)) => state::push_notification(
                NotificationType::Error,
                format!("Export of {site_name} failed: {e}"),
            ),
            Err(e) => state::push_notification(
                NotificationType::Error,
                format!("Export of {site_name} failed: task error: {e}"),
            ),
        }
    });
}

/// Dump `site`'s database to `dest` on a blocking task, reporting the
/// outcome via notifications (a plain dump is fast; no transfer modal).
/// Must be called after the destination was chosen (rfd dialogs must run
/// on the UI thread).
pub fn start_database_dump(site: Site, dest: PathBuf) {
    spawn(async move {
        let site_name = site.name.clone();
        let result = tokio::task::spawn_blocking(move || dump_site_database(site, dest)).await;
        match result {
            Ok(Ok(path)) => state::push_notification(
                NotificationType::Success,
                format!("Database of {site_name} dumped to {}", path.display()),
            ),
            Ok(Err(e)) => state::push_notification(
                NotificationType::Error,
                format!("Database dump of {site_name} failed: {e}"),
            ),
            Err(e) => state::push_notification(
                NotificationType::Error,
                format!("Database dump of {site_name} failed: task error: {e}"),
            ),
        }
    });
}

/// Import a site from `archive` on a blocking task, showing the transfer
/// modal while it runs, then refresh the site list.
pub fn start_site_import(archive: PathBuf) {
    if already_running() {
        return;
    }
    state::set_site_transfer(Some(SiteTransferJob {
        exporting: false,
        site: archive
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| archive.display().to_string()),
        message: "Starting import…".to_string(),
        progress: None,
    }));
    spawn(async move {
        let progress = |fraction: Option<f32>, message: &str| {
            state::update_site_transfer_message(message);
            state::update_site_transfer_progress(fraction);
        };
        let result = tokio::task::spawn_blocking(move || import_site(&archive, &progress)).await;
        state::set_site_transfer(None);
        match result {
            Ok(Ok(imported)) => {
                state::push_notification(
                    NotificationType::Success,
                    format!("Site {} imported", imported.name),
                );
                let sites = tokio::task::spawn_blocking(crate::backend::site::get_sites)
                    .await
                    .unwrap_or_default();
                state::set_sites(sites);
            }
            Ok(Err(e)) => {
                state::push_notification(NotificationType::Error, format!("Import failed: {e}"))
            }
            Err(e) => state::push_notification(
                NotificationType::Error,
                format!("Import failed: task error: {e}"),
            ),
        }
    });
}

/// Modal shown while an export/import runs; renders nothing when idle.
/// Not closable — the transfer cannot be cancelled mid-archive.
#[component]
pub fn TransferModal() -> Element {
    let job = state::site_transfer().clone();
    let Some(job) = job else {
        return Ok(VNode::placeholder());
    };

    let title = if job.exporting {
        format!("Exporting {}", job.site)
    } else {
        format!("Importing {}", job.site)
    };
    let pct = job
        .progress
        .map(|fraction| (fraction * 100.0).round() as i64);

    rsx! {
        ModalBase {
            is_open: true,
            on_close: move |_| {},
            title: title,
            hide_close: true,
            div { class: "flex flex-col justify-center items-center gap-3 py-6 text-center",
                Spinner { svg_class: "size-8 text-accent", title: "Transfer in progress" }
                if let Some(pct) = pct {
                    div { class: "bg-sunken rounded-full overflow-hidden w-full max-w-xs h-2",
                        div {
                            class: "bg-accent rounded-full h-full",
                            style: "width: {pct}%",
                            role: "progressbar",
                            "aria-valuenow": "{pct}",
                            "aria-valuemin": "0",
                            "aria-valuemax": "100",
                            "aria-label": "Transfer progress",
                        }
                    }
                    span { class: "text-faint text-xs", "{pct}%" }
                }
                p { class: "text-muted text-sm", "{job.message}" }
                if job.exporting {
                    p { class: "text-faint text-xs",
                        "Archives use xz preset 9e — the slowest, best-compression mode. Large sites can take a while."
                    }
                } else {
                    p { class: "text-faint text-xs",
                        "Restoring site files, database, and configuration…"
                    }
                }
            }
        }
    }
}
