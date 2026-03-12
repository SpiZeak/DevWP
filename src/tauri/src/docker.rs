use crate::utils::{run_command, run_command_streaming};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

pub struct BuildState(pub Mutex<HashMap<String, bool>>);

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildStatusPayload {
    pub service_name: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerLogPayload {
    pub service_name: String,
    pub line: String,
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
                line.starts_with("PHP ")
                    && line.chars().nth(4).is_some_and(|c| c.is_ascii_digit())
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

#[tauri::command]
pub async fn get_container_status(app: tauri::AppHandle) -> Result<Vec<Container>, String> {
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

    for container in &mut containers {
        if container.state == "running" {
            container.version = get_container_version(&container.name);
        }
    }

    let _ = app.emit("container-status", containers.clone());
    Ok(containers)
}

#[tauri::command]
pub async fn restart_container(
    app: tauri::AppHandle,
    container_id: String,
) -> Result<bool, String> {
    let output = tauri::async_runtime::spawn_blocking(move || {
        run_command("docker", &["restart", &container_id])
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let _ = get_container_status(app).await;
    Ok(true)
}

#[tauri::command]
pub async fn start_service(app: tauri::AppHandle, service_name: String) -> Result<(), String> {
    {
        let build_state = app.state::<BuildState>();
        let mut map = build_state.0.lock().map_err(|e| e.to_string())?;
        map.insert(service_name.clone(), true);
    }

    let _ = app.emit(
        "build-status",
        BuildStatusPayload {
            service_name: service_name.clone(),
            status: "building".to_string(),
        },
    );
    let _ = app.emit(
        "docker-status",
        DockerStatusPayload {
            status: "starting".to_string(),
            message: format!("Starting service {service_name}"),
        },
    );

    let svc = service_name.clone();
    let app_for_log = app.clone();
    let svc_for_log = svc.clone();
    let success = tauri::async_runtime::spawn_blocking(move || {
        run_command_streaming(
            "docker",
            &["compose", "up", "-d", "--build", &svc],
            move |line| {
                let _ = app_for_log.emit(
                    "docker-log",
                    DockerLogPayload {
                        service_name: svc_for_log.clone(),
                        line,
                    },
                );
            },
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    {
        let build_state = app.state::<BuildState>();
        let mut map = build_state.0.lock().map_err(|e| e.to_string())?;
        map.remove(&service_name);
    }

    if !success {
        let _ = app.emit(
            "docker-status",
            DockerStatusPayload {
                status: "error".to_string(),
                message: format!("Service {service_name} failed to start"),
            },
        );
        return Err(format!(
            "Service {service_name} failed to start — see build log"
        ));
    }

    let _ = app.emit(
        "docker-status",
        DockerStatusPayload {
            status: "complete".to_string(),
            message: format!("Service {service_name} started"),
        },
    );

    let _ = get_container_status(app.clone()).await;

    Ok(())
}

#[tauri::command]
pub async fn get_build_status(
    state: tauri::State<'_, BuildState>,
) -> Result<HashMap<String, bool>, String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    Ok(map.clone())
}

#[tauri::command]
pub async fn stop_service(app: tauri::AppHandle, service_name: String) -> Result<(), String> {
    let svc = service_name.clone();
    let output = tauri::async_runtime::spawn_blocking(move || {
        run_command("docker", &["compose", "stop", &svc])
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let _ = app.emit(
        "docker-status",
        DockerStatusPayload {
            status: "complete".to_string(),
            message: format!("Service {service_name} stopped"),
        },
    );

    Ok(())
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
}
