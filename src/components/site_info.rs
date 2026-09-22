use crate::backend::site::{Site, SiteStatus};
use crate::components::ui::{Icon, Spinner};
use dioxus::prelude::*;
use std::rc::Rc;

#[component]
pub fn SiteInfo(
    site: Rc<Site>,
    on_back: EventHandler<()>,
    on_open_url: EventHandler<String>,
    on_composer_update: EventHandler<Rc<Site>>,
    on_open_wp_cli: EventHandler<Rc<Site>>,
    on_edit_site: EventHandler<Rc<Site>>,
) -> Element {
    let is_provisioning = site.status == SiteStatus::Provisioning;

    let status_dot = match site.status {
        SiteStatus::Active => "bg-emerald-500",
        SiteStatus::Provisioning => "bg-amber-500",
        _ => "bg-seasalt-400",
    };

    // `Rc::clone` bumps a refcount; the `Site` data itself is shared, never
    // deep-copied per render.
    let site_for_directory = Rc::clone(&site);
    let site_url_button = site.url.clone();
    let site_open_action = site.url.clone();
    let site_for_composer = Rc::clone(&site);
    let site_for_wpcli = Rc::clone(&site);
    let site_for_edit = Rc::clone(&site);

    let aliases: Vec<String> = site
        .aliases
        .as_deref()
        .map(|a| {
            crate::backend::site::split_aliases(a)
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();
    let multisite_type = site
        .multisite
        .as_ref()
        .map(|m| m.site_type)
        .unwrap_or_default();

    rsx! {
        div { class: "animate-fade-in-up w-full",
            div { class: "flex justify-between items-center mb-6 w-full",
                div { class: "flex items-center gap-2.5",
                    button {
                        "type": "button",
                        class: "flex justify-center items-center bg-transparent hover:bg-raised rounded-md size-9 text-muted hover:text-seasalt transition-colors cursor-pointer",
                        title: "Back to sites list",
                        onclick: move |_| on_back.call(()),
                        Icon { content: "\u{f0141}", class: "text-xl" }
                    }
                    h3 { class: "font-semibold text-seasalt text-lg truncate max-w-[300px]", "{site.name}" }
                    if is_provisioning {
                        div { class: "flex items-center gap-1.5",
                            Spinner { svg_class: "size-3", title: "Site is being provisioned" }
                            span { class: "font-medium text-amber text-xs", "Provisioning" }
                        }
                    }
                }
            }
            div { class: "bg-surface border border-border rounded-lg overflow-hidden",
                div { class: "p-6 space-y-6",
                    div { class: "flex justify-between items-start",
                        div {
                            h4 { class: "font-medium text-seasalt text-base", "{site.name}" }
                            p { class: "text-muted text-xs mt-0.5", "Site Name" }
                        }
                        div { class: "flex items-center gap-2",
                            span { class: "inline-block w-2 h-2 rounded-full {status_dot}" }
                            span { class: "text-muted text-sm capitalize", "{site.status}" }
                        }
                    }
                    div { class: "border-t border-border" }
                    div {
                        div { class: "flex items-center gap-2 text-muted text-xs mb-1.5",
                            Icon { content: "\u{f024b}", class: "text-base" }
                            span { "Directory" }
                        }
                        button {
                            "type": "button",
                            class: "bg-sunken hover:bg-raised px-3 py-2 rounded-md w-full text-seasalt hover:text-accent text-left text-sm font-mono transition-colors cursor-pointer",
                            title: "Open folder in file manager",
                            onclick: move |_ev: MouseEvent| {
                                let _ = crate::backend::system::open_directory(&site_for_directory.path);
                            },
                            "{site.path}"
                        }
                    }
                    div {
                        div { class: "flex items-center gap-2 text-muted text-xs mb-1.5",
                            Icon { content: "\u{f059f}", class: "text-base" }
                            span { "URL" }
                        }
                        button {
                            "type": "button",
                            class: "bg-sunken hover:bg-raised px-3 py-2 rounded-md w-full text-accent text-left text-sm font-mono transition-colors cursor-pointer",
                            title: "Open site in browser",
                            onclick: move |_ev: MouseEvent| on_open_url.call(site_url_button.clone()),
                            "{site.url}"
                        }
                    }
                    if site.aliases.is_some() {
                        div {
                            div { class: "flex items-center gap-2 text-muted text-xs mb-1.5",
                                Icon { content: "\u{f01d8}", class: "text-base" }
                                span { "Aliases" }
                            }
                            div { class: "flex flex-wrap gap-2",
                                for alias in &aliases {
                                    span { key: "{alias}", class: "bg-sunken px-2 py-1 rounded-md text-muted text-xs font-mono", {alias.clone()} }
                                }
                            }
                        }
                    }
                    if site.web_root.is_some() {
                        div {
                            div { class: "flex items-center gap-2 text-muted text-xs mb-1.5",
                                Icon { content: "\u{f070c}", class: "text-base" }
                                span { "Web Root" }
                            }
                            span { class: "bg-sunken px-3 py-2 rounded-md inline-block text-muted text-sm font-mono", "{site.web_root.as_deref().unwrap_or_default()}" }
                        }
                    }
                    if site.multisite.as_ref().is_some_and(|m| m.enabled) {
                        div {
                            div { class: "flex items-center gap-2 text-muted text-xs mb-1.5",
                                Icon { content: "\u{f08fa}", class: "text-base" }
                                span { "Multisite" }
                            }
                            span { class: "bg-sunken px-3 py-2 rounded-md inline-block text-emerald-400 text-sm capitalize", "{multisite_type}" }
                        }
                    }
                    div { class: "border-t border-border" }
                    div {
                        p { class: "text-muted text-xs mb-3", "Actions" }
                        div { class: "flex flex-wrap gap-2",
                            button {
                                "type": "button",
                                class: "flex items-center gap-2 bg-transparent hover:bg-sunken disabled:opacity-40 border border-border px-4 py-2 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed",
                                title: "Open Site",
                                disabled: is_provisioning,
                                onclick: move |_ev: MouseEvent| on_open_url.call(site_open_action.clone()),
                                Icon { content: "\u{f08e}", class: "text-muted text-lg" }
                                span { class: "text-seasalt text-sm font-medium", "Open Site" }
                            }
                            button {
                                "type": "button",
                                class: "flex items-center gap-2 bg-transparent hover:bg-sunken disabled:opacity-40 border border-border px-4 py-2 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed",
                                title: "Run Composer Update",
                                disabled: is_provisioning,
                                onclick: move |_ev: MouseEvent| on_composer_update.call(Rc::clone(&site_for_composer)),
                                Icon { content: "\u{f03d7}", class: "text-muted text-lg" }
                                span { class: "text-seasalt text-sm font-medium", "Composer Update" }
                            }
                            button {
                                "type": "button",
                                class: "flex items-center gap-2 bg-transparent hover:bg-sunken disabled:opacity-40 border border-border px-4 py-2 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed",
                                title: "Run WP-CLI Command",
                                disabled: is_provisioning,
                                onclick: move |_ev: MouseEvent| on_open_wp_cli.call(Rc::clone(&site_for_wpcli)),
                                Icon { content: "\u{f018d}", class: "text-muted text-lg" }
                                span { class: "text-seasalt text-sm font-medium", "WP-CLI" }
                            }
                            button {
                                "type": "button",
                                class: "flex items-center gap-2 bg-transparent hover:bg-sunken disabled:opacity-40 border border-border px-4 py-2 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed",
                                title: "Edit Site Settings",
                                disabled: is_provisioning,
                                onclick: move |_ev: MouseEvent| on_edit_site.call(Rc::clone(&site_for_edit)),
                                Icon { content: "\u{f0493}", class: "text-muted text-lg" }
                                span { class: "text-seasalt text-sm font-medium", "Edit" }
                            }
                        }
                    }
                }
            }
        }
    }
}
