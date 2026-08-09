use crate::backend::utils::NotificationPayload;
use crate::components::ui::use_sync_signal;
use crate::state;
use dioxus::prelude::*;
use std::time::Duration;

#[derive(Clone)]
struct Toast {
    id: usize,
    notification: NotificationPayload,
    leaving: bool,
}

#[component]
pub fn Notifications() -> Element {
    // SyncSignal so dismissal timers (which run on tokio) can mutate it.
    let mut toasts = use_sync_signal(Vec::<Toast>::new());
    let mut next_id = use_sync_signal(0usize);
    let mut last_count = use_sync_signal(0usize);

    use_effect(move || {
        let notifications = state::notifications();
        let count = notifications.len();
        let mut last = last_count.write();
        if count <= *last {
            return;
        }

        let mut new_toasts: Vec<Toast> = Vec::new();
        let mut ids: Vec<usize> = Vec::new();
        {
            let mut next = next_id.write();
            for i in *last..count {
                *next += 1;
                let id = *next;
                ids.push(id);
                new_toasts.push(Toast {
                    id,
                    notification: notifications[i].clone(),
                    leaving: false,
                });
            }
        }
        {
            let mut tp = toasts.write();
            tp.extend(new_toasts);
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
        *last = count;
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
