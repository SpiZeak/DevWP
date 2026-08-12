use crate::backend::site::{Site, SiteStatus};
use crate::components::ui::{FormInput, Icon, ModalBase};
use dioxus::prelude::*;

#[derive(Clone)]
pub struct EditSiteData {
    pub site: Site,
    pub aliases: String,
    pub web_root: String,
}

#[component]
pub fn EditSiteModal(
    site: Site,
    on_close: EventHandler<()>,
    on_submit: EventHandler<EditSiteData>,
    on_delete: EventHandler<Site>,
) -> Element {
    let mut aliases = use_signal(String::new);
    let mut web_root = use_signal(String::new);
    let mut submitting = use_signal(|| false);

    // Populate the form when the modal opens.
    let site_for_effect = site.clone();
    use_effect(move || {
        *aliases.write() = site_for_effect.aliases.clone().unwrap_or_default();
        *web_root.write() = site_for_effect.web_root.clone().unwrap_or_default();
        *submitting.write() = false;
    });

    let original_aliases = site.aliases.clone().unwrap_or_default();
    let original_web_root = site.web_root.clone().unwrap_or_default();
    let has_changes =
        aliases.read().clone() != original_aliases || web_root.read().clone() != original_web_root;
    let is_provisioning = site.status == SiteStatus::Provisioning;

    let webroot_help = rsx! {
        div { class: "mt-2 text-seasalt text-xs",
            if web_root.read().clone().is_empty() {
                "Web server will point to the site root."
            } else {
                "Web server will point to www/"
                span { class: "font-bold text-pumpkin", {site.name.clone()} }
                "/"
                span { class: "font-bold text-pumpkin", "{web_root.read().clone()}" }
                "."
            }
            br {}
            "Site accessible at "
            span { class: "font-bold text-pumpkin", {site.url.clone()} }
        }
    };

    let site_for_submit = site.clone();
    let aliases_for_submit = aliases.clone();
    let webroot_for_submit = web_root.clone();
    let mut submitting_for_submit = submitting.clone();
    let site_for_delete_confirm = site.clone();

    let footer = rsx! {
        div { class: "flex justify-end gap-2.5",
            button {
                "type": "button",
                class: "bg-gunmetal-400 hover:bg-gunmetal-300 px-4 py-2 border-0 rounded text-seasalt-300 hover:text-seasalt transition-colors cursor-pointer",
                onclick: move |_| on_close.call(()),
                "Cancel"
            }
            button {
                "type": "button",
                class: "bg-pumpkin hover:bg-pumpkin-600 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-warm-charcoal disabled:text-seasalt-400 transition-colors cursor-pointer disabled:cursor-not-allowed",
                disabled: !has_changes || submitting.read().clone(),
                onclick: move |_ev: MouseEvent| {
                    *submitting_for_submit.write() = true;
                    on_submit.call(EditSiteData {
                        site: site_for_submit.clone(),
                        aliases: aliases_for_submit.read().clone(),
                        web_root: webroot_for_submit.read().clone(),
                    });
                },
                if submitting.read().clone() { "Saving..." } else { "Save Changes" }
            }
        }
    };

    rsx! {
        ModalBase {
            is_open: true,
            on_close: on_close,
            title: "Edit Site Settings".to_string(),
            footer: Some(footer),
            div { class: "bg-gunmetal-400 mb-4 p-3 border-pumpkin border-l-4 rounded-lg",
                div { class: "flex items-center gap-2 mb-1",
                    Icon { content: "\u{f0328}".to_string(), class: "text-pumpkin".to_string() }
                    span { class: "font-semibold text-seasalt text-sm", {site.name.clone()} }
                }
                div { class: "text-seasalt-400 text-xs", {site.path.clone()} }
            }
            FormInput {
                label: "Aliases (optional, space-separated)".to_string(),
                value: aliases.read().clone(),
                placeholder: "alias1.test alias2.test".to_string(),
                onchange: move |v| {
                    *aliases.write() = v;
                },
            }
            FormInput {
                label: "Web Root (optional, relative to site directory e.g. \"public\", \"dist\")".to_string(),
                value: web_root.read().clone(),
                placeholder: "public (leave blank for site root)".to_string(),
                help_text: Some(webroot_help),
                onchange: move |v: String| {
                    *web_root.write() = v.trim().trim_start_matches('/').trim_end_matches('/').to_string();
                },
            }
            div { class: "bg-gunmetal-400/60 mt-6 px-4 py-4 border border-gunmetal-600 rounded-lg",
                h4 { class: "mb-2 font-semibold text-seasalt text-sm", "Danger Zone" }
                p { class: "mb-3 text-seasalt-400 text-xs",
                    "Deleting this site removes Docker containers, files, and the database snapshot. This action cannot be undone."
                }
                button {
                    "type": "button",
                    class: "bg-crimson hover:bg-crimson/80 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-seasalt disabled:text-seasalt-400 transition-colors cursor-pointer disabled:cursor-not-allowed",
                    title: "Delete Site",
                    disabled: is_provisioning,
                    onclick: move |_ev: MouseEvent| on_delete.call(site_for_delete_confirm.clone()),
                    "Delete Site"
                }
            }
        }
    }
}
