use crate::site::validate_site_name;
use crate::utils::{run_command, DOCKER_SITE_ROOT_PATH};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub fn scan_site_sonarqube(site_name: String) -> ScanResult {
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

    let output = run_command(
        "docker",
        &[
            "compose",
            "run",
            "sonarqube-scanner",
            "sonar-scanner",
            &format!("-Dsonar.projectKey={project_key}"),
            &format!("-Dsonar.sources={source_path}"),
            "-Dsonar.host.url=http://sonarqube:9000",
            &format!("-Dsonar.token={token}"),
        ],
    );

    match output {
        Ok(result) if result.status.success() => ScanResult {
            success: true,
            error: None,
        },
        Ok(result) => ScanResult {
            success: false,
            error: Some(String::from_utf8_lossy(&result.stderr).to_string()),
        },
        Err(error) => ScanResult {
            success: false,
            error: Some(error),
        },
    }
}
