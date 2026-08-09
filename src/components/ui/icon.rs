use dioxus::prelude::*;

#[component]
pub fn Icon(
    #[props(optional)] content: Option<String>,
    #[props(optional)] class: Option<String>,
) -> Element {
    let class = format!("font-mono {}", class.unwrap_or_default());
    let content = content.unwrap_or_else(|| "\u{f1e50}".to_string());
    rsx! {
        span { class: {class}, "aria-hidden": "true", {content} }
    }
}
