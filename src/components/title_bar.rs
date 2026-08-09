//! Custom window title bar for the frameless desktop window: drag region,
//! minimize / maximize / close controls. The close button routes through
//! [`crate::app::request_shutdown`] so `docker compose down` still runs
//! before the app exits (see `src/backend/lifecycle.rs`).

use crate::app::request_shutdown;
use dioxus::desktop::window as desktop_window;
use dioxus::html::input_data::MouseButton;
use dioxus::prelude::*;

/// Minimal window controls matching the app's dark theme.
#[component]
pub fn TitleBar() -> Element {
    rsx! {
        div {
            class: "sticky top-0 z-50 flex justify-between items-center px-4 h-9 bg-warm-charcoal select-none shrink-0 cursor-default",
            // Start a native window drag on left-button press anywhere on the bar.
            onmousedown: move |ev| {
                if ev.trigger_button() == Some(MouseButton::Primary) {
                    desktop_window().drag();
                }
            },
            span { class: "font-semibold tracking-wide text-seasalt-400 text-sm", "DevWP" }
            div {
                class: "flex items-center gap-2",
                onmousedown: move |ev| ev.stop_propagation(),
                button {
                    "type": "button",
                    class: "flex justify-center items-center hover:bg-gunmetal-500 rounded-md size-7 text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer",
                    title: "Minimize",
                    "aria-label": "Minimize",
                    onclick: move |_| desktop_window().set_minimized(true),
                    svg { "aria-hidden": "true", class: "size-3", view_box: "0 0 12 12", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round",
                        line { x1: "1", y1: "6", x2: "11", y2: "6" }
                    }
                }
                button {
                    "type": "button",
                    class: "flex justify-center items-center hover:bg-gunmetal-500 rounded-md size-7 text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer",
                    title: "Maximize",
                    "aria-label": "Maximize",
                    onclick: move |_| desktop_window().toggle_maximized(),
                    svg { "aria-hidden": "true", class: "size-3", view_box: "0 0 12 12", fill: "none", stroke: "currentColor", "stroke-width": "1.5",
                        rect { x: "1.5", y: "1.5", width: "9", height: "9", "stroke-linejoin": "round", rx: "1" }
                    }
                }
                button {
                    "type": "button",
                    class: "flex justify-center items-center hover:bg-gunmetal-500 rounded-md size-7 text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer",
                    title: "Close",
                    "aria-label": "Close",
                    onclick: move |_| {
                        request_shutdown();
                        desktop_window().close();
                    },
                    svg { "aria-hidden": "true", class: "size-3", view_box: "0 0 12 12", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round",
                        line { x1: "2", y1: "2", x2: "10", y2: "10" }
                        line { x1: "10", y1: "2", x2: "2", y2: "10" }
                    }
                }
            }
        }
    }
}
