use crate::site::{validate_site_name, Site};
use crate::utils::{run_command, DOCKER_SITE_ROOT_PATH};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

pub const WP_CLI_ERROR_REPORTING: &str = "error_reporting=\"E_ALL & ~E_DEPRECATED & ~E_WARNING\"";
pub const PHP_CONTAINER_NAME: &str = "devwp_php";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WpCliRequest {
    pub site: Site,
    pub command: String,
}

#[tauri::command]
pub async fn run_wp_cli(
    app: tauri::AppHandle,
    request: WpCliRequest,
) -> Result<serde_json::Value, String> {
    let site_name = validate_site_name(&request.site.name)?;
    let work_dir = if let Some(web_root) = request.site.web_root.as_deref() {
        format!("{}/{}/{}", DOCKER_SITE_ROOT_PATH, site_name, web_root)
    } else {
        format!("{}/{}", DOCKER_SITE_ROOT_PATH, site_name)
    };

    let mut args = vec![
        "exec".to_string(),
        "-w".to_string(),
        work_dir,
        PHP_CONTAINER_NAME.to_string(),
        "php".to_string(),
        "-d".to_string(),
        WP_CLI_ERROR_REPORTING.to_string(),
        "/usr/local/bin/wp".to_string(),
    ];
    args.extend(request.command.split_whitespace().map(str::to_string));

    let arg_refs: Vec<&str> = args.iter().map(|arg| arg.as_str()).collect();
    let output = run_command("docker", &arg_refs)?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !stdout.is_empty() {
        let _ = app.emit(
            "wp-cli-stream",
            serde_json::json!({
                "type": "stdout",
                "data": stdout,
                "siteId": site_name
            }),
        );
    }

    if !stderr.is_empty() {
        let _ = app.emit(
            "wp-cli-stream",
            serde_json::json!({
                "type": "stderr",
                "data": stderr,
                "siteId": site_name
            }),
        );
    }

    let _ = app.emit(
        "wp-cli-stream",
        serde_json::json!({
            "type": "complete",
            "siteId": site_name,
            "code": output.status.code().unwrap_or(-1)
        }),
    );

    if output.status.success() {
        Ok(serde_json::json!({
            "success": true,
            "output": stdout,
            "error": stderr
        }))
    } else {
        let failure_error = if stderr.is_empty() {
            "WP-CLI command failed".to_string()
        } else {
            stderr
        };

        Ok(serde_json::json!({
            "success": false,
            "output": stdout,
            "error": failure_error
        }))
    }
}
