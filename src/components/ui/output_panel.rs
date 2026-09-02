use dioxus::document::eval;
use dioxus::prelude::*;

/// Shared streaming-output panel for the tool modals (wp-cli, composer):
/// auto-scrolls to the bottom as content arrives, emerald stdout / crimson
/// stderr, amber caret while running. Takes signal handles (not strings) so
/// the auto-scroll effect stays reactive to streamed writes.
#[component]
pub fn OutputPanel(
    id: String,
    output: Signal<String>,
    error: Signal<String>,
    loading: Signal<bool>,
    max_h_class: Option<String>,
) -> Element {
    let scroll_id = id.clone();
    use_effect(move || {
        let has_content = !output.read().is_empty() || !error.read().is_empty();
        if has_content {
            let script = format!(
                "const el = document.getElementById('{scroll_id}'); if (el) el.scrollTop = el.scrollHeight;"
            );
            let _ = eval(&script).send(());
        }
    });
    let out = output.read().clone();
    let err = error.read().clone();
    let is_loading = loading.read().clone();
    let max_h = max_h_class.unwrap_or_else(|| "max-h-96".to_string());

    rsx! {
        div { class: "mb-5",
            div { class: "block mb-1 text-seasalt text-sm",
                "Output"
                if is_loading { span { class: "text-amber", " ●" } }
            }
            pre {
                id: {id.clone()},
                class: format!("bg-warm-charcoal-200 p-2.5 border border-gunmetal-600 rounded {max_h} overflow-auto font-mono text-seasalt text-xs wrap-break-word whitespace-pre-wrap"),
                if !out.is_empty() { span { class: "text-emerald", {out} } }
                if !err.is_empty() { span { class: "text-crimson", {err} } }
                if is_loading { span { class: "text-amber", "▊" } }
            }
        }
    }
}
