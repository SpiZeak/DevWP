use crate::backend::site::Site;
use crate::backend::wp_cli::{self, WpCliRequest};
use crate::components::ui::{ModalBase, Spinner};
use dioxus::document::eval;
use dioxus::prelude::*;

#[component]
pub fn WpCliModal(site: Site, on_close: EventHandler<()>) -> Element {
    let mut command = use_signal(String::new);
    let output = use_signal(String::new);
    let error = use_signal(String::new);
    let loading = use_signal(|| false);

    // Auto-scroll output as new lines arrive.
    use_effect(move || {
        let len = output.read().len() + error.read().len();
        if len > 0 {
            let _ = eval(
                "const el = document.getElementById('wp-cli-output'); if (el) el.scrollTop = el.scrollHeight;",
            )
            .send(());
        }
    });

    let site_title = site.name.clone();
    let handle_run = EventHandler::new(move |_: ()| {
        let command_s = command.clone();
        let mut output_s = output.clone();
        let mut error_s = error.clone();
        let mut loading_s = loading.clone();
        let site_s = site.clone();
        {
            *loading_s.write() = true;
            *output_s.write() = String::new();
            *error_s.write() = String::new();
            let cmd = command_s.read().clone();
            let request = WpCliRequest {
                site: site_s.clone(),
                command: cmd,
            };
            spawn(async move {
                let result = wp_cli::run_wp_cli(request).await;
                match result {
                    Ok(value) => {
                        *output_s.write() = value
                            .get("output")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        *error_s.write() = value
                            .get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                    }
                    Err(e) => {
                        *error_s.write() = e;
                    }
                }
                *loading_s.write() = false;
            });
        }
    });

    let handle_close = EventHandler::new({
        let mut command_s = command.clone();
        let mut output_s = output.clone();
        let mut error_s = error.clone();
        let on_close = on_close.clone();
        move |_: ()| {
            *command_s.write() = String::new();
            *output_s.write() = String::new();
            *error_s.write() = String::new();
            on_close.call(());
        }
    });

    let cmd = command.read().clone();
    let out = output.read().clone();
    let err = error.read().clone();
    let is_loading = loading.read().clone();
    let has_output = !out.is_empty() || !err.is_empty();

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
                    Spinner { svg_class: "size-6".to_string(), title: "Loading WP-CLI response...".to_string() }
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
            title: "Run WP-CLI Command — {site_title}",
            footer: Some(footer),
            form { id: "wp-cli-form",
                onsubmit: move |ev| {
                    ev.prevent_default();
                    if !loading.read().clone() && !command.read().clone().trim().is_empty() {
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
                            if ev.key() == Key::Enter && !loading.read().clone() {
                                ev.prevent_default();
                                if !command.read().clone().trim().is_empty() {
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
                div { class: "mb-5",
                    div { class: "block mb-1 text-seasalt text-sm",
                        "Output"
                        if is_loading { span { class: "text-amber", " ●" } }
                    }
                    pre {
                        id: "wp-cli-output",
                        class: "bg-warm-charcoal-200 p-2.5 border border-gunmetal-600 rounded max-h-75 overflow-auto font-mono text-seasalt text-xs wrap-break-word whitespace-pre-wrap",
                        if !out.is_empty() { span { class: "text-emerald", {out} } }
                        if !err.is_empty() { span { class: "text-crimson", {err} } }
                        if is_loading { span { class: "text-amber", "▊" } }
                    }
                }
            }
        }
    }
}
