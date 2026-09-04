use crate::backend::site::{
    format_domain, is_valid_email, MultisiteConfig, MultisiteType, SiteCreateRequest,
    WordPressInstallConfig,
};
use crate::backend::utils::NotificationType;
use crate::components::ui::{FormInput, ModalBase, Toggle};
use crate::state;
use dioxus::prelude::*;

#[component]
pub fn CreateSiteModal(
    is_open: bool,
    on_close: EventHandler<()>,
    on_submit: EventHandler<SiteCreateRequest>,
) -> Element {
    let mut domain = use_signal(|| "example.test".to_string());
    let mut web_root = use_signal(String::new);
    let mut aliases = use_signal(String::new);
    let mut multisite_enabled = use_signal(|| false);
    let mut multisite_type = use_signal(|| MultisiteType::Subdirectory);
    let mut wp_enabled = use_signal(|| true);
    let mut wp_title = use_signal(String::new);
    let mut wp_user = use_signal(String::new);
    let mut wp_pass = use_signal(String::new);
    let mut wp_email = use_signal(String::new);
    let mut submitting = use_signal(|| false);

    // The form state initialises fresh on every mount; the parent mounts this
    // modal per-open (see site_list.rs), so no reset-on-close effect is needed.

    let handle_submit = EventHandler::new(move |_: ()| {
        if *wp_enabled.read() && !wp_email.read().is_empty() && !is_valid_email(&wp_email.read()) {
            state::push_notification(
                NotificationType::Error,
                "Please enter a valid email address",
            );
            return;
        }

        *submitting.write() = true;
        let formatted_domain = format_domain(&domain.read());
        let formatted_aliases: Vec<String> = aliases
            .read()
            .split_whitespace()
            .map(format_domain)
            .collect();
        let web_root_clean = web_root_sanitize(&web_root.read());

        let request = SiteCreateRequest {
            domain: formatted_domain,
            web_root: (!web_root_clean.is_empty()).then_some(web_root_clean),
            aliases: (!formatted_aliases.is_empty()).then(|| formatted_aliases.join(" ")),
            multisite: Some(MultisiteConfig {
                enabled: *multisite_enabled.read(),
                site_type: *multisite_type.read(),
            }),
            wordpress: (*wp_enabled.read()).then(|| WordPressInstallConfig {
                title: wp_title.read().clone(),
                admin_user: wp_user.read().clone(),
                admin_password: wp_pass.read().clone(),
                admin_email: wp_email.read().clone(),
            }),
        };
        on_submit.call(request);
    });

    let formatted_domain = format_domain(&domain.read().clone());
    let domain_current = domain.read().clone();
    let domain_wo_test = domain_current
        .strip_suffix(".test")
        .unwrap_or(&domain_current)
        .to_string();
    let is_submit_disabled = submitting.read().clone() || domain_wo_test.is_empty();
    let multisite_on = *multisite_enabled.read();
    let wp_on = *wp_enabled.read();
    let web_root_cur = web_root_sanitize(&web_root.read());

    let webroot_help = rsx! {
        div { class: "mt-2 text-seasalt text-xs",
            "Site will be created in www/"
            span { class: "font-bold text-pumpkin", {formatted_domain.clone()} }
            if web_root_cur.is_empty() {
                ". Web server will point to the site root."
            } else {
                ". Web server will point to www/"
                span { class: "font-bold text-pumpkin", {formatted_domain.clone()} }
                "/"
                span { class: "font-bold text-pumpkin", {web_root_cur.clone()} }
                "."
            }
            br {}
            "Accessible at https://"
            span { class: "font-bold text-pumpkin", {formatted_domain.clone()} }
        }
    };

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
                class: "bg-pumpkin hover:bg-pumpkin-600 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-warm-charcoal disabled:text-seasalt-300 cursor-pointer disabled:cursor-not-allowed",
                disabled: is_submit_disabled,
                onclick: move |_ev: MouseEvent| handle_submit.call(()),
                "Create"
            }
        }
    };

    rsx! {
        ModalBase {
            is_open: is_open,
            on_close: on_close,
            title: "Create New Site".to_string(),
            max_width_class: Some("max-w-lg"),
            footer: Some(footer),
            FormInput {
                label: "Domain",
                value: domain.read().clone(),
                placeholder: "example.test".to_string(),
                autofocus: Some(true),
                onchange: move |v| {
                    *domain.write() = v;
                },
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
                    *web_root.write() = web_root_sanitize(&v);
                },
            }
            div { class: "mb-8 rounded-md",
                div { class: "flex items-center gap-2 mb-6",
                    Toggle {
                        checked: multisite_on,
                        onchange: move |checked| {
                            *multisite_enabled.write() = checked;
                        },
                    }
                    label {
                        class: "ml-3 font-medium text-seasalt hover:text-pumpkin transition-colors cursor-pointer",
                        onclick: move |_| {
                            let mut e = multisite_enabled.write();
                            *e = !*e;
                        },
                        "Enable WordPress Multisite"
                    }
                }
                if multisite_on {
                    div { class: "flex gap-4",
                        MultisiteOption {
                            label: "Subdirectory",
                            example: "example.test/site2",
                            is_selected: *multisite_type.read() == MultisiteType::Subdirectory,
                            onclick: move |_| {
                                *multisite_type.write() = MultisiteType::Subdirectory;
                            },
                        }
                        MultisiteOption {
                            label: "Subdomain",
                            example: "site2.example.test",
                            is_selected: *multisite_type.read() == MultisiteType::Subdomain,
                            onclick: move |_| {
                                *multisite_type.write() = MultisiteType::Subdomain;
                            },
                        }
                    }
                }
            }
            div { class: "mb-6",
                div { class: "flex items-center gap-2 mb-2",
                    Toggle {
                        checked: wp_on,
                        onchange: move |checked| {
                            *wp_enabled.write() = checked;
                        },
                    }
                    label {
                        class: "ml-3 font-medium text-seasalt hover:text-pumpkin transition-colors cursor-pointer",
                        onclick: move |_| {
                            let mut e = wp_enabled.write();
                            *e = !*e;
                        },
                        "Install WordPress"
                    }
                }
                if wp_on {
                    div { class: "bg-gunmetal-400 mt-4 p-4 border border-gunmetal-300/30 rounded-lg",
                        FormInput {
                            label: "Site Title",
                            value: wp_title.read().clone(),
                            placeholder: formatted_domain.clone(),
                            onchange: move |v| {
                                *wp_title.write() = v;
                            },
                        }
                        p { class: "mb-3 font-semibold text-seasalt-300 text-xs uppercase tracking-wider", "Admin Credentials" }
                        div { class: "gap-3 grid grid-cols-2",
                            FormInput {
                                label: "Username",
                                value: wp_user.read().clone(),
                                placeholder: "root".to_string(),
                                onchange: move |v| {
                                    *wp_user.write() = v;
                                },
                            }
                            FormInput {
                                label: "Email",
                                value: wp_email.read().clone(),
                                placeholder: "root@example.com".to_string(),
                                input_type: Some("email"),
                                onchange: move |v| {
                                    *wp_email.write() = v;
                                },
                            }
                        }
                        FormInput {
                            label: "Password",
                            value: wp_pass.read().clone(),
                            placeholder: "root".to_string(),
                            input_type: Some("password"),
                            onchange: move |v| {
                                *wp_pass.write() = v;
                            },
                        }
                    }
                }
            }
        }
    }
}

/// Trim and strip wrapping slashes from a web-root input value.
fn web_root_sanitize(v: &str) -> String {
    v.trim()
        .trim_start_matches('/')
        .trim_end_matches('/')
        .to_string()
}

#[component]
fn MultisiteOption(
    label: &'static str,
    example: &'static str,
    is_selected: bool,
    onclick: EventHandler<()>,
) -> Element {
    let classes = format!(
        "flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-all border-2 {}",
        if is_selected {
            "border-pumpkin bg-gunmetal-400 text-pumpkin font-semibold"
        } else {
            "border-gunmetal-500 bg-gunmetal-500 hover:bg-gunmetal-400 hover:text-pumpkin hover:border-gunmetal-400"
        }
    );
    rsx! {
        button { "type": "button", class: {classes},
            onclick: move |_| onclick.call(()),
            {label}
            span {
                class: format!("ml-1 text-xs {}", if is_selected { "text-pumpkin-300" } else { "text-seasalt-300" }),
                "({example})"
            }
        }
    }
}
