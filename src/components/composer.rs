use crate::backend::site::Site;
use crate::backend::wp_cli;
use crate::components::ui::{ModalBase, OutputPanel, Spinner};
use dioxus::prelude::*;

#[component]
pub fn ComposerModal(site: Site, on_close: EventHandler<()>) -> Element {
    let mut output = use_signal(String::new);
    let mut error = use_signal(String::new);
    let mut loading = use_signal(|| false);
    let mut confirmed = use_signal(|| false);

    // Run composer update after the user confirms.
    let site_for_run = site.clone();
    use_effect(move || {
        if !confirmed.read().clone() {
            return;
        }
        *loading.write() = true;
        *output.write() = String::new();
        *error.write() = String::new();
        let site = site_for_run.clone();
        spawn(async move {
            let result = wp_cli::run_composer_update(site).await;
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

    let handle_close = EventHandler::new({
        let mut output_s = output.clone();
        let mut error_s = error.clone();
        let mut confirmed_s = confirmed.clone();
        let on_close = on_close.clone();
        move |_: ()| {
            if loading.read().clone() {
                return;
            }
            *output_s.write() = String::new();
            *error_s.write() = String::new();
            *confirmed_s.write() = false;
            on_close.call(());
        }
    });

    let out = output.read().clone();
    let err = error.read().clone();
    let is_loading = loading.read().clone();
    let is_confirmed = confirmed.read().clone();
    let has_output = !out.is_empty() || !err.is_empty();

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
            title: "Composer Update — {site.name}",
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
                        span { class: "font-semibold", {site.name} }
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
                        svg_class: "size-6 text-pumpkin".to_string(),
                        title: "Running composer update...".to_string(),
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
