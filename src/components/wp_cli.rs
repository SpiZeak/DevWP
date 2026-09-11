use crate::backend::site::Site;
use crate::backend::wp_cli::{self, WpCliRequest};
use crate::components::ui::{ModalBase, OutputPanel, Spinner};
use crate::state;
use dioxus::prelude::*;
use std::rc::Rc;

#[component]
pub fn WpCliModal(site: Rc<Site>, on_close: EventHandler<()>) -> Element {
    let mut command = use_signal(String::new);
    let mut output = use_signal(String::new);
    let mut error = use_signal(String::new);
    let mut loading = use_signal(|| false);
    // Index into the site's newest-first history list while recalling with
    // the arrow keys; `None` = not navigating (editing a fresh command).
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

    // Newest first, matching how the list is rendered.
    let site_history: Vec<String> = state::wp_cli_history()
        .iter()
        .rev()
        .filter(|entry| entry.site == site.name)
        .map(|entry| entry.command.clone())
        .collect();

    let site_for_run = Rc::clone(&site);
    let handle_run = EventHandler::new(move |_: ()| {
        *loading.write() = true;
        *output.write() = String::new();
        *error.write() = String::new();
        *history_pos.write() = None;
        *history_draft.write() = String::new();
        let request = WpCliRequest {
            site: (*site_for_run).clone(),
            command: command.read().clone(),
        };
        spawn(async move {
            let result = wp_cli::run_wp_cli(request).await;
            match result {
                Ok(value) => {
                    *output.write() = value
                        .get("output")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    *error.write() = value
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                }
                Err(e) => {
                    *error.write() = e;
                }
            }
            *loading.write() = false;
        });
    });

    let handle_close = EventHandler::new(move |_: ()| {
        // Guard every close path (X, overlay, Escape) while a command is
        // running — the spawned task writes this scope's signals.
        if *loading.read() {
            return;
        }
        *command.write() = String::new();
        *output.write() = String::new();
        *error.write() = String::new();
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
    let is_loading = *loading.read();
    let has_output = !output.read().is_empty() || !error.read().is_empty();
    let has_history = !site_history.is_empty();
    // The input's key handler needs the list too, and the RSX loop below
    // consumes the vec (closures must own 'static data).
    let nav_history = site_history.clone();

    let footer = rsx! {
        div { class: "flex justify-end gap-2.5",
            button {
                "type": "button",
                class: "bg-gunmetal-500 hover:bg-gunmetal-600 px-4 py-2 border-0 rounded text-seasalt-400 hover:text-seasalt transition-colors duration-200 cursor-pointer",
                disabled: is_loading,
                onclick: move |_ev: MouseEvent| handle_close.clone().call(()),
                "Cancel"
            }
            button {
                "type": "submit",
                form: "wp-cli-form",
                class: "bg-pumpkin hover:bg-pumpkin-600 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-warm-charcoal disabled:text-seasalt-400 transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed",
                disabled: cmd.trim().is_empty() || is_loading,
                if is_loading {
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
                    if !*loading.read() && !command.read().trim().is_empty() {
                        handle_run.call(());
                    }
                },
                div { class: "mb-5",
                    label { class: "block mb-1 text-seasalt text-sm", "for": "wp-cli-command", "Command" }
                    input {
                        id: "wp-cli-command",
                        "type": "text",
                        class: "bg-gunmetal-500 p-2 border border-gunmetal-600 focus:border-pumpkin-500 rounded focus:outline-none w-full text-seasalt",
                        value: {cmd},
                        placeholder: "e.g. plugin list",
                        disabled: is_loading,
                        oninput: move |ev| {
                            *command.write() = ev.value();
                        },
                        onkeydown: move |ev: KeyboardEvent| {
                            match ev.key() {
                                Key::Enter => {
                                    if !*loading.read() && !command.read().trim().is_empty() {
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
                    div { class: "mt-1 text-seasalt-400 text-xs",
                        "Only enter the command after "
                        span { class: "font-bold", "wp" }
                        ", e.g. "
                        code { class: "bg-gunmetal-500 px-1 rounded", "plugin list" }
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
                            class: "bg-transparent hover:bg-gunmetal-600 px-2 py-1 border-0 rounded text-seasalt-400 hover:text-seasalt text-xs transition-colors cursor-pointer",
                            onclick: {
                                let site_name = site.name.clone();
                                move |_| {
                                    wp_cli::clear_history(&site_name);
                                }
                            },
                            "Clear"
                        }
                    }
                    div { class: "flex flex-col gap-1 max-h-40 overflow-y-auto bg-warm-charcoal-200 p-2 border border-gunmetal-600 rounded",
                        for (index, entry) in site_history.into_iter().enumerate() {
                            button {
                                key: "{index}",
                                "type": "button",
                                class: "bg-transparent hover:bg-gunmetal-500 py-1.5 px-2 border-0 rounded text-left font-mono text-seasalt-400 hover:text-seasalt text-xs truncate transition-colors cursor-pointer",
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
            if has_output {
                OutputPanel {
                    id: "wp-cli-output".to_string(),
                    output: output,
                    error: error,
                    loading: loading,
                    max_h_class: Some("max-h-75".to_string()),
                }
            }
        }
    }
}
