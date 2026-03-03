use crate::settings::{ensure_webroot_exists, get_webroot_from_settings};
use crate::utils::{emit_notification, ensure_state_root, OperationResult, DOCKER_SITE_ROOT_PATH};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub const NGINX_TEMPLATE_PATH: &str = "config/nginx/template-site.conf";
pub const NGINX_SITES_ENABLED_PATH: &str = "config/nginx/sites-enabled";

#[cfg(target_os = "windows")]
pub const HOSTS_FILE_PATH: &str = r"C:\Windows\System32\drivers\etc\hosts";
#[cfg(not(target_os = "windows"))]
pub const HOSTS_FILE_PATH: &str = "/etc/hosts";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub name: String,
    pub path: String,
    pub url: String,
    pub status: String,
    pub aliases: Option<String>,
    pub web_root: Option<String>,
    pub multisite: Option<MultisiteConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisiteConfig {
    pub enabled: bool,
    #[serde(rename = "type")]
    pub site_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteCreateRequest {
    pub domain: String,
    pub web_root: Option<String>,
    pub aliases: Option<String>,
    pub multisite: Option<MultisiteConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteUpdateRequest {
    pub aliases: Option<String>,
    pub web_root: Option<String>,
}

pub fn sites_file() -> Result<PathBuf, String> {
    Ok(ensure_state_root()?.join("sites.json"))
}

pub fn read_sites() -> Vec<Site> {
    let path = match sites_file() {
        Ok(path) => path,
        Err(_) => return Vec::new(),
    };

    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

pub fn write_sites(sites: &[Site]) -> Result<(), String> {
    let path = sites_file()?;
    let content =
        serde_json::to_string_pretty(sites).map_err(|e| format!("Serialize sites: {e}"))?;
    fs::write(path, content).map_err(|e| format!("Write sites: {e}"))
}

pub fn update_or_insert_site(sites: &mut Vec<Site>, site: Site) {
    if let Some(existing) = sites.iter_mut().find(|s| s.name == site.name) {
        *existing = site;
    } else {
        sites.push(site);
    }
}

pub fn validate_site_name(input: &str) -> Result<String, String> {
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

fn parse_domains(domain: &str, aliases: Option<&str>) -> Vec<String> {
    let mut domains = vec![domain.to_string()];
    if let Some(a) = aliases {
        for alias in a.split(|c: char| c.is_whitespace() || c == ',') {
            let alias = alias.trim();
            if !alias.is_empty() {
                domains.push(alias.to_string());
            }
        }
    }
    domains
}

fn generate_nginx_config(
    domain: &str,
    aliases: Option<&str>,
    multisite: Option<&MultisiteConfig>,
) -> Result<(), String> {
    let template = fs::read_to_string(NGINX_TEMPLATE_PATH)
        .map_err(|e| format!("Failed to read nginx template: {e}"))?;

    let active_type = match multisite {
        Some(m) if m.enabled => m.site_type.as_str(),
        _ => "single",
    };

    let domain_list = {
        let mut parts = vec![domain];
        if let Some(a) = aliases {
            for alias in a.split(|c: char| c.is_whitespace() || c == ',') {
                let alias = alias.trim();
                if !alias.is_empty() {
                    parts.push(alias);
                }
            }
        }
        parts.join(" ")
    };

    let mut output_lines: Vec<String> = Vec::new();

    for line in template.lines() {
        let trimmed = line.trim();
        let indent = &line[..line.len() - trimmed.len()];

        if trimmed.starts_with("server_name ") {
            output_lines.push(format!("{indent}server_name {domain_list};"));
            continue;
        }

        if trimmed.starts_with("root /") {
            output_lines.push(format!("{indent}root {DOCKER_SITE_ROOT_PATH}/{domain};"));
            continue;
        }

        // Handle the three WordPress include variants — swap which is active.
        let base = trimmed.trim_start_matches("# ");
        let is_wp_single = base == "include global/wordpress.conf;";
        let is_wp_subdir = base == "include global/wordpress-ms-subdir.conf;";
        let is_wp_subdom = base == "include global/wordpress-ms-subdomain.conf;";

        if is_wp_single || is_wp_subdir || is_wp_subdom {
            let should_be_active = match active_type {
                "subdir" => is_wp_subdir,
                "subdomain" => is_wp_subdom,
                _ => is_wp_single,
            };
            if should_be_active {
                output_lines.push(format!("{indent}{base}"));
            } else {
                output_lines.push(format!("{indent}# {base}"));
            }
            continue;
        }

        output_lines.push(line.to_string());
    }

    let config_content = output_lines.join("\n") + "\n";

    fs::create_dir_all(NGINX_SITES_ENABLED_PATH)
        .map_err(|e| format!("Failed to create sites-enabled directory: {e}"))?;

    let conf_path = Path::new(NGINX_SITES_ENABLED_PATH).join(format!("{domain}.conf"));
    fs::write(conf_path, config_content)
        .map_err(|e| format!("Failed to write nginx config: {e}"))?;

    Ok(())
}

fn add_hosts_entry(domain: &str, aliases: Option<&str>) -> Result<(), String> {
    let domains = parse_domains(domain, aliases);
    let hosts_path = Path::new(HOSTS_FILE_PATH);
    let current = fs::read_to_string(hosts_path).unwrap_or_default();

    let entries_to_add: Vec<String> = domains
        .iter()
        .filter(|d| {
            !current.lines().any(|line| {
                let trimmed = line.trim();
                if trimmed.starts_with('#') {
                    return false;
                }
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                parts.len() >= 2 && parts[1..].contains(&d.as_str())
            })
        })
        .map(|d| format!("127.0.0.1 {d}"))
        .collect();

    if entries_to_add.is_empty() {
        return Ok(());
    }

    let to_append = format!("\n{}\n", entries_to_add.join("\n"));

    // Try direct append first (works when running as root or on permissive systems).
    let direct_result = fs::OpenOptions::new()
        .append(true)
        .open(hosts_path)
        .and_then(|mut f| f.write_all(to_append.as_bytes()));

    match direct_result {
        Ok(_) => return Ok(()),
        Err(e) if e.kind() != std::io::ErrorKind::PermissionDenied => {
            return Err(format!("Failed to open hosts file: {e}"));
        }
        _ => {}
    }

    elevate_append_hosts(&to_append)
}

#[allow(unreachable_code)]
fn elevate_append_hosts(content: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let mut child = Command::new("pkexec")
            .args(["tee", "-a", HOSTS_FILE_PATH])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to launch pkexec: {e}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(content.as_bytes())
                .map_err(|e| format!("Failed to write to pkexec stdin: {e}"))?;
        }
        let status = child
            .wait()
            .map_err(|e| format!("pkexec wait failed: {e}"))?;
        if !status.success() {
            return Err("Failed to add hosts entry: pkexec returned non-zero".to_string());
        }
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let escaped = content.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!(
            "do shell script \"printf '%s' '{escaped}' >> {HOSTS_FILE_PATH}\" with administrator privileges"
        );
        let status = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .status()
            .map_err(|e| format!("Failed to launch osascript: {e}"))?;
        if !status.success() {
            return Err("Failed to add hosts entry: osascript returned non-zero".to_string());
        }
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let ps_content = content.replace('\n', "`n").replace('\'', "''");
        let ps_cmd = format!("Add-Content -Path '{HOSTS_FILE_PATH}' -Value '{ps_content}'");
        let status = Command::new("powershell")
            .args(["-Command", &ps_cmd])
            .status()
            .map_err(|e| format!("Failed to launch PowerShell: {e}"))?;
        if !status.success() {
            return Err("Failed to add hosts entry: PowerShell returned non-zero".to_string());
        }
        return Ok(());
    }

    Err(
        "Failed to modify hosts file: permission denied and no elevation method available"
            .to_string(),
    )
}

fn remove_hosts_entry(domain: &str, aliases: Option<&str>) -> Result<(), String> {
    let domains = parse_domains(domain, aliases);
    let hosts_path = Path::new(HOSTS_FILE_PATH);

    let current = match fs::read_to_string(hosts_path) {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("Failed to read hosts file: {e}")),
    };

    let new_content: String = current
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with('#') || trimmed.is_empty() {
                return true;
            }
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            // Only remove exact single-domain lines we added: "127.0.0.1 <domain>"
            !domains
                .iter()
                .any(|d| parts.len() == 2 && parts[0] == "127.0.0.1" && parts[1] == d)
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";

    if new_content == current {
        return Ok(());
    }

    let direct_result = fs::write(hosts_path, new_content.as_bytes());
    match direct_result {
        Ok(_) => return Ok(()),
        Err(e) if e.kind() != std::io::ErrorKind::PermissionDenied => {
            return Err(format!("Failed to write hosts file: {e}"));
        }
        _ => {}
    }

    elevate_write_hosts(&new_content)
}

#[allow(unreachable_code)]
fn elevate_write_hosts(content: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let mut child = Command::new("pkexec")
            .args(["tee", HOSTS_FILE_PATH])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to launch pkexec: {e}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(content.as_bytes())
                .map_err(|e| format!("Failed to write to pkexec stdin: {e}"))?;
        }
        let status = child
            .wait()
            .map_err(|e| format!("pkexec wait failed: {e}"))?;
        if !status.success() {
            return Err("Failed to remove hosts entry: pkexec returned non-zero".to_string());
        }
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let escaped = content.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!(
            "do shell script \"printf '%s' '{escaped}' | tee {HOSTS_FILE_PATH}\" with administrator privileges"
        );
        let status = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .status()
            .map_err(|e| format!("Failed to launch osascript: {e}"))?;
        if !status.success() {
            return Err("Failed to remove hosts entry: osascript returned non-zero".to_string());
        }
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let escaped = content.replace('\'', "''");
        let ps_cmd = format!("Set-Content -Path '{HOSTS_FILE_PATH}' -Value '{escaped}'");
        let status = Command::new("powershell")
            .args(["-Command", &ps_cmd])
            .status()
            .map_err(|e| format!("Failed to launch PowerShell: {e}"))?;
        if !status.success() {
            return Err("Failed to remove hosts entry: PowerShell returned non-zero".to_string());
        }
        return Ok(());
    }

    Err(
        "Failed to modify hosts file: permission denied and no elevation method available"
            .to_string(),
    )
}

#[tauri::command]
pub fn get_sites() -> Vec<Site> {
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
pub fn create_site(app: tauri::AppHandle, site: SiteCreateRequest) -> Result<(), String> {
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
    generate_nginx_config(
        &site.domain,
        site.aliases.as_deref(),
        site.multisite.as_ref(),
    )?;
    add_hosts_entry(&site.domain, site.aliases.as_deref())?;
    emit_notification(&app, "success", format!("Site {} created", site.domain));
    Ok(())
}

#[tauri::command]
pub fn delete_site(app: tauri::AppHandle, site: Site) -> Result<(), String> {
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

    let conf_path = Path::new(NGINX_SITES_ENABLED_PATH).join(format!("{}.conf", site.name));
    if conf_path.exists() {
        let _ = fs::remove_file(conf_path);
    }

    let _ = remove_hosts_entry(&site.name, site.aliases.as_deref());

    emit_notification(&app, "success", format!("Site {} deleted", site.name));
    Ok(())
}

#[tauri::command]
pub fn update_site(
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
