use crate::backend::site::{Site, SiteStatus};
use crate::components::ui::{Icon, Spinner};
use dioxus::prelude::*;
use std::rc::Rc;

#[component]
pub fn SiteItem(
    site: Rc<Site>,
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

    rsx! {
        li {
            class: "animate-fade-in-up group relative transition-colors hover:bg-sunken cursor-pointer",
            role: "button",
            tabindex: 0,
            onclick: move |_ev: MouseEvent| on_select_site.call(Rc::clone(&site_for_select)),
            onkeydown: move |ev: KeyboardEvent| {
                if ev.key() == Key::Enter || ev.key() == Key::Character(" ".to_string()) {
                    ev.prevent_default();
                    on_select_site.call(Rc::clone(&site_for_select_key));
                }
            },
            div { class: "flex justify-between items-center px-4 py-3",
                div { class: "flex-1 min-w-0",
                    div { class: "flex items-center gap-3 mb-1",
                        div { class: "flex items-center gap-2",
                            h4 { class: "font-medium text-sm text-seasalt truncate leading-tight", "{site.name}" }
                        }
                        if is_provisioning {
                            div { class: "flex items-center gap-1.5",
                                Spinner { svg_class: "size-3", title: "Site is being provisioned" }
                                span { class: "font-medium text-amber text-xs", "Provisioning" }
                            }
                        }
                    }
                    div { class: "flex items-center gap-2 text-muted text-xs",
                        Icon { content: "\u{f024b}", class: "text-base" }
                        button {
                            "type": "button",
                            class: "hover:text-accent text-left truncate transition-colors cursor-pointer",
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
                        class: "bg-transparent hover:bg-raised disabled:opacity-40 rounded-md size-9 text-muted hover:text-seasalt transition-colors cursor-pointer disabled:cursor-not-allowed",
                        title: "Open Site",
                        disabled: is_provisioning,
                        onclick: move |ev: MouseEvent| {
                            ev.stop_propagation();
                            on_open_url.call(url_for_open.clone());
                        },
                        Icon { content: "\u{f08e}", class: "text-2xl" }
                    }
                    button {
                        "type": "button",
                        class: "bg-transparent hover:bg-raised disabled:opacity-40 rounded-md size-9 text-muted hover:text-seasalt transition-colors cursor-pointer disabled:cursor-not-allowed",
                        disabled: is_provisioning,
                        title: if is_provisioning { "Site is being provisioned" } else { "Run Composer Update" },
                        onclick: move |ev: MouseEvent| {
                            ev.stop_propagation();
                            on_composer_update.call(Rc::clone(&site_for_composer));
                        },
                        Icon { content: "\u{f03d7}", class: "text-2xl" }
                    }
                    button {
                        "type": "button",
                        class: "bg-transparent hover:bg-raised disabled:opacity-40 rounded-md size-9 text-muted hover:text-seasalt transition-colors cursor-pointer disabled:cursor-not-allowed",
                        title: "Run WP-CLI Command",
                        disabled: is_provisioning,
                        onclick: move |ev: MouseEvent| {
                            ev.stop_propagation();
                            on_open_wp_cli.call(Rc::clone(&site_for_wpcli));
                        },
                        Icon { content: "\u{f018d}", class: "text-xl" }
                    }
                    button {
                        "type": "button",
                        class: "bg-transparent hover:bg-raised disabled:opacity-40 rounded-md size-9 text-muted hover:text-seasalt transition-colors cursor-pointer disabled:cursor-not-allowed",
                        title: "Edit Site Settings",
                        disabled: is_provisioning,
                        onclick: move |ev: MouseEvent| {
                            ev.stop_propagation();
                            on_edit_site.call(Rc::clone(&site_for_edit));
                        },
                        Icon { content: "\u{f0493}", class: "text-xl" }
                    }
                }
            }
        }
    }
}
