use crate::backend::utils::{headless_mode, run_command};
use crate::state;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Typed container state. Docker may report arbitrary strings, so an
/// `Other` variant catches anything not in the known set.
#[derive(Debug, Clone, PartialEq)]
pub enum ContainerState {
    Running,
    Exited,
    Stopped,
    Pending,
    Building,
    Other(String),
}

impl ContainerState {
    pub fn from_docker(s: &str) -> Self {
        match s {
            "running" => Self::Running,
            "exited" => Self::Exited,
            "stopped" => Self::Stopped,
            "pending" => Self::Pending,
            "building" => Self::Building,
            other => Self::Other(other.to_string()),
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            Self::Running => "running",
            Self::Exited => "exited",
            Self::Stopped => "stopped",
            Self::Pending => "pending",
            Self::Building => "building",
            Self::Other(s) => s,
        }
    }
}

impl std::fmt::Display for ContainerState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl Serialize for ContainerState {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for ContainerState {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        Ok(Self::from_docker(&s))
    }
}

/// Typed docker lifecycle status reported to the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DockerStatus {
    Idle,
    Starting,
    Complete,
    Error,
    Stopping,
    Stopped,
    #[serde(other)]
    Unknown,
}

impl std::fmt::Display for DockerStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Idle => "idle",
            Self::Starting => "starting",
            Self::Complete => "complete",
            Self::Error => "error",
            Self::Stopping => "stopping",
            Self::Stopped => "stopped",
            Self::Unknown => "unknown",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Container {
    pub id: String,
    pub name: String,
    pub state: ContainerState,
    pub health: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DockerStatusPayload {
    pub status: DockerStatus,
    pub message: String,
}

pub fn parse_compose_ps(stdout: &str) -> Vec<Container> {
    stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let mut parts = line.split('|');
            let id = parts.next()?.to_string();
            let name = parts.next()?.to_string();
            let state = ContainerState::from_docker(&parts.next()?.to_lowercase());
            let health = parts.next().and_then(|h| {
                let h = h.trim().to_lowercase();
                if h.is_empty() {
                    None
                } else {
                    Some(h)
                }
            });

            Some(Container {
                id,
                name,
                state,
                health,
                version: None,
            })
        })
        .collect()
}

struct VersionProbe {
    cmd: &'static str,
    args: &'static [&'static str],
    use_stderr: bool,
    /// php and mailpit may exit non-zero yet still emit a usable version line.
    ignore_failure: bool,
    parse: fn(&str) -> Option<String>,
}

fn parse_php_version(output: &str) -> Option<String> {
    output
        .lines()
        .find(|line| {
            line.starts_with("PHP ") && line.chars().nth(4).is_some_and(|c| c.is_ascii_digit())
        })
        .unwrap_or("")
        .split_whitespace()
        .nth(1)
        .map(|v| format!("v{}", v))
}

fn parse_nginx_version(output: &str) -> Option<String> {
    output
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .split('/')
        .nth(1)
        .map(|v| format!("v{}", v.trim()))
}

fn parse_mariadb_version(output: &str) -> Option<String> {
    output
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .split("from ")
        .nth(1)
        .and_then(|s| s.split('-').next())
        .map(|v| format!("v{}", v.trim()))
}

fn parse_redis_version(output: &str) -> Option<String> {
    output
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .split("v=")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .map(|v| format!("v{}", v))
}

fn parse_mailpit_version(output: &str) -> Option<String> {
    output
        .lines()
        .find(|line| line.contains("mailpit") && line.contains(" v"))
        .unwrap_or("")
        .split(" v")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .map(|v| format!("v{}", v))
}

fn version_probe(name: &str) -> Option<VersionProbe> {
    let probe = match name {
        "devwp_php" => VersionProbe {
            cmd: "php",
            args: &["--version"],
            use_stderr: false,
            ignore_failure: true,
            parse: parse_php_version,
        },
        "devwp_nginx" => VersionProbe {
            cmd: "nginx",
            args: &["-v"],
            use_stderr: true,
            ignore_failure: false,
            parse: parse_nginx_version,
        },
        "devwp_mariadb" => VersionProbe {
            cmd: "mariadb",
            args: &["--version"],
            use_stderr: false,
            ignore_failure: false,
            parse: parse_mariadb_version,
        },
        "devwp_redis" => VersionProbe {
            cmd: "redis-server",
            args: &["--version"],
            use_stderr: false,
            ignore_failure: false,
            parse: parse_redis_version,
        },
        "devwp_mailpit" => VersionProbe {
            cmd: "/mailpit",
            args: &["version"],
            use_stderr: false,
            ignore_failure: true,
            parse: parse_mailpit_version,
        },
        _ => return None,
    };
    Some(probe)
}

fn get_container_version(name: &str) -> Option<String> {
    let probe = version_probe(name)?;

    let mut exec_args = vec!["exec", name, probe.cmd];
    exec_args.extend(probe.args);

    let output = match run_command("docker", &exec_args) {
        Ok(out) => out,
        Err(_) => return None,
    };

    if !output.status.success() && !probe.ignore_failure {
        return None;
    }

    let output_str = if probe.use_stderr {
        String::from_utf8_lossy(&output.stderr).to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };

    (probe.parse)(&output_str)
}

// Version probing shells out to `docker exec` per container; cache results by
// container id so the 1s status polls don't re-exec five binaries every tick.
static VERSION_CACHE: std::sync::LazyLock<std::sync::Mutex<HashMap<String, Option<String>>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

pub fn get_container_status() -> Result<Vec<Container>, String> {
    let output = run_command(
        "docker",
        &[
            "compose",
            "ps",
            "--format",
            "{{.ID}}|{{.Name}}|{{.State}}|{{.Health}}",
            "-a",
        ],
    )?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let mut containers = parse_compose_ps(&String::from_utf8_lossy(&output.stdout));

    // Version probing shells out once per running container for the UI's poll
    // loop. Skip it in headless (CLI) mode — versions are unread there and the
    // one-shot process never benefits from the cache.
    if !headless_mode() {
        let mut cache = VERSION_CACHE
            .lock()
            .map_err(|e| format!("Version cache poisoned: {e}"))?;

        for container in &mut containers {
            if container.state == ContainerState::Running {
                if let Some(version) = cache.get(&container.id) {
                    container.version = version.clone();
                } else {
                    let version = get_container_version(&container.name);
                    cache.insert(container.id.clone(), version.clone());
                    container.version = version;
                }
            }
        }
    }

    state::set_containers(containers.clone());
    Ok(containers)
}

pub async fn restart_container(container_id: String) -> Result<bool, String> {
    let output =
        tokio::task::spawn_blocking(move || run_command("docker", &["restart", &container_id]))
            .await
            .map_err(|e| format!("Task join error: {e}"))??;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    if !headless_mode() {
        let _ = get_container_status();
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Clear the version cache so tests start with a clean slate.
    #[allow(dead_code)]
    pub(crate) fn clear_version_cache() {
        if let Ok(mut cache) = VERSION_CACHE.lock() {
            cache.clear();
        }
    }

    #[test]
    fn parse_compose_ps_parses_rows() {
        let output = "abc|devwp_nginx|running\ndef|devwp_php|exited";
        let containers = parse_compose_ps(output);
        assert_eq!(containers.len(), 2);
        assert_eq!(containers[0].id, "abc");
        assert_eq!(containers[0].state, ContainerState::Running);
        assert_eq!(containers[1].name, "devwp_php");
        assert_eq!(containers[1].state, ContainerState::Exited);
    }

    #[test]
    fn parse_compose_ps_handles_health() {
        let output = "abc|devwp_nginx|running|healthy";
        let containers = parse_compose_ps(output);
        assert_eq!(containers.len(), 1);
        assert_eq!(containers[0].health.as_deref(), Some("healthy"));
    }

    #[test]
    fn parse_compose_ps_handles_unknown_state() {
        let output = "abc|devwp_custom|paused";
        let containers = parse_compose_ps(output);
        assert_eq!(containers.len(), 1);
        assert_eq!(containers[0].state, ContainerState::Other("paused".into()));
    }
}
