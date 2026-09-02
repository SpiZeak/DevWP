use crate::backend::system;
use crate::components::brand_logo::{BrandLogo, SI_ABOUTDOTME, SI_WORDPRESS};
use crate::components::ui::ModalBase;
use dioxus::prelude::*;

#[component]
pub fn Versions(is_open: bool, on_close: EventHandler<()>) -> Element {
    let app_version = env!("CARGO_PKG_VERSION");

    rsx! {
        ModalBase {
            is_open: is_open,
            on_close: on_close,
            title: "About DevWP".to_string(),
            max_width_class: Some("max-w-md".to_string()),
            overlay_class: Some("bg-black bg-opacity-50".to_string()),
            ul { class: "space-y-4",
                li { class: "flex justify-between items-center",
                    div { class: "flex items-center gap-2",
                        BrandLogo { icon: SI_WORDPRESS }
                        span { class: "text-seasalt-400 text-xs uppercase tracking-wide", "DevWP" }
                    }
                    span { class: "font-semibold text-seasalt text-sm", "v{app_version}" }
                }
                li { class: "flex justify-between items-center",
                    div { class: "flex items-center gap-2",
                        BrandLogo { icon: SI_ABOUTDOTME }
                        span { class: "text-seasalt-400 text-xs uppercase tracking-wide", "Developer" }
                    }
                    a {
                        href: "https://trewhitt.au",
                        target: "_blank",
                        rel: "noopener noreferrer",
                        class: "font-semibold text-pumpkin text-sm hover:underline no-underline",
                        onclick: move |ev| {
                            ev.prevent_default();
                            let _ = system::open_external("https://trewhitt.au");
                        },
                        "Trewhitt"
                    }
                }
            }
        }
    }
}
