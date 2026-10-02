use crate::backend::site::Site;
use crate::backend::wp_cli::{self, WpCliRequest};
use crate::components::ui::{ModalBase, OutputPanel, Spinner};
use crate::state;
use dioxus::prelude::*;
use std::rc::Rc;

/// History entries shown in the modal (and reachable with ↑/↓). The
/// persisted history keeps more; this cap keeps the modal compact.
const MAX_SHOWN_HISTORY: usize = 5;

/// Read a field of the focused job from the registry; `None` when the job
/// is gone (cleared or dropped by the cap).
fn focused_job_field<T>(id: Option<u64>, f: impl FnOnce(&wp_cli::WpCliJob) -> T) -> Option<T> {
    let id = id?;
    state::wp_cli_jobs().iter().find(|job| job.id == id).map(f)
}

#[component]
pub fn WpCliModal(site: Rc<Site>, on_close: EventHandler<()>) -> Element {
    let mut command = use_signal(String::new);
    // The tracked run whose output the panel shows; `None` = fresh form.
    // Runs live in the global registry, so closing the modal never kills
    // one — it only detaches ("sends to background") the view.
    let mut focused_job = use_signal(|| None::<u64>);
    // Synchronous start failures (bad site name, unparsable command) show
    // under the input; run failures surface in the job's output panel.
    let mut start_error = use_signal(String::new);
    // Index into the shown history list while recalling with the arrow
    // keys; `None` = not navigating (editing a fresh command).
    let mut history_pos = use_signal(|| None::<usize>);
    // The half-typed command stashed when ArrowUp starts navigation, so
    // ArrowDown past the newest entry restores it (shell behaviour).
    let mut history_draft = use_signal(String::new);

    // The modal is mounted per-open (see site_list.rs), so this runs fresh
    // every time: pull the persisted history into the global signal, which
    // `run_wp_cli` keeps updated as commands run.
    use_effect(move || {
        spawn(async move {
            state::set_wp_cli_history(wp_cli::load_history());
        });
    });

    // Newest first, matching how the list is rendered, capped so a long
    // history cannot squeeze the rest of the modal.
    let site_history: Vec<String> = state::wp_cli_history()
        .iter()
        .rev()
        .filter(|entry| entry.site == site.name)
        .map(|entry| entry.command.clone())
        .take(MAX_SHOWN_HISTORY)
        .collect();

    // All tracked runs for this site, newest first — metadata only, so a
    // streamed chunk re-render never clones accumulated output text. The
    // registry is written from the exec threads, so reading it here keeps
    // the run rows and the focused output panel streaming.
    let jobs = state::wp_cli_jobs();
    let run_rows: Vec<(u64, String, bool, bool, bool)> = jobs
        .iter()
        .rev()
        .filter(|job| job.site == site.name)
        .map(|job| {
            (
                job.id,
                job.command.clone(),
                job.running,
                job.success,
                job.cancelling,
            )
        })
        .collect();
    let has_finished_runs = run_rows.iter().any(|(_, _, running, _, _)| !running);
    // Focused-run metadata for the footer; the output text itself is read
    // reactively in the memos below.
    let focused_meta: Option<(u64, bool, bool)> = (*focused_job.read())
        .and_then(|id| jobs.iter().find(|job| job.id == id))
        .map(|job| (job.id, job.running, job.cancelling));
    drop(jobs);

    // The output panel takes reactive handles; derive them from the
    // registry so streamed writes flow straight through. A vanished focus
    // job (cleared, capped) reads as empty/idle.
    let focused_output = use_memo(move || {
        focused_job_field(*focused_job.read(), |job| job.output.clone()).unwrap_or_default()
    });
    let focused_error = use_memo(move || {
        focused_job_field(*focused_job.read(), |job| job.error.clone()).unwrap_or_default()
    });
    let focused_running = use_memo(move || {
        focused_job_field(*focused_job.read(), |job| job.running).unwrap_or(false)
    });

    let site_for_run = Rc::clone(&site);
    let handle_run = EventHandler::new(move |_: ()| {
        *history_pos.write() = None;
        *history_draft.write() = String::new();
        let request = WpCliRequest {
            site: (*site_for_run).clone(),
            command: command.read().clone(),
        };
        match wp_cli::start_wp_cli_job(&request) {
            Ok(handle) => {
                *start_error.write() = String::new();
                *focused_job.write() = Some(handle.id);
                // Detached from this scope on purpose: the modal is
                // conditionally mounted and every close path unmounts it,
                // but the run must finalize (status + notification) even
                // after the modal is gone.
                dioxus::dioxus_core::spawn_forever(async move {
                    wp_cli::run_wp_cli_job(handle.id, request, handle.cancel).await;
                });
            }
            Err(e) => *start_error.write() = e,
        }
    });

    let site_for_close = Rc::clone(&site);
    let handle_close = EventHandler::new(move |_: ()| {
        // Every running job of this site keeps going after the modal
        // closes; mark them so completion is reported as a notification
        // instead of only in the output panel.
        wp_cli::background_running_wp_cli_jobs(&site_for_close.name);
        *focused_job.write() = None;
        *command.write() = String::new();
        *start_error.write() = String::new();
        *history_pos.write() = None;
        *history_draft.write() = String::new();
        on_close.call(());
    });

    let handle_select_history = EventHandler::new(move |entry: String| {
        *command.write() = entry;
        *history_pos.write() = None;
        *history_draft.write() = String::new();
    });

    let cmd = command.read().clone();
    let start_err = start_error.read().clone();
    let is_running = *focused_running.read();
    let focused_job_id = focused_meta.map(|(id, _, _)| id);
    let is_cancelling = focused_meta.is_some_and(|(_, _, cancelling)| cancelling);
    let has_history = !site_history.is_empty();
    // The input's key handler needs the list too, and the RSX loop below
    // consumes the vec (closures must own 'static data).
    let nav_history = site_history.clone();

    let footer = rsx! {
        div { class: "flex justify-end gap-2.5",
            button {
                "type": "button",
                class: "bg-transparent hover:bg-raised px-4 py-2 rounded-md text-muted hover:text-seasalt transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                // While a run is focused this cancels it (TERM → KILL in the
                // container); once idle it closes the modal. Closing via the
                // X, overlay, or Escape while running backgrounds the run.
                disabled: is_cancelling,
                onclick: move |_ev: MouseEvent| {
                    if is_running {
                        if let Some(id) = focused_job_id {
                            wp_cli::cancel_wp_cli_job(id);
                        }
                    } else {
                        handle_close.clone().call(());
                    }
                },
                if is_running {
                    if is_cancelling { "Cancelling…" } else { "Cancel" }
                } else {
                    "Close"
                }
            }
            if is_running {
                button {
                    "type": "button",
                    class: "bg-transparent hover:bg-raised px-4 py-2 border border-border rounded-md text-muted hover:text-seasalt transition-colors cursor-pointer",
                    onclick: move |_ev: MouseEvent| handle_close.clone().call(()),
                    "Send to background"
                }
            }
            button {
                "type": "submit",
                form: "wp-cli-form",
                class: "bg-accent hover:bg-accent-hover disabled:opacity-40 px-4 py-2 rounded-md text-on-accent transition-colors cursor-pointer disabled:cursor-not-allowed",
                disabled: cmd.trim().is_empty() || is_running,
                if is_running {
                    Spinner { svg_class: "size-6", title: "Loading WP-CLI response..." }
                } else {
                    "Run"
                }
            }
        }
    };

    rsx! {
        ModalBase {
            is_open: true,
            on_close: handle_close.clone(),
            title: format!("Run WP-CLI Command — {}", site.name),
            footer: Some(footer),
            form { id: "wp-cli-form",
                onsubmit: move |ev| {
                    ev.prevent_default();
                    if !*focused_running.read() && !command.read().trim().is_empty() {
                        handle_run.call(());
                    }
                },
                div { class: "mb-5",
                    label { class: "block mb-1 text-seasalt text-sm", "for": "wp-cli-command", "Command" }
                    input {
                        id: "wp-cli-command",
                        "type": "text",
                        class: "bg-sunken p-2 border border-border focus:border-accent rounded-md focus:outline-none w-full text-seasalt",
                        value: {cmd},
                        placeholder: "e.g. plugin list",
                        disabled: is_running,
                        oninput: move |ev| {
                            *command.write() = ev.value();
                        },
                        onkeydown: move |ev: KeyboardEvent| {
                            match ev.key() {
                                Key::Enter => {
                                    if !*focused_running.read()
                                        && !command.read().trim().is_empty()
                                    {
                                        ev.prevent_default();
                                        handle_run.call(());
                                    }
                                }
                                Key::ArrowUp => {
                                    ev.prevent_default();
                                    if !nav_history.is_empty() {
                                        let current = *history_pos.read();
                                        if current.is_none() {
                                            *history_draft.write() = command.read().clone();
                                        }
                                        let len = nav_history.len();
                                        let next = current.map_or(0, |i| (i + 1).min(len - 1));
                                        *command.write() = nav_history[next].clone();
                                        *history_pos.write() = Some(next);
                                    }
                                }
                                Key::ArrowDown => {
                                    ev.prevent_default();
                                    let current = *history_pos.read();
                                    if let Some(index) = current {
                                        if index == 0 {
                                            *command.write() = history_draft.read().clone();
                                            *history_pos.write() = None;
                                        } else {
                                            *command.write() = nav_history[index - 1].clone();
                                            *history_pos.write() = Some(index - 1);
                                        }
                                    }
                                }
                                _ => {}
                            }
                        },
                    }
                    if !start_err.is_empty() {
                        p { class: "mt-1 text-crimson text-xs", "{start_err}" }
                    }
                    div { class: "mt-1 text-muted text-xs",
                        "Only enter the command after "
                        span { class: "font-medium", "wp" }
                        ", e.g. "
                        code { class: "bg-sunken px-1 rounded", "plugin list" }
                        if has_history {
                            ". Use ↑/↓ to recall history."
                        }
                    }
                }
            }
            if has_history {
                div { class: "mb-5",
                    div { class: "flex justify-between items-center mb-1",
                        span { class: "block text-seasalt text-sm", "History" }
                        button {
                            "type": "button",
                            class: "bg-transparent hover:bg-raised px-2 py-1 rounded text-muted hover:text-seasalt text-xs transition-colors cursor-pointer",
                            onclick: {
                                let site_name = site.name.clone();
                                move |_| {
                                    wp_cli::clear_history(&site_name);
                                }
                            },
                            "Clear"
                        }
                    }
                    div { class: "flex flex-col gap-1 max-h-40 overflow-y-auto bg-sunken p-2 border border-border rounded-md",
                        for (index, entry) in site_history.into_iter().enumerate() {
                            button {
                                key: "{index}",
                                "type": "button",
                                class: "bg-transparent hover:bg-raised py-1.5 px-2 rounded text-left font-mono text-muted hover:text-seasalt text-xs truncate transition-colors cursor-pointer",
                                title: {entry.clone()},
                                onclick: move |_| {
                                    handle_select_history.clone().call(entry.clone());
                                },
                                {entry.clone()}
                            }
                        }
                    }
                }
            }
            if !run_rows.is_empty() {
                div { class: "mb-5",
                    div { class: "flex justify-between items-center mb-1",
                        span { class: "block text-seasalt text-sm", "Recent runs" }
                        if has_finished_runs {
                            button {
                                "type": "button",
                                class: "bg-transparent hover:bg-raised px-2 py-1 rounded text-muted hover:text-seasalt text-xs transition-colors cursor-pointer",
                                onclick: {
                                    let site_name = site.name.clone();
                                    move |_| {
                                        wp_cli::clear_finished_wp_cli_jobs(&site_name);
                                    }
                                },
                                "Clear finished"
                            }
                        }
                    }
                    div { class: "flex flex-col gap-1 max-h-40 overflow-y-auto bg-sunken p-2 border border-border rounded-md",
                        for (job_id, job_command, job_running, job_success, job_cancelling) in run_rows {
                            div {
                                key: "{job_id}",
                                class: "flex items-center gap-2 py-1.5 px-2 rounded hover:bg-raised text-left cursor-pointer min-w-0",
                                title: "Show this run's output",
                                onclick: move |_| *focused_job.write() = Some(job_id),
                                if job_running {
                                    Spinner { svg_class: "size-3 shrink-0 text-accent", title: "Run in progress" }
                                } else if job_success {
                                    span { class: "shrink-0 text-emerald text-xs", "✓" }
                                } else {
                                    span { class: "shrink-0 text-crimson text-xs", "✕" }
                                }
                                span { class: "flex-1 font-mono text-muted text-xs truncate", title: "{job_command}", {job_command.clone()} }
                                if job_running {
                                    button {
                                        "type": "button",
                                        class: "bg-transparent hover:bg-raised px-2 py-1 rounded text-muted hover:text-seasalt text-xs transition-colors cursor-pointer shrink-0 disabled:cursor-not-allowed disabled:opacity-40",
                                        disabled: job_cancelling,
                                        onclick: move |ev: MouseEvent| {
                                            ev.stop_propagation();
                                            wp_cli::cancel_wp_cli_job(job_id);
                                        },
                                        if job_cancelling { "Cancelling…" } else { "Cancel" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if let Some(job_id) = focused_meta.map(|(id, _, _)| id) {
                OutputPanel {
                    id: format!("wp-cli-output-{job_id}"),
                    output: focused_output,
                    error: focused_error,
                    loading: focused_running,
                    max_h_class: Some("max-h-75".to_string()),
                }
            }
        }
    }
}
