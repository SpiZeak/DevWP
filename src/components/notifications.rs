use crate::backend::utils::NotificationPayload;
use crate::components::ui::use_sync_signal;
use crate::state;
use dioxus::prelude::*;
use std::time::Duration;

#[derive(Clone)]
struct Toast {
    id: u64,
    notification: NotificationPayload,
    leaving: bool,
}

#[component]
pub fn Notifications() -> Element {
    // SyncSignal so dismissal timers (which run on tokio) can mutate it.
    let mut toasts = use_sync_signal(Vec::<Toast>::new());
    // Highest notification seq already turned into a toast. Tracking the seq
    // (not the vec length) keeps new notifications rendering after the cap in
    // `push_notification` starts draining old entries.
    let mut last_seq = use_sync_signal(0u64);

    use_effect(move || {
        let notifications = state::notifications().clone();
        let unseen: Vec<NotificationPayload> = notifications
            .iter()
            .filter(|n| n.seq > *last_seq.read())
            .cloned()
            .collect();
        if unseen.is_empty() {
            return;
        }
        let max_seq = unseen.iter().map(|n| n.seq).max().unwrap_or(0);

        let mut ids: Vec<u64> = Vec::new();
        {
            let mut tp = toasts.write();
            for notification in unseen {
                ids.push(notification.seq);
                tp.push(Toast {
                    id: notification.seq,
                    notification,
                    leaving: false,
                });
            }
        }
        for id in ids {
            let mut toasts_task = toasts.clone();
            spawn(async move {
                // Begin exit animation slightly before removal
                tokio::time::sleep(Duration::from_millis(4700)).await;
                {
                    let mut tp = toasts_task.write();
                    if let Some(t) = tp.iter_mut().find(|t| t.id == id) {
                        t.leaving = true;
                    }
                }
                tokio::time::sleep(Duration::from_millis(300)).await;
                toasts_task.write().retain(|t| t.id != id);
            });
        }
        *last_seq.write() = max_seq;
    });

    let visible = toasts.read().clone();

    rsx! {
        div { class: "notification-container",
            for toast in visible {
                div {
                    class: format!("notification {} {}", toast.notification.notification_type,
                        if toast.leaving { "leaving" } else { "" }),
                    {toast.notification.message}
                }
            }
        }
    }
}
