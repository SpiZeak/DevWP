use crate::backend::site::{Site, SiteStatus};
use crate::components::ui::{Icon, Spinner};
use dioxus::prelude::*;

#[component]
pub fn SiteItem(
    site: Site,
    is_last: bool,
    on_open_url: EventHandler<String>,
    on_composer_update: EventHandler<Site>,
    on_open_wp_cli: EventHandler<Site>,
    on_edit_site: EventHandler<Site>,
    on_select_site: EventHandler<Site>,
) -> Element {
    let is_provisioning = site.status == SiteStatus::Provisioning;

    let site_for_select = site.clone();
    let site_for_select_key = site.clone();
    let site_for_directory = site.clone();
    let site_for_open = site.clone();
    let site_for_composer = site.clone();
    let site_for_wpcli = site.clone();
    let site_for_edit = site.clone();

    let li_class = if is_last {
        "animate-fade-in-up group relative bg-gunmetal-300 hover:bg-gunmetal-400 transition-all duration-200 rounded-lg mx-2 cursor-pointer mb-2"
    } else {
        "animate-fade-in-up group relative bg-gunmetal-300 hover:bg-gunmetal-400 transition-all duration-200 rounded-lg mx-2 cursor-pointer mb-3"
    };

    rsx! {
        li {
            class: {li_class},
            role: "button",
            tabindex: 0,
            onclick: move |_ev: MouseEvent| on_select_site.call(site_for_select.clone()),
            onkeydown: move |ev: KeyboardEvent| {
                if ev.key() == Key::Enter || ev.key() == Key::Character(" ".to_string()) {
                    ev.prevent_default();
                    on_select_site.call(site_for_select_key.clone());
                }
            },
            div { class: "flex justify-between items-center p-4",
                div { class: "flex-1 min-w-0",
                    div { class: "flex items-center gap-3 mb-1",
                        div { class: "flex items-center gap-2",
                            h4 { class: "font-semibold text-md text-seasalt truncate leading-tight", {site.name} }
                        }
                        if is_provisioning {
                            div { class: "flex items-center gap-2 bg-amber/20 px-2 py-1 rounded-full",
                                Spinner { svg_class: "size-3".to_string(), title: "Site is being provisioned".to_string() }
                                span { class: "font-medium text-amber text-xs", "Provisioning" }
                            }
                        }
                    }
                    div { class: "flex items-center gap-2 text-seasalt-400 text-xs",
                        Icon { content: "\u{f024b}".to_string(), class: "text-base".to_string() }
                        button {
                            "type": "button",
                            class: "hover:text-pumpkin text-left truncate transition-colors cursor-pointer",
                            title: "Open folder in file manager",
                            onclick: move |ev: MouseEvent| {
                                ev.stop_propagation();
                                let _ = crate::backend::system::open_directory(
                                    site_for_directory.path.clone(),
                                );
                            },
                            {site.path}
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
                            on_open_url.call(site_for_open.url.clone());
                        },
                        Icon { content: "\u{f08e}".to_string(), class: "text-seasalt group-hover/btn:text-warm-charcoal text-2xl".to_string() }
                    }
                    button {
                        "type": "button",
                        class: "group/btn relative bg-gunmetal-500 hover:bg-pumpkin disabled:bg-gunmetal-300 hover:shadow-lg rounded-lg size-10 hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                        disabled: is_provisioning,
                        title: if is_provisioning { "Site is being provisioned" } else { "Run Composer Update" },
                        onclick: move |ev: MouseEvent| {
                            ev.stop_propagation();
                            on_composer_update.call(site_for_composer.clone());
                        },
                        Icon { content: "\u{f03d7}".to_string(), class: "text-seasalt group-hover/btn:text-warm-charcoal text-2xl".to_string() }
                    }
                    button {
                        "type": "button",
                        class: "group/btn relative bg-gunmetal-500 hover:bg-emerald disabled:bg-gunmetal-300 hover:shadow-lg rounded-lg size-10 hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                        title: "Run WP-CLI Command",
                        disabled: is_provisioning,
                        onclick: move |ev: MouseEvent| {
                            ev.stop_propagation();
                            on_open_wp_cli.call(site_for_wpcli.clone());
                        },
                        Icon { content: "\u{f018d}".to_string(), class: "text-seasalt group-hover/btn:text-warm-charcoal text-xl".to_string() }
                    }
                    button {
                        "type": "button",
                        class: "group/btn relative bg-gunmetal-500 hover:bg-pumpkin-500 disabled:bg-gunmetal-300 hover:shadow-lg rounded-lg size-10 hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                        title: "Edit Site Settings",
                        disabled: is_provisioning,
                        onclick: move |ev: MouseEvent| {
                            ev.stop_propagation();
                            on_edit_site.call(site_for_edit.clone());
                        },
                        Icon { content: "\u{f0493}".to_string(), class: "text-seasalt group-hover/btn:text-warm-charcoal text-xl".to_string() }
                    }
                }
            }
        }
    }
}
