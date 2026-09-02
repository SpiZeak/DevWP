use crate::backend::docker;
use crate::backend::docker::{Container, ContainerState, DockerStatus};
use crate::backend::lifecycle;
use crate::backend::utils::NotificationType;
use crate::components::brand_logo::{BrandLogo, SI_DOCKER, SI_MARIADB, SI_NGINX, SI_PHP, SI_REDIS};
use crate::components::ui::{use_sync_signal, Icon, Spinner};
use crate::components::{BuildLog, XdebugSwitch};
use crate::state;
use dioxus::prelude::*;
use std::collections::HashMap;
use std::time::Duration;

fn is_building(building: &HashMap<String, bool>, container_name: &str) -> bool {
    building.contains_key(container_name)
        || building.contains_key(
            container_name
                .strip_prefix("devwp_")
                .unwrap_or(container_name),
        )
}

fn container_icon(container_or_service: &str) -> Element {
    let service = container_or_service
        .strip_prefix("devwp_")
        .unwrap_or(container_or_service);
    match service {
        "nginx" => rsx! { BrandLogo { icon: SI_NGINX } },
        "php" => rsx! { BrandLogo { icon: SI_PHP } },
        "mariadb" => rsx! { BrandLogo { icon: SI_MARIADB } },
        "redis" => rsx! { BrandLogo { icon: SI_REDIS } },
        _ => rsx! { BrandLogo { icon: SI_DOCKER } },
    }
}

fn status_text(container: &Container, building: bool) -> Option<(String, String)> {
    // Returns (text, color class)
    if building {
        return Some(("Building...".to_string(), "text-amber".to_string()));
    }
    if container.state == ContainerState::Pending {
        return Some(("Starting...".to_string(), "text-seasalt-400".to_string()));
    }
    if container.health.as_deref() == Some("starting") {
        return Some(("Starting...".to_string(), "text-amber".to_string()));
    }
    if container.health.as_deref() == Some("unhealthy") {
        return Some(("Unhealthy".to_string(), "text-crimson".to_string()));
    }
    container
        .version
        .clone()
        .map(|v| (v, "text-seasalt".to_string()))
}

#[component]
pub fn Services(on_open_settings: EventHandler<()>, on_open_versions: EventHandler<()>) -> Element {
    let mut restarting = use_sync_signal(HashMap::<String, bool>::new());
    // Guards against spawning duplicate poll loops: the effect below writes
    // the very container signal it reads, so without the flag every poll tick
    // would spawn another loop.
    let mut polling = use_sync_signal(false);

    // Initial fetch, then keep polling while any health check is still
    // "starting". At most one poll loop is alive at a time.
    use_effect(move || {
        let containers = state::containers();
        let needs_poll = containers.is_empty()
            || containers
                .iter()
                .any(|c| c.health.as_deref() == Some("starting"));
        if !needs_poll {
            return;
        }
        let mut flag = polling.write();
        if *flag {
            return;
        }
        *flag = true;
        drop(flag);
        let mut polling_task = polling.clone();
        spawn(async move {
            loop {
                let _ = tokio::task::spawn_blocking(docker::get_container_status).await;
                let stale = state::containers()
                    .iter()
                    .any(|c| c.health.as_deref() == Some("starting"));
                if !stale {
                    break;
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            *polling_task.write() = false;
        });
    });

    let containers = state::containers().clone();
    let building_services = state::building_services().clone();
    let docker_status = state::docker_status().clone();

    let container_map: Vec<Container> = containers
        .iter()
        .filter(|c| c.name.contains("devwp_"))
        .cloned()
        .collect();

    // Always show all known services; use real data if available, otherwise
    // a building/pending placeholder.
    let mut all_items: Vec<Container> = Vec::new();
    for service in docker::STACK_SERVICES {
        let container_name = docker::container_name_for(service);
        let real = container_map
            .iter()
            .find(|c| c.name == container_name)
            .cloned();
        if let Some(real) = real {
            all_items.push(real);
        } else {
            let building = is_building(&building_services, &container_name);
            all_items.push(Container {
                id: format!(
                    "{}_{}",
                    if building { "building" } else { "placeholder" },
                    container_name
                ),
                name: container_name,
                state: if building {
                    ContainerState::Building
                } else {
                    ContainerState::Pending
                },
                health: None,
                version: None,
            });
        }
    }

    let restart_map = restarting.read().clone();
    let any_building = !building_services.is_empty();

    rsx! {
        div { class: "mr-6 mb-5 rounded-lg",
            // The lifecycle writes detailed failure reasons into the docker
            // status signal; surface them instead of showing "Starting…"
            // placeholders forever when the daemon is down or startup failed.
            if docker_status.status == DockerStatus::Error {
                div { class: "flex justify-between items-center bg-crimson/10 mb-6 p-3 border border-crimson rounded-md",
                    div { class: "text-crimson text-xs font-medium",
                        {docker_status.message.clone()}
                    }
                    button {
                        "type": "button",
                        class: "shrink-0 bg-pumpkin hover:bg-pumpkin-600 px-3 py-1.5 rounded text-warm-charcoal text-xs font-medium transition-colors cursor-pointer",
                        onclick: move |_| {
                            spawn(async move {
                                lifecycle::start_services().await;
                            });
                        },
                        "Retry"
                    }
                }
            }
            XdebugSwitch {}
            div { class: "flex justify-between items-center mb-8",
                div { class: "flex items-center gap-2",
                    BrandLogo { icon: SI_DOCKER }
                    h2 { class: "font-semibold text-seasalt text-lg", "Docker Services" }
                }
                div { class: "flex items-center gap-2",
                    button {
                        "type": "button",
                        class: "flex justify-center items-center bg-gunmetal-500 hover:bg-gunmetal-600 rounded-full size-8 text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer",
                        title: "About DevWP",
                        onclick: move |_| on_open_versions.call(()),
                        Icon { content: "ℹ".to_string(), class: "text-lg".to_string() }
                    }
                    button {
                        "type": "button",
                        class: "flex justify-center items-center bg-gunmetal-500 hover:bg-gunmetal-600 rounded-full size-8 text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer",
                        title: "Settings",
                        onclick: move |_| on_open_settings.call(()),
                        Icon { content: "⚙".to_string(), class: "text-lg".to_string() }
                    }
                }
            }
            ul { class: "gap-3 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] m-0 p-0 list-none",
                for (index, container) in all_items.iter().enumerate() {
                    {
                        let building = is_building(&building_services, &container.name);
                        let border = border_class(container, building);
                        let status = status_text(container, building);
                        let item_id = container.id.clone();
                        let item_name = container.name.clone();
                        let is_restarting = restart_map.get(&item_id).copied().unwrap_or(false);
                        // Placeholder ids (`placeholder_devwp_*`) do not exist
                        // in Docker — restarting them can only fail.
                        let is_placeholder = container.state == ContainerState::Pending;
                        let show_spinner = is_restarting
                            || building
                            || container.state == ContainerState::Pending
                            || container.health.as_deref() == Some("starting");

                        rsx! {
                            li {
                                key: "{item_id}",
                                class: format!("animate-fade-in-up flex justify-between items-center px-3 py-1.5 bg-gunmetal-500 rounded-md transition-colors hover:bg-gunmetal-500 {border}"),
                                style: format!("animation-delay: {}ms", index * 55),
                                div { class: "flex items-center gap-2.5",
                                    if building {
                                        span { class: "text-xl leading-none", "🔧" }
                                    } else {
                                        { container_icon(&item_name) }
                                    }
                                    div { class: "flex flex-col text-left",
                                        div { class: "flex items-center gap-1.5",
                                             span { class: "overflow-hidden font-medium text-sm text-ellipsis whitespace-nowrap", "{docker::display_name(&item_name)}" }
                                        }
                                        if let Some((text, color)) = status {
                                            span { class: "mt-0.5 text-xs {color}", {text} }
                                        }
                                    }
                                }
                                button {
                                    "type": "button",
                                    class: "flex shrink-0 justify-center items-center bg-gunmetal-500 disabled:opacity-50 rounded-full size-7 text-2xl text-seasalt hover:text-warm-charcoal transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                                    disabled: is_restarting || building || is_placeholder,
                                    title: "Restart service",
                                    onclick: move |_| {
                                        restarting.write().insert(item_id.clone(), true);
                                        let mut rt = restarting.clone();
                                        let id = item_id.clone();
                                        let name = item_name.clone();
                                        spawn(async move {
                                            if let Err(error) =
                                                docker::restart_container(id.clone()).await
                                            {
                                                state::push_notification(
                                                    NotificationType::Error,
                                                    format!(
                                                        "Failed to restart {name}: {error}"
                                                    ),
                                                );
                                            }
                                            tokio::time::sleep(Duration::from_secs(1)).await;
                                            rt.write().remove(&id);
                                        });
                                    },
                                    if show_spinner {
                                        Spinner { svg_class: "size-6".to_string() }
                                    } else {
                                        span { "↻" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            BuildLog { is_building: any_building }
        }
    }
}

fn border_class(container: &Container, is_building: bool) -> &'static str {
    if is_building {
        return "border-l-3 border-amber-500";
    }
    match container.state {
        ContainerState::Pending => "",
        ContainerState::Running => {
            if container.health.as_deref() == Some("unhealthy") {
                "border-l-3 border-orange-500"
            } else {
                "border-l-3 border-emerald-500"
            }
        }
        ContainerState::Exited | ContainerState::Stopped => "border-l-3 border-crimson-500",
        _ => "",
    }
}
