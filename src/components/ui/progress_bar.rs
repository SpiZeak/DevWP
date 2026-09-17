use dioxus::prelude::*;

/// Slim progress bar. `percent` renders a determinate fill; `None` renders
/// an indeterminate sliding segment for phases with no measurable progress.
#[component]
pub fn ProgressBar(percent: Option<u8>, #[props(optional)] label: Option<String>) -> Element {
    let track =
        "overflow-hidden bg-gunmetal-300 rounded-full h-1 w-full transition-opacity".to_string();
    match percent {
        Some(p) => rsx! {
            div {
                class: {track},
                role: "progressbar",
                aria_label: label.clone().unwrap_or_default(),
                "aria-valuenow": p.to_string(),
                "aria-valuemin": "0",
                "aria-valuemax": "100",
                div {
                    class: "h-full rounded-full bg-amber-500 transition-all duration-300",
                    style: "width: {p}%",
                },
            }
        },
        None => rsx! {
            div {
                class: {track},
                role: "progressbar",
                aria_label: label.clone().unwrap_or_default(),
                "aria-valuemin": "0",
                "aria-valuemax": "100",
                div { class: "animate-progress-indeterminate h-full w-1/3 rounded-full bg-amber-500" },
            }
        },
    }
}
