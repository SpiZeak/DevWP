use crate::site::{validate_site_name, Site};
use crate::utils::{run_command, DOCKER_SITE_ROOT_PATH};
use serde::{Deserialize, Serialize};

pub const WP_CLI_ERROR_REPORTING: &str = "error_reporting=E_ALL & ~E_DEPRECATED & ~E_WARNING";
pub const PHP_CONTAINER_NAME: &str = "devwp_php";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WpCliRequest {
    pub site: Site,
    pub command: String,
}

fn build_wp_args(work_dir: &str, extra: &[&str]) -> Vec<String> {
    let mut args = vec![
        "exec".to_string(),
        "-w".to_string(),
        work_dir.to_string(),
        PHP_CONTAINER_NAME.to_string(),
        "php".to_string(),
        "-d".to_string(),
        WP_CLI_ERROR_REPORTING.to_string(),
        "/usr/local/bin/wp".to_string(),
    ];
    args.extend(extra.iter().map(|s| s.to_string()));
    args
}

/// WP-CLI's exception handler buffers its output and may never flush it when the
/// process has produced no prior output (a known WP-CLI + piped-stream issue).
/// If both stdout and stderr are empty on a non-zero exit we re-run with
/// `--debug` which forces the buffer to flush, then strip the noisy debug lines
/// so only the actual error is returned.
fn extract_error(stdout: &str, stderr: &str, args: &[String]) -> String {
    if !stderr.is_empty() {
        return stderr.to_string();
    }
    if !stdout.is_empty() {
        return stdout.to_string();
    }

    // Both empty – retry with --debug to flush WP-CLI's internal output buffer.
    let mut debug_args = args.to_vec();
    debug_args.push("--debug".to_string());
    let debug_arg_refs: Vec<&str> = debug_args.iter().map(|s| s.as_str()).collect();

    if let Ok(debug_output) = run_command("docker", &debug_arg_refs) {
        let debug_stderr = String::from_utf8_lossy(&debug_output.stderr).to_string();
        let debug_stdout = String::from_utf8_lossy(&debug_output.stdout).to_string();

        let meaningful: Vec<&str> = debug_stderr
            .lines()
            .chain(debug_stdout.lines())
            .filter(|line| !line.starts_with("Debug ("))
            .collect();

        if !meaningful.is_empty() {
            return meaningful.join("\n");
        }
    }

    "WP-CLI command failed with no output".to_string()
}

#[tauri::command]
pub async fn run_composer_update(site: crate::site::Site) -> Result<serde_json::Value, String> {
    let site_name = validate_site_name(&site.name)?;
    let work_dir = format!("{}/{}", DOCKER_SITE_ROOT_PATH, site_name);

    // Read the host's composer auth.json so private-package credentials are
    // available inside the container without requiring an interactive prompt.
    let composer_auth = std::env::var("HOME").ok().and_then(|home| {
        let xdg = format!("{}/.config/composer/auth.json", home);
        let legacy = format!("{}/.composer/auth.json", home);
        std::fs::read_to_string(&xdg)
            .or_else(|_| std::fs::read_to_string(&legacy))
            .ok()
    });

    let mut args = vec!["exec", "-w", work_dir.as_str()];

    // Borrow outside the if so the String lives long enough.
    let auth_env;
    if let Some(auth) = &composer_auth {
        auth_env = format!("COMPOSER_AUTH={auth}");
        args.push("-e");
        args.push(&auth_env);
    }

    args.extend_from_slice(&[PHP_CONTAINER_NAME, "composer", "update"]);
    let output = run_command("docker", &args)?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(serde_json::json!({
            "success": true,
            "output": stdout,
            "error": stderr
        }))
    } else {
        let error = if !stderr.is_empty() { stderr } else { stdout };
        Ok(serde_json::json!({
            "success": false,
            "output": "",
            "error": error
        }))
    }
}

#[tauri::command]
pub async fn run_wp_cli(request: WpCliRequest) -> Result<serde_json::Value, String> {
    let site_name = validate_site_name(&request.site.name)?;
    let work_dir = if let Some(web_root) = request.site.web_root.as_deref() {
        format!("{}/{}/{}", DOCKER_SITE_ROOT_PATH, site_name, web_root)
    } else {
        format!("{}/{}", DOCKER_SITE_ROOT_PATH, site_name)
    };

    let cmd_parts: Vec<String> =
        shell_words::split(&request.command).map_err(|e| format!("Invalid command: {e}"))?;
    let cmd_parts: Vec<&str> = cmd_parts.iter().map(|s| s.as_str()).collect();
    let args = build_wp_args(&work_dir, &cmd_parts);
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = run_command("docker", &arg_refs)?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(serde_json::json!({
            "success": true,
            "output": stdout,
            "error": stderr
        }))
    } else {
        let error = extract_error(&stdout, &stderr, &args);
        Ok(serde_json::json!({
            "success": false,
            "output": stdout,
            "error": error
        }))
    }
}
