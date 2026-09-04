use crate::backend::site::Site;
use crate::backend::wp_cli::{self, WpCliRequest};
use crate::components::ui::{ModalBase, OutputPanel, Spinner};
use dioxus::prelude::*;
use std::rc::Rc;

#[component]
pub fn WpCliModal(site: Rc<Site>, on_close: EventHandler<()>) -> Element {
    let mut command = use_signal(String::new);
    let mut output = use_signal(String::new);
    let mut error = use_signal(String::new);
    let mut loading = use_signal(|| false);

    let site_for_run = Rc::clone(&site);
    let handle_run = EventHandler::new(move |_: ()| {
        *loading.write() = true;
        *output.write() = String::new();
        *error.write() = String::new();
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
        on_close.call(());
    });

    let cmd = command.read().clone();
    let is_loading = *loading.read();
    let has_output = !output.read().is_empty() || !error.read().is_empty();

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
                        onkeydown: move |ev| {
                            if ev.key() == Key::Enter && !*loading.read() {
                                ev.prevent_default();
                                if !command.read().trim().is_empty() {
                                    handle_run.call(());
                                }
                            }
                        },
                    }
                    div { class: "mt-1 text-seasalt-400 text-xs",
                        "Only enter the command after "
                        span { class: "font-bold", "wp" }
                        ", e.g. "
                        code { class: "bg-gunmetal-500 px-1 rounded", "plugin list" }
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
