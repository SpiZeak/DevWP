use crate::state;
use dioxus::document::eval;
use dioxus::prelude::*;

/// Distinct color per `[tag]` log tag; falls back for unknown tags. Along
/// with service names, app notifications log as `[success]`/`[error]`/
/// `[warning]`/`[info]`.
fn tag_color(service: &str) -> &'static str {
    match service {
        "ok" | "success" => "text-emerald-400",
        "error" => "text-crimson",
        "warning" => "text-amber",
        "startup" | "info" => "text-muted",
        "php" => "text-pumpkin",
        "nginx" => "text-emerald-400",
        "mariadb" => "text-crimson",
        "redis" => "text-amber",
        "mailpit" => "text-pumpkin-300",
        _ => "text-seasalt-300",
    }
}

/// Split a `[{service}] {line}` log entry into its tag and body.
/// Returns `None` for lines without a service tag.
fn split_log_line(line: &str) -> Option<(&str, &str)> {
    let (tag, rest) = line.split_once("] ")?;
    tag.strip_prefix('[').map(|service| (service, rest))
}

/// Bare terminal-style log for the whole stack: live container output from
/// the background followers, startup/build lifecycle events, and app
/// notifications — on a black well with no header or collapse. Always
/// mounted below the service cards.
#[component]
pub fn ServiceLogs() -> Element {
    let logs_sig = state::container_logs_signal();

    // Auto-scroll to the bottom as new lines arrive, but only while the user
    // is already at the bottom — scrolling up pins the view there. Stickiness
    // lives in a `data-` attribute updated by a scroll listener installed on
    // first attach (and re-installed whenever the element remounts).
    use_effect(move || {
        let count = logs_sig.read().len();
        if count > 0 {
            let _ = eval(
                r#"
const el = document.getElementById('container-log-content');
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

    rsx! {
        div {
            id: "container-log-content",
            class: "bg-black border border-border mt-4 rounded-md overflow-y-auto scrollbar-hide animate-fade-in-up font-mono text-seasalt-400 text-xs leading-relaxed",
            style: "max-height: 13rem; padding: 0.5rem 0.75rem;",
            if logs.is_empty() {
                span { class: "text-muted", "Waiting for container output…" }
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
