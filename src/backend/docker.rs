use crate::backend::utils::run_command;
use crate::state;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Container {
    pub id: String,
    pub name: String,
    pub state: String,
    pub health: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DockerStatusPayload {
    pub status: String,
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
            let state = parts.next()?.to_lowercase();
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

fn get_container_version(name: &str) -> Option<String> {
    let (cmd, args, use_stderr) = if name.contains("php") {
        ("php", vec!["--version"], false)
    } else if name.contains("nginx") {
        ("nginx", vec!["-v"], true)
    } else if name.contains("mariadb") {
        ("mariadb", vec!["--version"], false)
    } else if name.contains("redis") {
        ("redis-server", vec!["--version"], false)
    } else if name.contains("mailpit") {
        ("/mailpit", vec!["version"], false)
    } else {
        return None;
    };

    let mut exec_args = vec!["exec", name, cmd];
    exec_args.extend(args);

    let output = match run_command("docker", &exec_args) {
        Ok(out) => out,
        Err(_) => return None,
    };

    if !output.status.success() && !name.contains("mailpit") && !name.contains("php") {
        return None;
    }

    let output_str = if use_stderr {
        String::from_utf8_lossy(&output.stderr).to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };

    let first_line = output_str.lines().next().unwrap_or("").trim();

    if name.contains("php") {
        output_str
            .lines()
            .find(|line| {
                line.starts_with("PHP ") && line.chars().nth(4).is_some_and(|c| c.is_ascii_digit())
            })
            .unwrap_or("")
            .split_whitespace()
            .nth(1)
            .map(|v| format!("v{}", v))
    } else if name.contains("nginx") {
        first_line
            .split('/')
            .nth(1)
            .map(|v| format!("v{}", v.trim()))
    } else if name.contains("mariadb") {
        first_line
            .split("from ")
            .nth(1)
            .and_then(|s| s.split('-').next())
            .map(|v| format!("v{}", v.trim()))
    } else if name.contains("redis") {
        first_line
            .split("v=")
            .nth(1)
            .and_then(|s| s.split_whitespace().next())
            .map(|v| format!("v{}", v))
    } else if name.contains("mailpit") {
        output_str
            .lines()
            .find(|line| line.contains("mailpit") && line.contains(" v"))
            .unwrap_or("")
            .split(" v")
            .nth(1)
            .and_then(|s| s.split_whitespace().next())
            .map(|v| format!("v{}", v))
    } else {
        None
    }
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
    let mut cache = VERSION_CACHE
        .lock()
        .map_err(|e| format!("Version cache poisoned: {e}"))?;

    for container in &mut containers {
        if container.state == "running" {
            if let Some(version) = cache.get(&container.id) {
                container.version = version.clone();
            } else {
                let version = get_container_version(&container.name);
                cache.insert(container.id.clone(), version.clone());
                container.version = version;
            }
        }
    }
    drop(cache);

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

    let _ = get_container_status();
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_compose_ps_parses_rows() {
        let output = "abc|devwp_nginx|running\ndef|devwp_php|exited";
        let containers = parse_compose_ps(output);
        assert_eq!(containers.len(), 2);
        assert_eq!(containers[0].id, "abc");
        assert_eq!(containers[1].name, "devwp_php");
    }

    #[test]
    fn parse_compose_ps_handles_health() {
        let output = "abc|devwp_nginx|running|healthy";
        let containers = parse_compose_ps(output);
        assert_eq!(containers.len(), 1);
        assert_eq!(containers[0].health.as_deref(), Some("healthy"));
    }
}
