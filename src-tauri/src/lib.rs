use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

const WP_CLI_ERROR_REPORTING: &str = "error_reporting=\"E_ALL & ~E_DEPRECATED & ~E_WARNING\"";
const XDEBUG_CONFIG_PATH: &str = "config/php/conf.d/xdebug.ini";
const DOCKER_SITE_ROOT_PATH: &str = "/src/www";
const PHP_CONTAINER_NAME: &str = "devwp_php";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Site {
    name: String,
    path: String,
    url: String,
    status: String,
    aliases: Option<String>,
    web_root: Option<String>,
    multisite: Option<MultisiteConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MultisiteConfig {
    enabled: bool,
    #[serde(rename = "type")]
    site_type: String,
}

#[derive(Debug, Clone, Serialize)]
struct OperationResult {
    success: bool,
    message: String,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct ScanResult {
    success: bool,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SiteCreateRequest {
    domain: String,
    web_root: Option<String>,
    aliases: Option<String>,
    multisite: Option<MultisiteConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SiteUpdateRequest {
    aliases: Option<String>,
    web_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Container {
    id: String,
    name: String,
    state: String,
    version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct NotificationPayload {
    #[serde(rename = "type")]
    notification_type: String,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
struct XdebugStatusPayload {
    status: String,
    enabled: Option<bool>,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct DockerStatusPayload {
    status: String,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WpCliRequest {
    site: Site,
    command: String,
}

fn state_root() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".devwp-tauri")
}

fn ensure_state_root() -> Result<PathBuf, String> {
    let root = state_root();
    fs::create_dir_all(&root).map_err(|e| format!("Failed to create state directory: {e}"))?;
    Ok(root)
}

fn settings_file() -> Result<PathBuf, String> {
    Ok(ensure_state_root()?.join("settings.json"))
}

fn sites_file() -> Result<PathBuf, String> {
    Ok(ensure_state_root()?.join("sites.json"))
}

fn logs_dir() -> Result<PathBuf, String> {
    let dir = ensure_state_root()?.join("logs");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create logs directory: {e}"))?;
    Ok(dir)
}

fn read_settings() -> HashMap<String, String> {
    let path = match settings_file() {
        Ok(path) => path,
        Err(_) => return HashMap::new(),
    };

    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

fn write_settings(settings: &HashMap<String, String>) -> Result<(), String> {
    let path = settings_file()?;
    let content =
        serde_json::to_string_pretty(settings).map_err(|e| format!("Serialize settings: {e}"))?;
    fs::write(path, content).map_err(|e| format!("Write settings: {e}"))
}

fn read_sites() -> Vec<Site> {
    let path = match sites_file() {
        Ok(path) => path,
        Err(_) => return Vec::new(),
    };

    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn write_sites(sites: &[Site]) -> Result<(), String> {
    let path = sites_file()?;
    let content =
        serde_json::to_string_pretty(sites).map_err(|e| format!("Serialize sites: {e}"))?;
    fs::write(path, content).map_err(|e| format!("Write sites: {e}"))
}

fn home_dir() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home);
    }

    if let Some(user_profile) = std::env::var_os("USERPROFILE") {
        return PathBuf::from(user_profile);
    }

    PathBuf::from(".")
}

fn default_webroot() -> PathBuf {
    home_dir().join("www")
}

fn get_webroot_from_settings() -> PathBuf {
    let settings = read_settings();
    settings
        .get("webroot_path")
        .map(PathBuf::from)
        .unwrap_or_else(default_webroot)
}

fn ensure_webroot_exists() -> Result<PathBuf, String> {
    let webroot = get_webroot_from_settings();
    fs::create_dir_all(&webroot).map_err(|e| format!("Failed to create webroot directory: {e}"))?;
    Ok(webroot)
}

fn emit_notification(app: &tauri::AppHandle, notification_type: &str, message: impl Into<String>) {
    let _ = app.emit(
        "notification",
        NotificationPayload {
            notification_type: notification_type.to_string(),
            message: message.into(),
        },
    );
}

fn run_command(command: &str, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new(command)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute command `{command}`: {e}"))
}

fn parse_compose_ps(stdout: &str) -> Vec<Container> {
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

fn open_target(target: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", target]);
        c
    };

    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(target);
        c
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(target);
        c
    };

    cmd.spawn()
        .map_err(|e| format!("Failed to open `{target}`: {e}"))?;
    Ok(())
}

fn update_or_insert_site(sites: &mut Vec<Site>, site: Site) {
    if let Some(existing) = sites.iter_mut().find(|s| s.name == site.name) {
        *existing = site;
    } else {
        sites.push(site);
    }
}

fn validate_site_name(input: &str) -> Result<String, String> {
    if input.is_empty() {
        return Err("Site name cannot be empty".to_string());
    }

    if !input
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_'))
    {
        return Err("Site name contains unsupported characters".to_string());
    }

    Ok(input.to_string())
}

#[tauri::command]
fn get_sites() -> Vec<Site> {
    let mut sites = read_sites();
    let webroot = get_webroot_from_settings();

    if let Ok(entries) = fs::read_dir(webroot) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if sites.iter().any(|s| s.name == name) {
                    continue;
                }

                sites.push(Site {
                    name: name.to_string(),
                    path: path.to_string_lossy().to_string(),
                    url: format!("https://{name}"),
                    status: "active".to_string(),
                    aliases: None,
                    web_root: None,
                    multisite: None,
                });
            }
        }
    }

    let _ = write_sites(&sites);
    sites
}

#[tauri::command]
fn get_log_dir() -> Result<String, String> {
    Ok(logs_dir()?.to_string_lossy().to_string())
}

#[tauri::command]
fn create_site(app: tauri::AppHandle, site: SiteCreateRequest) -> Result<(), String> {
    if site.domain.trim().is_empty() {
        return Err("Domain cannot be empty".to_string());
    }

    let webroot = ensure_webroot_exists()?;
    let site_root = webroot.join(&site.domain);
    fs::create_dir_all(&site_root).map_err(|e| format!("Failed to create site root: {e}"))?;

    if let Some(web_root) = &site.web_root {
        fs::create_dir_all(site_root.join(web_root))
            .map_err(|e| format!("Failed to create site webroot directory: {e}"))?;
    }

    let mut sites = read_sites();
    update_or_insert_site(
        &mut sites,
        Site {
            name: site.domain.clone(),
            path: site_root.to_string_lossy().to_string(),
            url: format!("https://{}", site.domain),
            status: "active".to_string(),
            aliases: site.aliases.clone(),
            web_root: site.web_root.clone(),
            multisite: site.multisite.clone(),
        },
    );

    write_sites(&sites)?;
    emit_notification(&app, "success", format!("Site {} created", site.domain));
    Ok(())
}

#[tauri::command]
fn delete_site(app: tauri::AppHandle, site: Site) -> Result<(), String> {
    let mut sites = read_sites();
    sites.retain(|existing| existing.name != site.name);
    write_sites(&sites)?;

    let path = if site.path.trim().is_empty() {
        get_webroot_from_settings().join(&site.name)
    } else {
        PathBuf::from(&site.path)
    };

    if path.exists() {
        fs::remove_dir_all(path).map_err(|e| format!("Failed to remove site directory: {e}"))?;
    }

    emit_notification(&app, "success", format!("Site {} deleted", site.name));
    Ok(())
}

#[tauri::command]
fn update_site(
    app: tauri::AppHandle,
    site: Site,
    data: SiteUpdateRequest,
) -> Result<OperationResult, String> {
    let mut sites = read_sites();

    let existing = sites
        .iter()
        .find(|s| s.name == site.name)
        .cloned()
        .unwrap_or(site);
    let updated = Site {
        aliases: data.aliases.or(existing.aliases),
        web_root: data.web_root.or(existing.web_root),
        ..existing
    };

    update_or_insert_site(&mut sites, updated);
    write_sites(&sites)?;

    emit_notification(&app, "success", "Site updated");
    Ok(OperationResult {
        success: true,
        message: "Site updated".to_string(),
        error: None,
    })
}

#[tauri::command]
fn get_container_status(app: tauri::AppHandle) -> Result<Vec<Container>, String> {
    let output = run_command(
        "docker",
        &[
            "compose",
            "ps",
            "--format",
            "{{.ID}}|{{.Names}}|{{.State}}",
            "-a",
        ],
    )?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let containers = parse_compose_ps(&String::from_utf8_lossy(&output.stdout));
    let _ = app.emit("container-status", containers.clone());
    Ok(containers)
}

#[tauri::command]
fn restart_container(app: tauri::AppHandle, container_id: String) -> Result<bool, String> {
    let output = run_command("docker", &["restart", &container_id])?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let _ = get_container_status(app);
    Ok(true)
}

#[tauri::command]
fn get_xdebug_status() -> bool {
    let config_path = Path::new(XDEBUG_CONFIG_PATH);
    let content = match fs::read_to_string(config_path) {
        Ok(content) => content,
        Err(_) => return false,
    };

    let disabled = content.lines().any(|line| {
        let trimmed = line.trim();
        !trimmed.starts_with(';')
            && !trimmed.starts_with('#')
            && trimmed.eq_ignore_ascii_case("xdebug.mode = off")
    });

    let enabled = content.lines().any(|line| {
        let trimmed = line.trim().to_lowercase();
        !trimmed.starts_with(';')
            && !trimmed.starts_with('#')
            && trimmed.starts_with("xdebug.mode")
            && !trimmed.ends_with("off")
    });

    if disabled {
        return false;
    }

    enabled
}

#[tauri::command]
fn toggle_xdebug(app: tauri::AppHandle) -> Result<bool, String> {
    let target_enabled = !get_xdebug_status();
    let _ = app.emit(
        "xdebug-status",
        XdebugStatusPayload {
            status: "restarting".to_string(),
            enabled: Some(target_enabled),
            message: None,
        },
    );

    let config_path = Path::new(XDEBUG_CONFIG_PATH);
    let current = fs::read_to_string(config_path).unwrap_or_default();
    let mut lines: Vec<String> = current
        .lines()
        .filter(|line| !line.trim().starts_with("xdebug.mode"))
        .map(str::to_string)
        .collect();
    lines.push(if target_enabled {
        "xdebug.mode = develop,debug".to_string()
    } else {
        "xdebug.mode = off".to_string()
    });

    fs::write(config_path, format!("{}\n", lines.join("\n")))
        .map_err(|e| format!("Failed to update xdebug.ini: {e}"))?;

    let restart = run_command("docker", &["compose", "restart", "php"]);
    if let Err(error) = restart {
        let _ = app.emit(
            "xdebug-status",
            XdebugStatusPayload {
                status: "error".to_string(),
                enabled: Some(get_xdebug_status()),
                message: Some(error.clone()),
            },
        );
        return Err(error);
    }

    let final_status = get_xdebug_status();
    let _ = app.emit(
        "xdebug-status",
        XdebugStatusPayload {
            status: "complete".to_string(),
            enabled: Some(final_status),
            message: None,
        },
    );

    let mut settings = read_settings();
    settings.insert("xdebug_enabled".to_string(), final_status.to_string());
    let _ = write_settings(&settings);

    Ok(final_status)
}

#[tauri::command]
fn get_settings() -> HashMap<String, String> {
    read_settings()
}

#[tauri::command]
fn get_setting(key: String) -> Option<String> {
    read_settings().get(&key).cloned()
}

#[tauri::command]
fn save_setting(key: String, value: String) -> OperationResult {
    let mut settings = read_settings();
    settings.insert(key.clone(), value.clone());

    match write_settings(&settings) {
        Ok(_) => OperationResult {
            success: true,
            message: format!("Saved setting `{key}`"),
            error: None,
        },
        Err(error) => OperationResult {
            success: false,
            message: format!("Failed to save setting `{key}`"),
            error: Some(error),
        },
    }
}

#[tauri::command]
fn delete_setting(key: String) -> OperationResult {
    let mut settings = read_settings();
    settings.remove(&key);

    match write_settings(&settings) {
        Ok(_) => OperationResult {
            success: true,
            message: format!("Deleted setting `{key}`"),
            error: None,
        },
        Err(error) => OperationResult {
            success: false,
            message: format!("Failed to delete setting `{key}`"),
            error: Some(error),
        },
    }
}

#[tauri::command]
fn get_webroot_path() -> String {
    get_webroot_from_settings().to_string_lossy().to_string()
}

#[tauri::command]
fn get_xdebug_enabled_setting() -> bool {
    read_settings()
        .get("xdebug_enabled")
        .map(|value| value == "true")
        .unwrap_or(false)
}

#[tauri::command]
fn pick_directory(default_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();

    if let Some(path) = default_path {
        if Path::new(&path).exists() {
            dialog = dialog.set_directory(path);
        }
    }

    dialog
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_update_ready() -> bool {
    false
}

#[tauri::command]
fn install_update_now() -> OperationResult {
    OperationResult {
        success: false,
        message: "Updates are not yet implemented in the Tauri migration.".to_string(),
        error: Some("Updater integration pending".to_string()),
    }
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    open_target(&url)
}

#[tauri::command]
fn open_directory(path: String) -> Result<(), String> {
    open_target(&path)
}

#[tauri::command]
fn scan_site_sonarqube(site_name: String) -> ScanResult {
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
    let source_path = format!("{DOCKER_SITE_ROOT_PATH}/{validated_site_name}");
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

#[tauri::command]
fn run_wp_cli(app: tauri::AppHandle, request: WpCliRequest) -> Result<serde_json::Value, String> {
    let site_name = validate_site_name(&request.site.name)?;
    let work_dir = if let Some(web_root) = request.site.web_root.as_deref() {
        format!("{DOCKER_SITE_ROOT_PATH}/{}/{}", site_name, web_root)
    } else {
        format!("{DOCKER_SITE_ROOT_PATH}/{}", site_name)
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

#[tauri::command]
fn start_service(app: tauri::AppHandle, service_name: String) -> Result<(), String> {
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
fn stop_service(app: tauri::AppHandle, service_name: String) -> Result<(), String> {
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
fn get_status(service_name: Option<String>) -> Result<Vec<Container>, String> {
    let mut args = vec![
        "compose".to_string(),
        "ps".to_string(),
        "--format".to_string(),
        "{{.ID}}|{{.Names}}|{{.State}}".to_string(),
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

    Ok(parse_compose_ps(&String::from_utf8_lossy(&output.stdout)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_sites,
            get_log_dir,
            create_site,
            delete_site,
            update_site,
            get_container_status,
            restart_container,
            get_xdebug_status,
            toggle_xdebug,
            get_settings,
            get_setting,
            save_setting,
            delete_setting,
            get_webroot_path,
            get_xdebug_enabled_setting,
            pick_directory,
            get_update_ready,
            install_update_now,
            open_external,
            open_directory,
            scan_site_sonarqube,
            run_wp_cli,
            start_service,
            stop_service,
            get_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
    fn default_webroot_ends_with_www() {
        assert!(default_webroot().to_string_lossy().ends_with("www"));
    }
}
