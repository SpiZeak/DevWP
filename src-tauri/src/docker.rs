use crate::utils::run_command;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Container {
    pub id: String,
    pub name: String,
    pub state: String,
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

            Some(Container {
                id,
                name,
                state,
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

    if !output.status.success() {
        return None;
    }

    let output_str = if use_stderr {
        String::from_utf8_lossy(&output.stderr).to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };

    let first_line = output_str.lines().next().unwrap_or("").trim();

    if name.contains("php") {
        first_line
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
        first_line
            .split('v')
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
            "{{.ID}}|{{.Name}}|{{.State}}",
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
pub fn restart_container(app: tauri::AppHandle, container_id: String) -> Result<bool, String> {
    let output = run_command("docker", &["restart", &container_id])?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    tauri::async_runtime::spawn(async move {
        let _ = get_container_status(app).await;
    });
    Ok(true)
}

#[tauri::command]
pub fn start_service(app: tauri::AppHandle, service_name: String) -> Result<(), String> {
    let _ = app.emit(
        "docker-status",
        DockerStatusPayload {
            status: "starting".to_string(),
            message: format!("Starting service {service_name}"),
        },
    );

    let output = run_command("docker", &["compose", "up", "-d", "--build", &service_name])?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = app.emit(
            "docker-status",
            DockerStatusPayload {
                status: "error".to_string(),
                message: message.clone(),
            },
        );
        return Err(message);
    }

    let _ = app.emit(
        "docker-status",
        DockerStatusPayload {
            status: "complete".to_string(),
            message: format!("Service {service_name} started"),
        },
    );

    Ok(())
}

#[tauri::command]
pub fn stop_service(app: tauri::AppHandle, service_name: String) -> Result<(), String> {
    let output = run_command("docker", &["compose", "stop", &service_name])?;
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

#[tauri::command]
pub async fn get_status(service_name: Option<String>) -> Result<Vec<Container>, String> {
    let mut args = vec![
        "compose".to_string(),
        "ps".to_string(),
        "--format".to_string(),
        "{{.ID}}|{{.Name}}|{{.State}}".to_string(),
        "-a".to_string(),
    ];

    if let Some(service) = service_name {
        args.push(service);
    }

    let arg_refs: Vec<&str> = args.iter().map(|arg| arg.as_str()).collect();
    let output = run_command("docker", &arg_refs)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let mut containers = parse_compose_ps(&String::from_utf8_lossy(&output.stdout));

    for container in &mut containers {
        if container.state == "running" {
            container.version = get_container_version(&container.name);
        }
    }

    Ok(containers)
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
