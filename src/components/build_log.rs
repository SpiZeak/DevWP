use crate::components::ui::use_sync_signal;
use crate::state;
use dioxus::document::eval;
use dioxus::prelude::*;

#[component]
pub fn BuildLog(is_building: bool) -> Element {
    let mut is_open = use_sync_signal(true);
    let mut was_building = use_sync_signal(false);

    // Re-open the panel when a new build cycle starts (mirrors the old
    // renderer). Driven by the building-services signal rather than the
    // `is_building` prop, because dioxus `use_effect` only re-runs on signal
    // reads — plain prop changes are not reactive.
    use_effect(move || {
        let building_now = !state::building_services().is_empty();
        let mut was = was_building.write();
        if building_now && !*was {
            let mut open = is_open.write();
            *open = true;
        }
        *was = building_now;
    });

    let logs_sig = state::build_logs_signal();

    // Auto-scroll to the bottom when new lines arrive.
    use_effect(move || {
        let count = logs_sig.read().len();
        if count > 0 && is_open.read().clone() {
            let _ = eval(
                "const el = document.getElementById('build-log-content'); if (el) el.scrollTop = el.scrollHeight;",
            )
            .send(());
        }
    });

    let logs = logs_sig.read().clone();
    if !is_building && logs.is_empty() {
        return Ok(VNode::placeholder());
    }

    let open = is_open.read().clone();

    rsx! {
        div { class: "bg-gunmetal-600 mt-4 rounded-lg overflow-hidden animate-fade-in-up",
            button {
                "type": "button",
                class: "flex justify-between items-center hover:bg-gunmetal-500 px-3 py-2 w-full text-left transition-colors",
                onclick: move |_ev: MouseEvent| {
                    let mut open = is_open.write();
                    *open = !*open;
                },
                "aria-expanded": open.to_string(),
                "aria-controls": "build-log-content",
                span { class: "font-medium text-seasalt text-sm",
                    if is_building { "Build Output" } else { "Build Output (complete)" }
                }
                span {
                    class: "text-seasalt-400 text-xs transition-transform duration-200",
                    style: format!(
                        "display: inline-block; transform: {}",
                        if open { "rotate(0deg)" } else { "rotate(-90deg)" }
                    ),
                    "▾"
                }
            }
            div {
                id: "build-log-content",
                class: "overflow-y-auto font-mono text-green-400 text-xs leading-relaxed transition-[max-height,padding] duration-300 ease-in-out",
                style: format!(
                    "max-height: {}; padding: {}",
                    if open { "13rem" } else { "0" },
                    if open { "0.5rem 0.75rem" } else { "0 0.75rem" }
                ),
                if logs.is_empty() {
                    span { class: "text-seasalt-400", "Waiting for output…" }
                } else {
                    for (i, line) in logs.iter().cloned().enumerate() {
                        div { key: "{i}", class: "break-all whitespace-pre-wrap", {line} }
                    }
                }
            }
        }
    }
}
