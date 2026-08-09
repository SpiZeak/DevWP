use crate::backend::lifecycle;
use crate::components::{Notifications, Services, SettingsModal, SiteList, Versions};
use crate::state;
use dioxus::desktop::{
    tao::event::{Event, WindowEvent},
    use_window, use_wry_event_handler, window as desktop_window, WindowCloseBehaviour,
};
use dioxus::document::Stylesheet;
use dioxus::prelude::*;
use std::sync::atomic::{AtomicBool, Ordering};

static SHUTDOWN_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Root component.
pub fn app() -> Element {
    // Create every global signal in the root scope so the signals outlive all
    // child scopes. Lazily-first-touching them in a child scope would tie
    // their storage to that scope's owner.
    state::init_globals();

    // Inject the (embedded) stylesheet.
    rsx! {
        Stylesheet { href: "devwp:///assets/style.css" }
        AppRoot {}
    }
}

#[allow(non_snake_case)]
fn AppRoot() -> Element {
    let mut settings_open = use_signal(|| false);
    let mut versions_open = use_signal(|| false);

    // Compose-up on launch (mirrors the previous setup hook).
    use_effect(move || {
        spawn(async move {
            lifecycle::start_services().await;
        });
    });

    // Close interception: the window starts in "hide" mode. On CloseRequested
    // we run `docker compose down` in the background; when it completes the
    // shutdown-done signal fires and the effect below closes the window for
    // real.
    let window = use_window();
    window.set_close_behavior(WindowCloseBehaviour::WindowHides);

    use_effect(move || {
        use_wry_event_handler(move |event, _| {
            if let Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } = event
            {
                if !SHUTDOWN_REQUESTED.swap(true, Ordering::SeqCst) {
                    spawn(async move {
                        lifecycle::stop_services().await;
                    });
                }
            }
        });
    });

    // When compose-down finishes, close for real.
    use_effect(move || {
        if state::shutdown_done() {
            let window = desktop_window();
            window.set_close_behavior(WindowCloseBehaviour::WindowCloses);
            window.close();
        }
    });

    let settings_is_open = settings_open.read().clone();
    let versions_is_open = versions_open.read().clone();

    rsx! {
        ErrorBoundary {
            handle_error: move |errors: ErrorContext| {
                rsx! {
                    div { class: "flex flex-col justify-center items-center bg-warm-charcoal p-8 h-screen text-seasalt select-none",
                        div { class: "flex justify-center items-center bg-crimson/10 mb-4 rounded-full w-16 h-16",
                            span { class: "text-crimson text-3xl", "⚠" }
                        }
                        h1 { class: "mb-2 font-bold text-seasalt text-xl", "Something went wrong" }
                        p { class: "mb-1 max-w-md text-seasalt-400 text-sm text-center",
                            "DevWP encountered an unexpected error."
                        }
                        button {
                            "type": "button",
                            class: "bg-pumpkin hover:bg-pumpkin-600 px-4 py-2 rounded font-semibold text-warm-charcoal transition-colors cursor-pointer",
                            onclick: move |_| errors.clear_errors(),
                            "Reload App"
                        }
                    }
                }
            },
            h1 { class: "sr-only", "DevWP" }
            div { class: "grid grid-cols-[40%_60%] p-6 w-full",
                Services {
                    on_open_settings: move |_| {
                        *settings_open.write() = true;
                    },
                    on_open_versions: move |_| {
                        *versions_open.write() = true;
                    },
                }
                SiteList {}
            }
            if versions_is_open {
                Versions {
                    is_open: true,
                    on_close: move |_| {
                        *versions_open.write() = false;
                    },
                }
            }
            Notifications {}
            // Mounted per-open so the settings form loads fresh each time.
            if settings_is_open {
                SettingsModal {
                    is_open: true,
                    on_close: move |_| {
                        *settings_open.write() = false;
                    },
                }
            }
            footer { class: "mt-auto p-6 text-seasalt text-sm text-center",
                p { class: "inline-block opacity-25 hover:opacity-100 m-0 font-medium transition-opacity",
                    "Crafted by "
                    a {
                        href: "https://github.com/SpiZeak",
                        target: "_blank",
                        rel: "noopener noreferrer",
                        class: "group inline-flex items-center gap-1 hover:text-pumpkin transition-colors",
                        onclick: move |ev| {
                            ev.prevent_default();
                            let _ = crate::backend::system::open_external(
                                "https://github.com/SpiZeak".to_string(),
                            );
                        },
                        "SpiZeak"
                        span { class: "opacity-0 group-hover:opacity-100 transition-opacity", "↗" }
                    }
                }
            }
        }
    }
}
