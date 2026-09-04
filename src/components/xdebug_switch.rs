use crate::backend::xdebug;
use crate::components::ui::Toggle;
use crate::state;
use dioxus::prelude::*;

#[component]
pub fn XdebugSwitch() -> Element {
    // Load the initial status once.
    use_effect(move || {
        let enabled = state::xdebug_enabled();
        if enabled.is_none() {
            spawn(async move {
                let status = xdebug::get_xdebug_status();
                state::set_xdebug_enabled(Some(status));
            });
        }
    });

    let enabled = state::xdebug_enabled();
    let toggling = state::xdebug_toggling();

    if enabled.is_none() {
        rsx! {
            div { class: "flex justify-between items-start mb-6 rounded-md",
                div { class: "flex flex-col flex-1 mr-4",
                    div { class: "flex justify-between items-center mb-2",
                        div { class: "flex items-center gap-2",
                            h3 { class: "m-0 font-medium text-seasalt-400", "Loading mode…" }
                        }
                        Toggle { checked: false, disabled: true }
                    }
                }
            }
        }
    } else {
        let enabled = enabled.unwrap_or(false);
        rsx! {
            div { class: "flex justify-between items-start mb-6 rounded-md",
                div { class: "flex flex-col flex-1 mr-4",
                    div { class: "flex justify-between items-center mb-2",
                        div { class: "flex items-center gap-2",
                            span { class: "text-lg", if enabled { "🐛" } else { "⚡" } }
                            h3 { class: "m-0 font-medium",
                                if enabled { "Debug" } else { "Performance" } { " mode" }
                            }
                        }
                        Toggle {
                            checked: enabled,
                            disabled: toggling,
                            title: Some(if enabled {
                                "Switch to Performance Mode"
                            } else {
                                "Switch to Debug Mode"
                            }),
                            onchange: move |checked| {
                                // Use the checkbox's value instead of a blind
                                // flip: if the GUI signal and the ini file
                                // diverge (e.g. `devwp xdebug on` from the
                                // CLI), one click still lands on what the
                                // user sees.
                                spawn(async move {
                                    let _ = xdebug::set_xdebug(checked).await;
                                });
                            },
                        }
                    }
                    p { class: "m-0 text-seasalt text-sm leading-relaxed",
                        if enabled {
                            "Debug mode enables Xdebug for step debugging and profiling PHP code."
                        } else {
                            "Performance mode disables Xdebug for faster PHP execution and activates JIT (Just-In-Time) compilation."
                        }
                    }
                }
            }
        }
    }
}
