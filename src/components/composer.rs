use crate::backend::site::Site;
use crate::backend::wp_cli;
use crate::components::ui::{ModalBase, OutputPanel, Spinner};
use dioxus::prelude::*;
use std::rc::Rc;

#[component]
pub fn ComposerModal(site: Rc<Site>, on_close: EventHandler<()>) -> Element {
    let mut output = use_signal(String::new);
    let mut error = use_signal(String::new);
    let mut loading = use_signal(|| false);
    let mut confirmed = use_signal(|| false);

    // Run composer update after the user confirms.
    let site_for_run = Rc::clone(&site);
    use_effect(move || {
        if !*confirmed.read() {
            return;
        }
        *loading.write() = true;
        *output.write() = String::new();
        *error.write() = String::new();
        let site = Rc::clone(&site_for_run);
        spawn(async move {
            let result = wp_cli::run_composer_update((*site).clone()).await;
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
        *output.write() = String::new();
        *error.write() = String::new();
        *confirmed.write() = false;
        on_close.call(());
    });

    let is_loading = *loading.read();
    let is_confirmed = *confirmed.read();
    let has_output = !output.read().is_empty() || !error.read().is_empty();

    let footer = rsx! {
        div { class: "flex justify-end gap-2.5",
            if has_output && !is_loading {
                button {
                    "type": "button",
                    class: "bg-gunmetal-400 hover:bg-gunmetal-300 px-4 py-2 border-0 rounded text-seasalt-300 hover:text-seasalt transition-colors cursor-pointer",
                    onclick: move |_| {
                        *confirmed.write() = false;
                    },
                    "Run Again"
                }
            }
            button {
                "type": "button",
                class: "bg-gunmetal-500 hover:bg-gunmetal-600 disabled:opacity-50 px-4 py-2 border-0 rounded text-seasalt-400 hover:text-seasalt transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed",
                disabled: is_loading,
                onclick: move |_ev: MouseEvent| handle_close.call(()),
                "Close"
            }
        }
    };

    rsx! {
        ModalBase {
            is_open: true,
            on_close: handle_close,
            title: format!("Composer Update — {}", site.name),
            footer: Some(footer),
            if !is_confirmed {
                div { class: "text-center py-4",
                    div { class: "flex justify-center items-center bg-amber/10 mb-4 rounded-full w-14 h-14 mx-auto",
                        span { class: "text-amber text-2xl", "⚠" }
                    }
                    p { class: "mb-1 text-seasalt",
                        "Run "
                        code { class: "bg-gunmetal-500 px-1.5 py-0.5 rounded font-bold text-pumpkin text-sm", "composer update" }
                        " for "
                        span { class: "font-semibold", "{site.name}" }
                        "?"
                    }
                    p { class: "mb-6 text-seasalt-400 text-xs",
                        "This will update all Composer dependencies. It may take a moment."
                    }
                    div { class: "flex justify-center gap-3",
                        button {
                            "type": "button",
                            class: "bg-gunmetal-500 hover:bg-gunmetal-600 px-4 py-2 rounded text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer",
                            onclick: move |_ev: MouseEvent| handle_close.call(()),
                            "Cancel"
                        }
                        button {
                            "type": "button",
                            class: "bg-pumpkin hover:bg-pumpkin-600 px-4 py-2 rounded font-semibold text-warm-charcoal transition-colors cursor-pointer",
                            onclick: move |_| {
                                *confirmed.write() = true;
                            },
                            "Run Update"
                        }
                    }
                }
            } else if is_loading && !has_output {
                div { class: "flex justify-center items-center gap-3 py-6",
                    Spinner {
                        svg_class: "size-6 text-pumpkin",
                        title: "Running composer update...",
                    }
                    span { class: "text-seasalt-400 text-sm", "Running composer update…" }
                }
            } else if has_output {
                OutputPanel {
                    id: "composer-output".to_string(),
                    output: output,
                    error: error,
                    loading: loading,
                    max_h_class: Some("max-h-96".to_string()),
                }
            }
        }
    }
}
