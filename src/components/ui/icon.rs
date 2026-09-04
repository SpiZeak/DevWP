use dioxus::prelude::*;

#[component]
pub fn Icon(
    #[props(optional)] content: Option<&'static str>,
    #[props(optional)] class: Option<&'static str>,
) -> Element {
    let class = format!("font-mono {}", class.unwrap_or_default());
    let content = content.unwrap_or("\u{f1e50}");
    rsx! {
        span { class: {class}, "aria-hidden": "true", {content} }
    }
}
