use crate::backend::settings;
use crate::backend::utils::NotificationType;
use crate::components::ui::{Icon, ModalBase, Spinner};
use crate::state;
use dioxus::prelude::*;

#[component]
pub fn SettingsModal(is_open: bool, on_close: EventHandler<()>) -> Element {
    let mut webroot_path = use_signal(String::new);
    let mut original_webroot_path = use_signal(String::new);
    let mut loading = use_signal(|| false);
    let saving = use_signal(|| false);

    // Load settings on mount. The modal is mounted per-open (see app.rs), so
    // this runs fresh every time it is opened.
    use_effect(move || {
        spawn(async move {
            *loading.write() = true;
            let path = settings::get_webroot_path();
            *webroot_path.write() = path.clone();
            *original_webroot_path.write() = path;
            *loading.write() = false;
        });
    });

    let has_changes = webroot_path.read().clone() != original_webroot_path.read().clone();

    let handle_save = EventHandler::new({
        let webroot_s = webroot_path.clone();
        let mut original_s = original_webroot_path.clone();
        let mut saving_s = saving.clone();
        move |_: ()| {
            *saving_s.write() = true;
            let path = webroot_s.read().clone();
            spawn(async move {
                let result = settings::save_setting("webroot_path".to_string(), path.clone());
                if result.success {
                    *original_s.write() = path;
                    state::push_notification(
                        NotificationType::Success,
                        "Settings saved successfully",
                    );
                } else {
                    state::push_notification(
                        NotificationType::Error,
                        result
                            .error
                            .unwrap_or_else(|| "Failed to save settings".to_string()),
                    );
                }
                *saving_s.write() = false;
            });
        }
    });

    let handle_close = EventHandler::new({
        let mut webroot_s = webroot_path.clone();
        let original_s = original_webroot_path.clone();
        let on_close = on_close.clone();
        move |_: ()| {
            // Reset to original values
            *webroot_s.write() = original_s.read().clone();
            on_close.call(());
        }
    });

    let handle_pick_directory = {
        let mut webroot_s = webroot_path.clone();
        move |_ev: MouseEvent| {
            // rfd must run synchronously on the main thread (GTK panics otherwise).
            let current = webroot_s.read().clone();
            if let Some(selected) = settings::pick_directory(Some(current)) {
                *webroot_s.write() = selected;
            }
        }
    };

    let is_loading = loading.read().clone();
    let path = webroot_path.read().clone();
    let is_saving = saving.read().clone();

    rsx! {
        ModalBase {
            is_open: is_open,
            on_close: handle_close,
            title: "Settings".to_string(),
            max_width_class: Some("max-w-md".to_string()),
            overlay_class: Some("bg-black bg-opacity-50".to_string()),
            if is_loading {
                div { class: "flex justify-center py-8",
                    Spinner { title: "Loading settings...".to_string() }
                }
            } else {
                div { class: "space-y-6",
                    div {
                        label { class: "block mb-2 font-medium text-seasalt text-sm", "for": "webroot-path", "Webroot Path" }
                        div { class: "flex gap-2",
                            input {
                                id: "webroot-path",
                                "type": "text",
                                class: "flex-1 bg-gunmetal-500 p-3 border border-gunmetal-600 focus:border-pumpkin-500 rounded focus:outline-none text-seasalt",
                                value: {path.clone()},
                                placeholder: "/path/to/webroot",
                                oninput: move |ev| {
                                    *webroot_path.write() = ev.value();
                                },
                            }
                            button {
                                "type": "button",
                                class: "bg-gunmetal-500 hover:bg-gunmetal-600 px-3 py-3 border border-gunmetal-600 rounded text-seasalt-400 hover:text-seasalt transition-colors",
                                title: "Browse for directory",
                                onclick: handle_pick_directory,
                                Icon { content: "📁".to_string(), class: "text-sm".to_string() }
                            }
                        }
                        div { class: "mt-1 text-seasalt-400 text-xs",
                            "Default path where WordPress sites will be created. Default: "
                            code { class: "bg-gunmetal-500 px-1 rounded", "$HOME/www" }
                        }
                    }
                    div { class: "flex justify-end gap-2.5 pt-4 border-gunmetal-600 border-t",
                        button {
                            "type": "button",
                            class: "bg-gunmetal-500 hover:bg-gunmetal-600 px-4 py-2 border-0 rounded text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer",
                            onclick: move |_ev: MouseEvent| handle_close.call(()),
                            "Cancel"
                        }
                        button {
                            "type": "button",
                            class: "flex items-center gap-2 bg-pumpkin hover:bg-pumpkin-600 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-warm-charcoal disabled:text-seasalt-400 transition-colors cursor-pointer disabled:cursor-not-allowed",
                            disabled: !has_changes || is_saving,
                            onclick: move |_ev: MouseEvent| handle_save.call(()),
                            if is_saving {
                                Spinner { svg_class: "size-4".to_string() }
                            }
                            if is_saving { "Saving..." } else { "Save Settings" }
                        }
                    }
                }
            }
        }
    }
}
