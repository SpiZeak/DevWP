use crate::components::ui::Icon;
use dioxus::prelude::*;

#[component]
pub fn ModalBase(
    is_open: bool,
    on_close: EventHandler<()>,
    title: String,
    children: Element,
    #[props(optional)] overlay_class: Option<&'static str>,
    #[props(optional)] max_width_class: Option<&'static str>,
    #[props(optional)] hide_close: Option<bool>,
    #[props(optional)] footer: Option<Element>,
) -> Element {
    if !is_open {
        return Ok(VNode::placeholder());
    }

    let overlay_class = overlay_class.unwrap_or("bg-warm-charcoal/70");
    let max_width_class = max_width_class.unwrap_or("max-w-lg");
    let title_id = format!(
        "modal-title-{}",
        title.to_lowercase().replace(char::is_whitespace, "-")
    );

    rsx! {
        div {
            class: format!("z-50 fixed inset-0 flex justify-center items-center {overlay_class} animate-fade-in"),
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": {title_id.clone()},
            onclick: move |_| on_close.call(()),
            onkeydown: move |ev: KeyboardEvent| {
                if ev.key() == Key::Escape {
                    on_close.call(());
                }
            },
            div {
                class: format!("bg-gunmetal-400 shadow-xl mx-4 p-6 rounded-lg w-[90%] {max_width_class} animate-scale-in overflow-y-auto max-h-[90vh]"),
                role: "document",
                tabindex: -1,
                onclick: move |ev| ev.stop_propagation(),
                onkeydown: move |ev| ev.stop_propagation(),
                div { class: "flex justify-between items-center mb-6",
                    h2 { id: {title_id.clone()}, class: "font-semibold text-seasalt text-xl", {title.clone()} }
                    if !hide_close.unwrap_or(false) {
                        button {
                            "type": "button",
                            class: "flex justify-center items-center bg-gunmetal-500 hover:bg-gunmetal-600 rounded-full size-8 text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer",
                            "aria-label": "Close {title}",
                            title: "Close {title}",
                            onclick: move |_| on_close.call(()),
                            Icon { content: "✕", class: "text-lg" }
                        }
                    }
                }
                { children }
                { footer }
            }
        }
    }
}
