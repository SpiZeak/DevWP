use crate::site::validate_site_name;
use crate::utils::DOCKER_SITE_ROOT_PATH;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn scan_site_sonarqube(site_name: String) -> ScanResult {
    let validated_site_name = match validate_site_name(&site_name) {
        Ok(name) => name,
        Err(error) => {
            return ScanResult {
                success: false,
                error: Some(error),
            }
        }
    };

    let project_key = validated_site_name.replace('.', "_");
    let source_path = format!("{}/{}", DOCKER_SITE_ROOT_PATH, validated_site_name);
    let token = match std::env::var("SONAR_TOKEN") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => {
            return ScanResult {
                success: false,
                error: Some("SONAR_TOKEN is not set".to_string()),
            }
        }
    };

    let output = tauri::async_runtime::spawn_blocking(move || {
        let project_key_arg = format!("-Dsonar.projectKey={project_key}");
        let source_path_arg = format!("-Dsonar.sources={source_path}");
        std::process::Command::new("docker")
            .args([
                "compose",
                "run",
                "--rm",
                "-e",
                "SONAR_TOKEN",
                "sonarqube-scanner",
                "sonar-scanner",
                &project_key_arg,
                &source_path_arg,
                "-Dsonar.host.url=http://sonarqube:9000",
                "-Dsonar.token=${SONAR_TOKEN}",
            ])
            .env("SONAR_TOKEN", &token)
            .current_dir(crate::utils::project_root())
            .output()
            .map_err(|e| format!("Failed to execute sonar-scanner: {e}"))
    })
    .await;

    match output {
        Ok(Ok(result)) if result.status.success() => ScanResult {
            success: true,
            error: None,
        },
        Ok(Ok(result)) => ScanResult {
            success: false,
            error: Some(String::from_utf8_lossy(&result.stderr).to_string()),
        },
        Ok(Err(error)) => ScanResult {
            success: false,
            error: Some(error),
        },
        Err(e) => ScanResult {
            success: false,
            error: Some(format!("Task join error: {e}")),
        },
    }
}
