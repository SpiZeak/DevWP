use crate::backend::site::Site;
use crate::components::ui::{Icon, Spinner};
use dioxus::prelude::*;

#[component]
pub fn SiteInfo(
    site: Site,
    on_back: EventHandler<()>,
    on_open_url: EventHandler<String>,
    on_composer_update: EventHandler<Site>,
    on_open_wp_cli: EventHandler<Site>,
    on_edit_site: EventHandler<Site>,
) -> Element {
    let is_provisioning = site.status == "provisioning";

    let status_dot = if site.status == "active" {
        "bg-emerald-500"
    } else if site.status == "provisioning" {
        "bg-amber-500"
    } else {
        "bg-seasalt-400"
    };

    let site_for_directory = site.clone();
    let site_url_button = site.url.clone();
    let site_open_action = site.url.clone();
    let site_for_composer = site.clone();
    let site_for_wpcli = site.clone();
    let site_for_edit = site.clone();

    let aliases: Vec<String> = site
        .aliases
        .clone()
        .map(|a| {
            a.split(|c: char| c.is_whitespace() || c == ',')
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();

    rsx! {
        div { class: "animate-fade-in-up w-full",
            div { class: "flex justify-between items-center mb-6 w-full",
                div { class: "flex items-center gap-3",
                    button {
                        "type": "button",
                        class: "group flex justify-center items-center bg-gunmetal-500 hover:bg-pumpkin hover:shadow-lg rounded-lg size-10 hover:scale-105 transition-all duration-200 cursor-pointer",
                        title: "Back to sites list",
                        onclick: move |_| on_back.call(()),
                        Icon { content: "\u{f0141}".to_string(), class: "text-seasalt group-hover:text-warm-charcoal text-xl".to_string() }
                    }
                    div { class: "flex justify-center items-center bg-linear-to-br from-pumpkin to-pumpkin-600 rounded-lg w-8 h-8",
                        Icon { content: "\u{f0328}".to_string(), class: "text-warm-charcoal text-lg".to_string() }
                    }
                    h3 { class: "font-bold text-seasalt text-2xl truncate max-w-[200px]", {site.name.clone()} }
                    if is_provisioning {
                        div { class: "flex items-center gap-2 bg-amber/20 px-3 py-1 rounded-full",
                            Spinner { svg_class: "size-3".to_string(), title: "Site is being provisioned".to_string() }
                            span { class: "font-medium text-amber text-xs", "Provisioning" }
                        }
                    }
                }
            }
            div { class: "bg-gunmetal-500 shadow-2xl rounded-xl overflow-hidden",
                div { class: "p-6 space-y-6",
                    div { class: "flex justify-between items-start",
                        div {
                            h4 { class: "font-semibold text-seasalt text-lg", {site.name.clone()} }
                            p { class: "text-seasalt-400 text-xs mt-0.5", "Site Name" }
                        }
                        div { class: "flex items-center gap-2",
                            span { class: "inline-block w-2 h-2 rounded-full {status_dot.clone()}" }
                            span { class: "text-seasalt-300 text-sm capitalize", {site.status.clone()} }
                        }
                    }
                    div { class: "border-t border-gunmetal-600" }
                    div {
                        div { class: "flex items-center gap-2 text-seasalt-400 text-xs mb-1.5",
                            Icon { content: "\u{f024b}".to_string(), class: "text-base".to_string() }
                            span { "Directory" }
                        }
                        button {
                            "type": "button",
                            class: "bg-gunmetal-400 hover:bg-gunmetal-600 px-3 py-2 rounded-lg w-full text-seasalt hover:text-pumpkin text-left text-sm font-mono transition-colors cursor-pointer",
                            title: "Open folder in file manager",
                            onclick: move |_ev: MouseEvent| {
                                let _ = crate::backend::system::open_directory(
                                    site_for_directory.path.clone(),
                                );
                            },
                            {site.path.clone()}
                        }
                    }
                    div {
                        div { class: "flex items-center gap-2 text-seasalt-400 text-xs mb-1.5",
                            Icon { content: "\u{f059f}".to_string(), class: "text-base".to_string() }
                            span { "URL" }
                        }
                        button {
                            "type": "button",
                            class: "bg-gunmetal-400 hover:bg-pumpkin hover:text-warm-charcoal px-3 py-2 rounded-lg w-full text-seasalt text-left text-sm font-mono transition-colors cursor-pointer",
                            title: "Open site in browser",
                            onclick: move |_ev: MouseEvent| on_open_url.call(site_url_button.clone()),
                            {site.url.clone()}
                        }
                    }
                    if site.aliases.is_some() {
                        div {
                            div { class: "flex items-center gap-2 text-seasalt-400 text-xs mb-1.5",
                                Icon { content: "\u{f01d8}".to_string(), class: "text-base".to_string() }
                                span { "Aliases" }
                            }
                            div { class: "flex flex-wrap gap-2",
                                for alias in aliases.clone() {
                                    span { key: "{alias}", class: "bg-gunmetal-400 px-2.5 py-1 rounded-md text-seasalt-300 text-xs font-mono", {alias} }
                                }
                            }
                        }
                    }
                    if site.web_root.is_some() {
                        div {
                            div { class: "flex items-center gap-2 text-seasalt-400 text-xs mb-1.5",
                                Icon { content: "\u{f070c}".to_string(), class: "text-base".to_string() }
                                span { "Web Root" }
                            }
                            span { class: "bg-gunmetal-400 px-3 py-2 rounded-lg inline-block text-seasalt-300 text-sm font-mono", "{site.web_root.clone().unwrap_or_default()}" }
                        }
                    }
                    if site.multisite.as_ref().is_some_and(|m| m.enabled) {
                        div {
                            div { class: "flex items-center gap-2 text-seasalt-400 text-xs mb-1.5",
                                Icon { content: "\u{f08fa}".to_string(), class: "text-base".to_string() }
                                span { "Multisite" }
                            }
                            span { class: "bg-gunmetal-400 px-3 py-2 rounded-lg inline-block text-emerald-400 text-sm capitalize", "{site.multisite.as_ref().map(|m| m.site_type.clone()).unwrap_or_default()}" }
                        }
                    }
                    div { class: "border-t border-gunmetal-600" }
                    div {
                        p { class: "text-seasalt-400 text-xs mb-3", "Actions" }
                        div { class: "flex flex-wrap gap-2",
                            button {
                                "type": "button",
                                class: "flex items-center gap-2 bg-gunmetal-400 hover:bg-pumpkin disabled:bg-gunmetal-300 hover:shadow-lg px-4 py-2.5 rounded-lg hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                                title: "Open Site",
                                disabled: is_provisioning,
                                onclick: move |_ev: MouseEvent| on_open_url.call(site_open_action.clone()),
                                Icon { content: "\u{f08e}".to_string(), class: "text-seasalt group-hover/btn:text-warm-charcoal text-lg".to_string() }
                                span { class: "text-seasalt text-sm font-medium", "Open Site" }
                            }
                            button {
                                "type": "button",
                                class: "flex items-center gap-2 bg-gunmetal-400 hover:bg-pumpkin disabled:bg-gunmetal-300 hover:shadow-lg px-4 py-2.5 rounded-lg hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                                title: "Run Composer Update",
                                disabled: is_provisioning,
                                onclick: move |_ev: MouseEvent| on_composer_update.call(site_for_composer.clone()),
                                Icon { content: "\u{f03d7}".to_string(), class: "text-seasalt text-lg".to_string() }
                                span { class: "text-seasalt text-sm font-medium", "Composer Update" }
                            }
                            button {
                                "type": "button",
                                class: "flex items-center gap-2 bg-gunmetal-400 hover:bg-emerald disabled:bg-gunmetal-300 hover:shadow-lg px-4 py-2.5 rounded-lg hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                                title: "Run WP-CLI Command",
                                disabled: is_provisioning,
                                onclick: move |_ev: MouseEvent| on_open_wp_cli.call(site_for_wpcli.clone()),
                                Icon { content: "\u{f018d}".to_string(), class: "text-seasalt text-lg".to_string() }
                                span { class: "text-seasalt text-sm font-medium", "WP-CLI" }
                            }
                            button {
                                "type": "button",
                                class: "flex items-center gap-2 bg-gunmetal-400 hover:bg-pumpkin-500 disabled:bg-gunmetal-300 hover:shadow-lg px-4 py-2.5 rounded-lg hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                                title: "Edit Site Settings",
                                disabled: is_provisioning,
                                onclick: move |_ev: MouseEvent| on_edit_site.call(site_for_edit.clone()),
                                Icon { content: "\u{f0493}".to_string(), class: "text-seasalt text-lg".to_string() }
                                span { class: "text-seasalt text-sm font-medium", "Edit" }
                            }
                        }
                    }
                }
            }
        }
    }
}
