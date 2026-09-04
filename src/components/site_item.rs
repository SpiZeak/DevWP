use crate::backend::site::{Site, SiteStatus};
use crate::components::ui::{Icon, Spinner};
use dioxus::prelude::*;
use std::rc::Rc;

#[component]
pub fn SiteItem(
    site: Rc<Site>,
    is_last: bool,
    on_open_url: EventHandler<String>,
    on_composer_update: EventHandler<Rc<Site>>,
    on_open_wp_cli: EventHandler<Rc<Site>>,
    on_edit_site: EventHandler<Rc<Site>>,
    on_select_site: EventHandler<Rc<Site>>,
) -> Element {
    let is_provisioning = site.status == SiteStatus::Provisioning;

    // `Rc::clone` bumps a refcount; the `Site` data itself is shared, never
    // deep-copied per render.
    let site_for_select = Rc::clone(&site);
    let site_for_select_key = Rc::clone(&site);
    let site_for_directory = Rc::clone(&site);
    let url_for_open = site.url.clone();
    let site_for_composer = Rc::clone(&site);
    let site_for_wpcli = Rc::clone(&site);
    let site_for_edit = Rc::clone(&site);

    let li_class = format!(
        "animate-fade-in-up group relative bg-gunmetal-300 hover:bg-gunmetal-400 transition-all duration-200 rounded-lg mx-2 cursor-pointer mb-{}",
        if is_last { 2 } else { 3 }
    );

    rsx! {
        li {
            class: {li_class},
            role: "button",
            tabindex: 0,
            onclick: move |_ev: MouseEvent| on_select_site.call(Rc::clone(&site_for_select)),
            onkeydown: move |ev: KeyboardEvent| {
                if ev.key() == Key::Enter || ev.key() == Key::Character(" ".to_string()) {
                    ev.prevent_default();
                    on_select_site.call(Rc::clone(&site_for_select_key));
                }
            },
            div { class: "flex justify-between items-center p-4",
                div { class: "flex-1 min-w-0",
                    div { class: "flex items-center gap-3 mb-1",
                        div { class: "flex items-center gap-2",
                            h4 { class: "font-semibold text-base text-seasalt truncate leading-tight", "{site.name}" }
                        }
                        if is_provisioning {
                            div { class: "flex items-center gap-2 bg-amber/20 px-2 py-1 rounded-full",
                                Spinner { svg_class: "size-3", title: "Site is being provisioned" }
                                span { class: "font-medium text-amber text-xs", "Provisioning" }
                            }
                        }
                    }
                    div { class: "flex items-center gap-2 text-seasalt-400 text-xs",
                        Icon { content: "\u{f024b}", class: "text-base" }
                        button {
                            "type": "button",
                            class: "hover:text-pumpkin text-left truncate transition-colors cursor-pointer",
                            title: "Open folder in file manager",
                            onclick: move |ev: MouseEvent| {
                                ev.stop_propagation();
                                let _ = crate::backend::system::open_directory(&site_for_directory.path);
                            },
                            "{site.path}"
                        }
                    }
                }
                div { class: "flex items-center gap-1",
                    button {
                        "type": "button",
                        class: "group/btn relative bg-gunmetal-500 hover:bg-pumpkin disabled:bg-gunmetal-300 hover:shadow-lg rounded-lg size-10 hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                        title: "Open Site",
                        disabled: is_provisioning,
                        onclick: move |ev: MouseEvent| {
                            ev.stop_propagation();
                            on_open_url.call(url_for_open.clone());
                        },
                        Icon { content: "\u{f08e}", class: "text-seasalt group-hover/btn:text-warm-charcoal text-2xl" }
                    }
                    button {
                        "type": "button",
                        class: "group/btn relative bg-gunmetal-500 hover:bg-pumpkin disabled:bg-gunmetal-300 hover:shadow-lg rounded-lg size-10 hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                        disabled: is_provisioning,
                        title: if is_provisioning { "Site is being provisioned" } else { "Run Composer Update" },
                        onclick: move |ev: MouseEvent| {
                            ev.stop_propagation();
                            on_composer_update.call(Rc::clone(&site_for_composer));
                        },
                        Icon { content: "\u{f03d7}", class: "text-seasalt group-hover/btn:text-warm-charcoal text-2xl" }
                    }
                    button {
                        "type": "button",
                        class: "group/btn relative bg-gunmetal-500 hover:bg-emerald disabled:bg-gunmetal-300 hover:shadow-lg rounded-lg size-10 hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                        title: "Run WP-CLI Command",
                        disabled: is_provisioning,
                        onclick: move |ev: MouseEvent| {
                            ev.stop_propagation();
                            on_open_wp_cli.call(Rc::clone(&site_for_wpcli));
                        },
                        Icon { content: "\u{f018d}", class: "text-seasalt group-hover/btn:text-warm-charcoal text-xl" }
                    }
                    button {
                        "type": "button",
                        class: "group/btn relative bg-gunmetal-500 hover:bg-pumpkin-500 disabled:bg-gunmetal-300 hover:shadow-lg rounded-lg size-10 hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                        title: "Edit Site Settings",
                        disabled: is_provisioning,
                        onclick: move |ev: MouseEvent| {
                            ev.stop_propagation();
                            on_edit_site.call(Rc::clone(&site_for_edit));
                        },
                        Icon { content: "\u{f0493}", class: "text-seasalt group-hover/btn:text-warm-charcoal text-xl" }
                    }
                }
            }
        }
    }
}
