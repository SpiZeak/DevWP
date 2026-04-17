use crate::settings::{ensure_webroot_exists, get_webroot_from_settings};
use crate::utils::{
    emit_notification, ensure_state_root, run_command, OperationResult, DOCKER_SITE_ROOT_PATH,
};
use crate::wp_cli::{PHP_CONTAINER_NAME, WP_CLI_ERROR_REPORTING};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub fn nginx_template_path() -> std::path::PathBuf {
    crate::utils::project_root().join("config/nginx/template-site.conf")
}
pub fn nginx_sites_enabled_path() -> std::path::PathBuf {
    crate::utils::project_root().join("config/nginx/sites-enabled")
}

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
pub struct WordPressInstallConfig {
    pub title: String,
    pub admin_user: String,
    pub admin_password: String,
    pub admin_email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteCreateRequest {
    pub domain: String,
    pub web_root: Option<String>,
    pub aliases: Option<String>,
    pub multisite: Option<MultisiteConfig>,
    pub wordpress: Option<WordPressInstallConfig>,
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

fn parse_domains(domain: &str, aliases: Option<&str>) -> Result<Vec<String>, String> {
    let mut domains = vec![validate_site_name(domain)?];
    if let Some(a) = aliases {
        for alias in a.split(|c: char| c.is_whitespace() || c == ',') {
            let alias = alias.trim();
            if !alias.is_empty() {
                domains.push(validate_site_name(alias)?);
            }
        }
    }
    Ok(domains)
}

fn regenerate_certificate(sites: &[Site]) -> Result<(), String> {
    let cert_dir = crate::utils::project_root().join("config/certs");

    // Collect every domain and alias across all sites
    let mut domains: Vec<String> = Vec::new();
    for s in sites {
        domains.push(s.name.clone());
        if let Some(aliases) = &s.aliases {
            for alias in aliases.split(|c: char| c.is_whitespace() || c == ',') {
                let alias = alias.trim();
                if !alias.is_empty() {
                    domains.push(alias.to_string());
                }
            }
        }
    }
    domains.dedup();

    if domains.is_empty() {
        return Ok(());
    }

    let san_lines: String = domains
        .iter()
        .enumerate()
        .map(|(i, d)| format!("DNS.{} = {}", i + 1, d))
        .collect::<Vec<_>>()
        .join("\n");

    let cnf = format!(
        "[req]\n\
         req_extensions = v3_req\n\
         distinguished_name = req_distinguished_name\n\
         [req_distinguished_name]\n\
         [v3_req]\n\
         basicConstraints = CA:FALSE\n\
         keyUsage = nonRepudiation, digitalSignature, keyEncipherment\n\
         extendedKeyUsage = clientAuth, serverAuth\n\
         subjectAltName = @alt_names\n\
         [alt_names]\n\
         {san_lines}\n"
    );

    let tmp_conf = std::env::temp_dir().join("devwp_san.cnf");
    fs::write(&tmp_conf, &cnf).map_err(|e| format!("Failed to write temp OpenSSL config: {e}"))?;

    let ca_cert = cert_dir.join("ca.pem");
    let ca_key = cert_dir.join("ca-key.pem");
    let cert_key = cert_dir.join("key.pem");
    let cert_csr = std::env::temp_dir().join("devwp_key.csr");
    let cert_out_tmp = std::env::temp_dir().join("devwp_cert.pem");
    let cert_out = cert_dir.join("cert.pem");
    let ca_srl = cert_dir.join("ca.srl");
    let ca_srl_tmp = std::env::temp_dir().join("devwp_ca.srl");
    // Copy the serial file to temp so OpenSSL can update it without needing root
    if ca_srl.exists() {
        fs::copy(&ca_srl, &ca_srl_tmp)
            .map_err(|e| format!("Failed to copy ca.srl to temp: {e}"))?;
    }

    let s_key = cert_key.to_str().ok_or("Non-UTF8 cert path")?.to_string();
    let s_csr = cert_csr.to_str().ok_or("Non-UTF8 cert path")?.to_string();
    let s_ca_cert = ca_cert.to_str().ok_or("Non-UTF8 cert path")?.to_string();
    let s_ca_key = ca_key.to_str().ok_or("Non-UTF8 cert path")?.to_string();
    let s_ca_srl = ca_srl_tmp.to_str().ok_or("Non-UTF8 cert path")?.to_string();
    let s_cert_out_tmp = cert_out_tmp
        .to_str()
        .ok_or("Non-UTF8 cert path")?
        .to_string();
    let s_cert_out = cert_out.to_str().ok_or("Non-UTF8 cert path")?.to_string();
    let s_tmp_conf = tmp_conf.to_str().ok_or("Non-UTF8 cert path")?.to_string();

    let csr_result = run_command(
        "openssl",
        &[
            "req",
            "-new",
            "-key",
            &s_key,
            "-out",
            &s_csr,
            "-subj",
            "/CN=DevWP Local",
            "-config",
            &s_tmp_conf,
        ],
    );

    let sign_result = csr_result.and_then(|out| {
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr).to_string();
            return Err(format!("openssl req failed: {err}"));
        }
        run_command(
            "openssl",
            &[
                "x509",
                "-req",
                "-in",
                &s_csr,
                "-CA",
                &s_ca_cert,
                "-CAkey",
                &s_ca_key,
                "-CAserial",
                &s_ca_srl,
                "-out",
                &s_cert_out_tmp,
                "-days",
                "3650",
                "-extfile",
                &s_tmp_conf,
                "-extensions",
                "v3_req",
            ],
        )
    });

    let _ = fs::remove_file(&tmp_conf);
    let _ = fs::remove_file(&cert_csr);

    let sign_output = sign_result?;
    if !sign_output.status.success() {
        let err = String::from_utf8_lossy(&sign_output.stderr).to_string();
        return Err(format!("openssl x509 failed: {err}"));
    }

    // Copy the new cert to the certs directory — try directly first, fall back to pkexec
    let cert_bytes =
        fs::read(&cert_out_tmp).map_err(|e| format!("Failed to read generated cert: {e}"))?;
    let _ = fs::remove_file(&cert_out_tmp);

    match fs::write(&cert_out, &cert_bytes) {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
            let mut child = Command::new("pkexec")
                .args(["tee", &s_cert_out])
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .spawn()
                .map_err(|e| format!("Failed to launch pkexec for cert: {e}"))?;
            if let Some(mut stdin) = child.stdin.take() {
                stdin
                    .write_all(&cert_bytes)
                    .map_err(|e| format!("Failed to write cert via pkexec: {e}"))?;
            }
            let status = child
                .wait()
                .map_err(|e| format!("pkexec wait failed: {e}"))?;
            if !status.success() {
                return Err("Failed to write cert.pem: pkexec returned non-zero".to_string());
            }
        }
        Err(e) => return Err(format!("Failed to write cert.pem: {e}")),
    }

    Ok(())
}

fn nginx_reload() {
    let _ = run_command("docker", &["exec", "devwp_nginx", "nginx", "-s", "reload"]);
}

fn generate_nginx_config(
    domain: &str,
    aliases: Option<&str>,
    web_root: Option<&str>,
    multisite: Option<&MultisiteConfig>,
) -> Result<(), String> {
    let template = fs::read_to_string(nginx_template_path())
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
            let root_path = match web_root.filter(|r| !r.is_empty()) {
                Some(wr) => format!("{DOCKER_SITE_ROOT_PATH}/{domain}/{wr}"),
                None => format!("{DOCKER_SITE_ROOT_PATH}/{domain}"),
            };
            output_lines.push(format!("{indent}root {root_path};"));
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

    let sites_enabled = nginx_sites_enabled_path();
    fs::create_dir_all(&sites_enabled)
        .map_err(|e| format!("Failed to create sites-enabled directory: {e}"))?;

    let conf_path = sites_enabled.join(format!("{domain}.conf"));
    fs::write(conf_path, config_content)
        .map_err(|e| format!("Failed to write nginx config: {e}"))?;

    Ok(())
}

fn add_hosts_entry(domain: &str, aliases: Option<&str>) -> Result<(), String> {
    let domains = parse_domains(domain, aliases)?;
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
    let domains = parse_domains(domain, aliases)?;
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

fn install_wordpress(
    app: &tauri::AppHandle,
    domain: &str,
    web_root: Option<&str>,
    config: &WordPressInstallConfig,
) -> Result<(), String> {
    let work_dir = match web_root {
        Some(wr) => format!("{DOCKER_SITE_ROOT_PATH}/{domain}/{wr}"),
        None => format!("{DOCKER_SITE_ROOT_PATH}/{domain}"),
    };

    let db_name = domain.replace(['.', '-'], "_");

    let run_wp = |cmd_args: &[&str]| -> Result<(), String> {
        let mut args = vec![
            "exec",
            "-w",
            work_dir.as_str(),
            PHP_CONTAINER_NAME,
            "php",
            "-d",
            WP_CLI_ERROR_REPORTING,
            "/usr/local/bin/wp",
        ];
        args.extend_from_slice(cmd_args);
        let output = run_command("docker", &args)?;
        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let detail = if !stderr.is_empty() { stderr } else { stdout };
            Err(format!(
                "wp {} failed: {}",
                cmd_args.first().copied().unwrap_or(""),
                detail
            ))
        }
    };

    emit_notification(app, "info", format!("[{domain}] Downloading WordPress..."));
    run_wp(&["core", "download"])?;

    let dbname_arg = format!("--dbname={db_name}");
    emit_notification(app, "info", format!("[{domain}] Creating wp-config.php..."));
    run_wp(&[
        "config",
        "create",
        &dbname_arg,
        "--dbuser=root",
        "--dbpass=root",
        "--dbhost=devwp_mariadb",
    ])?;

    emit_notification(app, "info", format!("[{domain}] Creating database..."));
    let create_db_sql = format!("CREATE DATABASE IF NOT EXISTS `{db_name}`");
    let output = run_command(
        "docker",
        &[
            "exec",
            "devwp_mariadb",
            "mariadb",
            "-uroot",
            "-proot",
            "-e",
            &create_db_sql,
        ],
    )?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Failed to create database: {stderr}"));
    }

    emit_notification(
        app,
        "info",
        format!("[{domain}] Running WordPress install..."),
    );

    let url_arg = format!("--url=https://{domain}");
    let title_arg = format!(
        "--title={}",
        if config.title.is_empty() {
            domain
        } else {
            &config.title
        }
    );
    let user_arg = format!(
        "--admin_user={}",
        if config.admin_user.is_empty() {
            "root"
        } else {
            &config.admin_user
        }
    );
    let pass_arg = format!(
        "--admin_password={}",
        if config.admin_password.is_empty() {
            "root"
        } else {
            &config.admin_password
        }
    );
    let email_arg = format!(
        "--admin_email={}",
        if config.admin_email.is_empty() {
            "root@example.com"
        } else {
            &config.admin_email
        }
    );
    run_wp(&[
        "core",
        "install",
        &url_arg,
        &title_arg,
        &user_arg,
        &pass_arg,
        &email_arg,
        "--skip-email",
    ])?;

    Ok(())
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
    regenerate_certificate(&sites)?;
    generate_nginx_config(
        &site.domain,
        site.aliases.as_deref(),
        site.web_root.as_deref(),
        site.multisite.as_ref(),
    )?;
    nginx_reload();
    add_hosts_entry(&site.domain, site.aliases.as_deref())?;

    if let Some(wp_config) = &site.wordpress {
        install_wordpress(&app, &site.domain, site.web_root.as_deref(), wp_config)?;
    }

    emit_notification(&app, "success", format!("Site {} created", site.domain));
    Ok(())
}

#[tauri::command]
pub fn delete_site(app: tauri::AppHandle, site: Site) -> Result<(), String> {
    let mut sites = read_sites();
    sites.retain(|existing| existing.name != site.name);
    write_sites(&sites)?;
    let _ = regenerate_certificate(&sites);

    let path = if site.path.trim().is_empty() {
        get_webroot_from_settings().join(&site.name)
    } else {
        PathBuf::from(&site.path)
    };

    if path.exists() {
        fs::remove_dir_all(path).map_err(|e| format!("Failed to remove site directory: {e}"))?;
    }

    let conf_path = nginx_sites_enabled_path().join(format!("{}.conf", site.name));
    if conf_path.exists() {
        let _ = fs::remove_file(conf_path);
    }

    nginx_reload();
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

    let old_aliases = existing.aliases.clone();

    let updated = Site {
        aliases: data
            .aliases
            .filter(|s| !s.is_empty())
            .or(existing.aliases.clone()),
        web_root: data
            .web_root
            .filter(|s| !s.is_empty())
            .or(existing.web_root.clone()),
        ..existing.clone()
    };

    update_or_insert_site(&mut sites, updated.clone());
    write_sites(&sites)?;

    // Remove old alias hosts entries, regenerate cert and nginx config, add new ones
    let _ = remove_hosts_entry(&existing.name, old_aliases.as_deref());
    let _ = regenerate_certificate(&sites);
    generate_nginx_config(
        &updated.name,
        updated.aliases.as_deref(),
        updated.web_root.as_deref(),
        updated.multisite.as_ref(),
    )?;
    nginx_reload();
    add_hosts_entry(&updated.name, updated.aliases.as_deref())?;

    emit_notification(&app, "success", "Site updated");
    Ok(OperationResult {
        success: true,
        message: "Site updated".to_string(),
        error: None,
    })
}
