use crate::backend::site::{self, Site, SiteCreateRequest, SiteStatus, SiteUpdateRequest};
use crate::backend::system;
use crate::backend::utils::NotificationType;
use crate::components::ui::{Icon, Spinner};
use crate::components::{
    ComposerModal, CreateSiteModal, EditSiteData, EditSiteModal, SiteInfo, SiteItem, WpCliModal,
};
use crate::state;
use dioxus::prelude::*;

/// Re-fetch sites from disk and update the global signal.
async fn refresh_sites() {
    let sites = tokio::task::spawn_blocking(site::get_sites)
        .await
        .unwrap_or_default();
    state::set_sites(sites);
}

/// Handle the error arms of a `Result<Result<T, E>, JoinError>` by pushing a
/// notification. Returns `Some(inner)` on success, `None` on any error.
fn unwrap_task_result<T, E: std::fmt::Display>(
    result: Result<Result<T, E>, tokio::task::JoinError>,
    error_context: &str,
) -> Option<T> {
    match result {
        Ok(Ok(inner)) => Some(inner),
        Ok(Err(e)) => {
            state::push_notification(NotificationType::Error, format!("{error_context}: {e}"));
            None
        }
        Err(e) => {
            state::push_notification(
                NotificationType::Error,
                format!("{error_context}: task error: {e}"),
            );
            None
        }
    }
}

#[component]
pub fn SiteList() -> Element {
    let mut create_open = use_signal(|| false);
    let mut composer_site = use_signal(|| None::<Site>);
    let mut wp_cli_site = use_signal(|| None::<Site>);
    let mut edit_site_site = use_signal(|| None::<Site>);
    let mut selected_site = use_signal(|| None::<Site>);
    let mut search_query = use_signal(String::new);

    let fetch_sites = move || {
        state::set_sites_loading(true);
        spawn(async move {
            refresh_sites().await;
            state::set_sites_loading(false);
        });
    };

    // Fetch sites on mount.
    use_effect(move || {
        fetch_sites();
    });

    let sites = state::sites().clone();
    let loading = state::sites_loading();
    let query = search_query.read().clone();
    let selected = selected_site.read().clone();

    let filtered_sites: Vec<Site> = if query.trim().is_empty() {
        sites.clone()
    } else {
        let q = query.to_lowercase();
        sites
            .iter()
            .filter(|s| {
                s.name.to_lowercase().contains(&q)
                    || s.path.to_lowercase().contains(&q)
                    || s.url.to_lowercase().contains(&q)
            })
            .cloned()
            .collect()
    };

    let handle_submit_new_site = move |data: SiteCreateRequest| {
        let domain = data.domain.clone();
        // Optimistically insert a provisioning entry.
        {
            let mut sig = *state::sites_signal();
            let mut sites = sig.write();
            sites.retain(|s| !(s.name == domain && s.status == SiteStatus::Provisioning));
            sites.insert(
                0,
                Site {
                    name: domain.clone(),
                    path: format!("www/{domain}"),
                    url: format!("https://{domain}"),
                    status: SiteStatus::Provisioning,
                    aliases: None,
                    web_root: None,
                    multisite: None,
                },
            );
        }
        spawn(async move {
            let result = tokio::task::spawn_blocking(move || site::create_site(data)).await;
            if unwrap_task_result(result, &format!("Provisioning failed for {domain}")).is_some() {
                *create_open.write() = false;
                refresh_sites().await;
                let _ = system::open_external(format!("https://{domain}"));
            }
        });
    };

    rsx! {
        div { class: "w-full",
            div { class: "flex justify-between items-center mb-6 w-full",
                div { class: "flex items-center gap-3",
                    div { class: "flex justify-center items-center bg-linear-to-br from-gunmetal-700 to-gunmetal-600 rounded-lg w-8 h-8",
                        Icon { content: "\u{f0328}".to_string(), class: "text-warm-charcoal text-lg".to_string() }
                    }
                    h3 { class: "font-bold text-seasalt text-2xl", "Sites" }
                    if !sites.is_empty() {
                        span { class: "bg-gunmetal-500 px-3 py-1 rounded-full font-medium text-seasalt-300 text-sm",
                            if !query.trim().is_empty() {
                                "{filtered_sites.len()}/{sites.len()}"
                            } else {
                                "{sites.len()}"
                            }
                        }
                    }
                }
                button {
                    class: "group flex justify-center items-center gap-2 bg-pumpkin hover:bg-pumpkin-600 hover:shadow-lg rounded-lg size-10 font-semibold text-warm-charcoal hover:scale-105 transition-all duration-200 cursor-pointer",
                    title: "Create a new site",
                    "type": "button",
                    onclick: move |_| {
                        *create_open.write() = true;
                    },
                    Icon { content: "\u{f067}".to_string(), class: "text-xl".to_string() }
                }
            }
            if let Some(site) = selected {
                SiteInfo {
                    site: site.clone(),
                    on_back: move |_| {
                        *selected_site.write() = None;
                    },
                    on_open_url: move |url: String| {
                        let _ = system::open_external(url);
                    },
                    on_composer_update: move |s: Site| {
                        *composer_site.write() = Some(s);
                    },
                    on_open_wp_cli: move |s: Site| {
                        *wp_cli_site.write() = Some(s);
                    },
                    on_edit_site: move |s: Site| {
                        *edit_site_site.write() = Some(s);
                    },
                }
            } else {
                { rsx! {
                    if !sites.is_empty() {
                        div { class: "mb-4",
                            div { class: "relative",
                                Icon { content: "\u{f0349}".to_string(), class: "top-1/2 left-3 absolute text-seasalt-400 text-lg -translate-y-1/2 transform".to_string() }
                                input {
                                    "type": "text",
                                    value: {query.clone()},
                                    "aria-label": "Search sites",
                                    placeholder: "Search sites by name, path, or URL...",
                                    class: "bg-gunmetal-500 py-2.5 pr-4 pl-10 border border-gunmetal-600 focus:border-pumpkin rounded-lg focus:outline-none focus:ring-1 focus:ring-pumpkin w-full text-seasalt transition-colors placeholder-seasalt-400",
                                    oninput: move |ev| {
                                        *search_query.write() = ev.value();
                                    },
                                }
                                if !query.is_empty() {
                                    button {
                                        class: "top-1/2 right-3 absolute text-seasalt-400 hover:text-seasalt transition-colors -translate-y-1/2 transform",
                                        title: "Clear search",
                                        "type": "button",
                                        onclick: move |_| {
                                            *search_query.write() = String::new();
                                        },
                                        Icon { content: "\u{f0156}".to_string(), class: "text-lg".to_string() }
                                    }
                                }
                            }
                        }
                    }
                    div { class: "relative",
                        div { class: "bg-gunmetal-500 shadow-2xl rounded-xl overflow-hidden",
                            ul { class: "py-2 overflow-y-auto scrollbar-hide max-h-[calc(100vh-14rem)]",
                                if loading {
                                    li { class: "flex justify-center items-center py-12",
                                        div { class: "flex items-center gap-3",
                                            Spinner { svg_class: "size-6 text-pumpkin".to_string() }
                                            span { class: "text-seasalt-300 text-lg", "Loading sites..." }
                                        }
                                    }
                                } else if filtered_sites.is_empty() {
                                    li { class: "flex flex-col justify-center items-center px-6 py-16 text-center",
                                        div { class: "flex justify-center items-center bg-gunmetal-500 mb-4 rounded-full w-16 h-16",
                                            Icon { content: if !query.trim().is_empty() { "\u{f0349}".to_string() } else { "\u{f0328}".to_string() }, class: "text-seasalt-400 text-3xl".to_string() }
                                        }
                                        h4 { class: "mb-2 font-semibold text-seasalt text-xl",
                                            if !query.trim().is_empty() { "No sites found" } else { "No sites yet" }
                                        }
                                        p { class: "max-w-xs text-seasalt-400 text-sm",
                                            if !query.trim().is_empty() {
                                                "No sites match \"{query.clone()}\". Try a different search term."
                                            } else {
                                                "Create your first WordPress development site to get started"
                                            }
                                        }
                                        if !query.trim().is_empty() {
                                            button {
                                                "type": "button",
                                                class: "mt-3 text-pumpkin hover:text-pumpkin-600 text-sm underline transition-colors",
                                                onclick: move |_| {
                                                    *search_query.write() = String::new();
                                                },
                                                "Clear search"
                                            }
                                        }
                                    }
                                } else {
                                    for (index, site) in filtered_sites.iter().enumerate() {
                                        SiteItem {
                                            key: "{site.name}",
                                            site: site.clone(),
                                            is_last: index == filtered_sites.len() - 1,
                                            on_select_site: move |s: Site| {
                                                *selected_site.write() = Some(s);
                                            },
                                            on_open_url: move |url: String| {
                                                let _ = system::open_external(url);
                                            },
                                            on_composer_update: move |s: Site| {
                                                *composer_site.write() = Some(s);
                                            },
                                            on_open_wp_cli: move |s: Site| {
                                                *wp_cli_site.write() = Some(s);
                                            },
                                            on_edit_site: move |s: Site| {
                                                *edit_site_site.write() = Some(s);
                                            },
                                        }
                                    }
                                }
                            }
                        }
                    }
                } }
            }
            // Mounted per-open so the form state initialises fresh each time.
            if create_open.read().clone() {
                CreateSiteModal {
                    is_open: true,
                    on_close: move |_| {
                        *create_open.write() = false;
                    },
                    on_submit: handle_submit_new_site.clone(),
                }
            }
            if let Some(site) = wp_cli_site.read().clone() {
                WpCliModal {
                    site: site.clone(),
                    on_close: move |_| {
                        *wp_cli_site.write() = None;
                    },
                }
            }
            if let Some(site) = composer_site.read().clone() {
                ComposerModal {
                    site: site.clone(),
                    on_close: move |_| {
                        *composer_site.write() = None;
                    },
                }
            }
            if let Some(site) = edit_site_site.read().clone() {
                EditSiteModal {
                    site: site.clone(),
                    on_close: move |_| {
                        *edit_site_site.write() = None;
                    },
                    on_submit: move |data: EditSiteData| {
                        // Normalize aliases the same way the create flow does
                        // (each token gets a TLD appended when missing).
                        let aliases = site::split_aliases(&data.aliases)
                            .map(site::format_domain)
                            .collect::<Vec<_>>()
                            .join(" ");
                        spawn(async move {
                            let result = tokio::task::spawn_blocking(move || {
                                site::update_site(
                                    data.site,
                                    SiteUpdateRequest {
                                        aliases: Some(aliases),
                                        web_root: Some(data.web_root),
                                    },
                                )
                            })
                            .await;
                            match unwrap_task_result(result, "Failed to update site") {
                                Some(op) if op.success => {
                                    *edit_site_site.write() = None;
                                    refresh_sites().await;
                                }
                                Some(op) => {
                                    state::push_notification(
                                        NotificationType::Error,
                                        op.error
                                            .unwrap_or_else(|| "Failed to update site".to_string()),
                                    );
                                }
                                None => {}
                            }
                        });
                    },
                    on_delete: move |s: Site| {
                        let confirmed = rfd::MessageDialog::new()
                            .set_title("Delete Site")
                            .set_description(format!(
                                "Are you sure you want to delete the site {}?",
                                s.name
                            ))
                            .set_buttons(rfd::MessageButtons::YesNo)
                            .show();
                        if confirmed == rfd::MessageDialogResult::Yes {
                            *edit_site_site.write() = None;
                            spawn(async move {
                                let _ =
                                    tokio::task::spawn_blocking(move || site::delete_site(s)).await;
                                refresh_sites().await;
                            });
                        }
                    },
                }
            }
        }
    }
}
