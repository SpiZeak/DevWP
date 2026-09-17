use crate::backend::docker::{self, ServicePhase};
use crate::components::ui::use_sync_signal;
use crate::state;
use dioxus::document::eval;
use dioxus::prelude::*;

/// Distinct color per `[service]` log tag; falls back for unknown services.
fn tag_color(service: &str) -> &'static str {
    match service {
        "startup" => "text-seasalt-400",
        "php" => "text-pumpkin",
        "nginx" => "text-emerald-400",
        "mariadb" => "text-crimson",
        "redis" => "text-amber",
        "mailpit" => "text-pumpkin-300",
        _ => "text-seasalt-300",
    }
}

fn phase_verb(phase: ServicePhase) -> &'static str {
    match phase {
        ServicePhase::Building => "building…",
        ServicePhase::Pulling => "pulling…",
        ServicePhase::Starting => "starting…",
    }
}

/// Split a `[{service}] {line}` build-log entry into its tag and body.
/// Returns `None` for lines without a service tag.
fn split_log_line(line: &str) -> Option<(&str, &str)> {
    let (tag, rest) = line.split_once("] ")?;
    tag.strip_prefix('[').map(|service| (service, rest))
}

#[component]
pub fn BuildLog(is_building: bool) -> Element {
    let mut is_open = use_sync_signal(true);
    let mut was_building = use_sync_signal(false);

    // Re-open the panel when a new build cycle starts (mirrors the old
    // renderer). Driven by the building-services signal rather than the
    // `is_building` prop, because dioxus `use_effect` only re-runs on signal
    // reads — plain prop changes are not reactive.
    use_effect(move || {
        let building_now = !state::building_services().is_empty();
        let mut was = was_building.write();
        if building_now && !*was {
            let mut open = is_open.write();
            *open = true;
        }
        *was = building_now;
    });

    let logs_sig = state::build_logs_signal();

    // Auto-scroll to the bottom as new lines arrive, but only while the user
    // is already at the bottom — scrolling up pins the view there. Stickiness
    // lives in a `data-` attribute updated by a scroll listener installed on
    // first attach (and re-installed whenever the element remounts).
    use_effect(move || {
        let count = logs_sig.read().len();
        if count > 0 && *is_open.read() {
            let _ = eval(
                r#"
const el = document.getElementById('build-log-content');
if (el) {
  if (!el.dataset.stickInit) {
    el.dataset.stickInit = '1';
    el.dataset.stick = '1';
    el.addEventListener('scroll', () => {
      el.dataset.stick =
        el.scrollHeight - el.scrollTop - el.clientHeight < 24 ? '1' : '0';
    });
  }
  if (el.dataset.stick !== '0') el.scrollTop = el.scrollHeight;
}
"#,
            )
            .send(());
        }
    });

    // Hold the read guard instead of cloning every log line per render.
    let logs = logs_sig.read();
    let progress = state::service_progress_signal().read().clone();
    if !is_building && logs.is_empty() {
        return Ok(VNode::placeholder());
    }

    let open = *is_open.read();

    rsx! {
        div { class: "bg-gunmetal-600 mt-4 rounded-lg overflow-hidden animate-fade-in-up",
            button {
                "type": "button",
                class: "flex justify-between items-center hover:bg-gunmetal-500 px-3 py-2 w-full text-left transition-colors",
                onclick: move |_ev: MouseEvent| {
                    let mut open = is_open.write();
                    *open = !*open;
                },
                "aria-expanded": open.to_string(),
                "aria-controls": "build-log-content",
                span { class: "font-medium text-seasalt text-sm",
                    if is_building { "Build Output" } else { "Build Output (complete)" }
                }
                div { class: "mx-2 flex flex-1 justify-end items-center gap-2 min-w-0 overflow-hidden",
                    for service in docker::STACK_SERVICES {
                        if let Some(p) = progress.get(service) {
                            span {
                                key: "{service}",
                                class: "text-xs text-seasalt-400 whitespace-nowrap",
                                {format!("{service} ")}
                                {
                                    match p.percent {
                                        Some(percent) => rsx! {
                                            span { class: "text-amber", "{percent}%" }
                                        },
                                        None => rsx! {
                                            span { class: "text-amber", {phase_verb(p.phase)} }
                                        },
                                    }
                                }
                            }
                        }
                    }
                }
                span {
                    class: "text-seasalt-400 text-xs transition-transform duration-200",
                    style: format!(
                        "display: inline-block; transform: {}",
                        if open { "rotate(0deg)" } else { "rotate(-90deg)" }
                    ),
                    "▾"
                }
            }
            div {
                id: "build-log-content",
                class: "overflow-y-auto font-mono text-green-400 text-xs leading-relaxed transition-[max-height,padding] duration-300 ease-in-out",
                style: format!(
                    "max-height: {}; padding: {}",
                    if open { "13rem" } else { "0" },
                    if open { "0.5rem 0.75rem" } else { "0 0.75rem" }
                ),
                if logs.is_empty() {
                    span { class: "text-seasalt-400", "Waiting for output…" }
                } else {
                    for (i, line) in logs.iter().enumerate() {
                        div { key: "{i}", class: "break-all whitespace-pre-wrap",
                            if let Some((service, rest)) = split_log_line(line) {
                                span { class: "font-medium {tag_color(service)}", "[{service}] " }
                                "{rest}"
                            } else {
                                {line.clone()}
                            }
                        }
                    }
                }
            }
        }
    }
}
