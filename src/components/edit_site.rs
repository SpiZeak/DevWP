use crate::backend::site::{Site, SiteStatus};
use crate::components::ui::{FormInput, Icon, ModalBase};
use dioxus::prelude::*;
use std::rc::Rc;

#[derive(Clone)]
pub struct EditSiteData {
    pub site: Site,
    pub aliases: String,
    pub web_root: String,
}

#[component]
pub fn EditSiteModal(
    site: Rc<Site>,
    on_close: EventHandler<()>,
    on_submit: EventHandler<EditSiteData>,
    on_delete: EventHandler<Rc<Site>>,
) -> Element {
    let mut aliases = use_signal(String::new);
    let mut web_root = use_signal(String::new);
    let mut submitting = use_signal(|| false);

    // Populate the form when the modal opens.
    let site_for_effect = Rc::clone(&site);
    use_effect(move || {
        *aliases.write() = site_for_effect.aliases.clone().unwrap_or_default();
        *web_root.write() = site_for_effect.web_root.clone().unwrap_or_default();
        *submitting.write() = false;
    });

    let original_aliases = site.aliases.clone().unwrap_or_default();
    let original_web_root = site.web_root.clone().unwrap_or_default();
    let has_changes = *aliases.read() != original_aliases || *web_root.read() != original_web_root;
    let is_provisioning = site.status == SiteStatus::Provisioning;

    let webroot_help = rsx! {
        div { class: "mt-2 text-seasalt text-xs",
            if web_root.read().is_empty() {
                "Web server will point to the site root."
            } else {
                "Web server will point to www/"
                span { class: "font-bold text-pumpkin", "{site.name}" }
                "/"
                span { class: "font-bold text-pumpkin", "{web_root.read()}" }
                "."
            }
            br {}
            "Site accessible at "
            span { class: "font-bold text-pumpkin", "{site.url}" }
        }
    };

    let site_for_submit = Rc::clone(&site);
    let aliases_for_submit = aliases;
    let webroot_for_submit = web_root;
    let mut submitting_for_submit = submitting;
    let site_for_delete_confirm = Rc::clone(&site);

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
                disabled: !has_changes || *submitting.read(),
                onclick: move |_ev: MouseEvent| {
                    *submitting_for_submit.write() = true;
                    on_submit.call(EditSiteData {
                        site: (*site_for_submit).clone(),
                        aliases: aliases_for_submit.read().clone(),
                        web_root: webroot_for_submit.read().clone(),
                    });
                },
                if *submitting.read() { "Saving..." } else { "Save Changes" }
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
                    Icon { content: "\u{f0328}", class: "text-pumpkin" }
                    span { class: "font-semibold text-seasalt text-sm", "{site.name}" }
                }
                div { class: "text-seasalt-400 text-xs", "{site.path}" }
            }
            FormInput {
                label: "Aliases (optional, space-separated)",
                value: aliases.read().clone(),
                placeholder: "alias1.test alias2.test".to_string(),
                onchange: move |v| {
                    *aliases.write() = v;
                },
            }
            FormInput {
                label: "Web Root (optional, relative to site directory e.g. \"public\", \"dist\")",
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
                    "Deleting this site removes the site directory, nginx config, and hosts entries. The MariaDB database is kept. This action cannot be undone."
                }
                button {
                    "type": "button",
                    class: "bg-crimson hover:bg-crimson/80 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-seasalt disabled:text-seasalt-400 transition-colors cursor-pointer disabled:cursor-not-allowed",
                    title: "Delete Site",
                    disabled: is_provisioning,
                    onclick: move |_ev: MouseEvent| on_delete.call(Rc::clone(&site_for_delete_confirm)),
                    "Delete Site"
                }
            }
        }
    }
}
