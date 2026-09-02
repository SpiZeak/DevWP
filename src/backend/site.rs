use crate::backend::docker::{exec_in_container, ExecOptions};
use crate::backend::settings::{ensure_webroot_exists, get_webroot_from_settings};
use crate::backend::utils::{
    emit_notification, ensure_state_root, home_dir, run_command, save_json, NotificationType,
    DOCKER_SITE_ROOT_PATH,
};
use crate::backend::wp_cli::{PHP_CONTAINER_NAME, WP_CLI_ERROR_REPORTING};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tracing::info;

static SITES_LOCK: Mutex<()> = Mutex::new(());

pub fn nginx_template_path() -> std::path::PathBuf {
    crate::backend::utils::project_root().join("config/nginx/template-site.conf")
}
pub fn nginx_sites_enabled_path() -> std::path::PathBuf {
    crate::backend::utils::project_root().join("config/nginx/sites-enabled")
}

#[cfg(target_os = "windows")]
pub const HOSTS_FILE_PATH: &str = r"C:\Windows\System32\drivers\etc\hosts";
#[cfg(not(target_os = "windows"))]
pub const HOSTS_FILE_PATH: &str = "/etc/hosts";

/// Typed site status. `Unknown` catches any legacy/foreign value in sites.json.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SiteStatus {
    Active,
    Provisioning,
    #[serde(other)]
    Unknown,
}

impl std::fmt::Display for SiteStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Active => "active",
            Self::Provisioning => "provisioning",
            Self::Unknown => "unknown",
        })
    }
}

/// Multisite topology. `subdir` is accepted as a legacy alias for
/// `subdirectory` (configs written by older versions).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum MultisiteType {
    #[default]
    #[serde(rename = "subdirectory", alias = "subdir")]
    Subdirectory,
    #[serde(rename = "subdomain")]
    Subdomain,
    #[serde(other)]
    Unknown,
}

impl std::fmt::Display for MultisiteType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Subdirectory => "subdirectory",
            Self::Subdomain => "subdomain",
            Self::Unknown => "unknown",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub name: String,
    pub path: String,
    pub url: String,
    pub status: SiteStatus,
    pub aliases: Option<String>,
    pub web_root: Option<String>,
    pub multisite: Option<MultisiteConfig>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisiteConfig {
    pub enabled: bool,
    #[serde(rename = "type")]
    pub site_type: MultisiteType,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordPressInstallConfig {
    pub title: String,
    pub admin_user: String,
    pub admin_password: String,
    pub admin_email: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

/// Split a space/comma-separated alias list into trimmed, non-empty tokens.
pub fn split_aliases(s: &str) -> impl Iterator<Item = &str> {
    s.split(|c: char| c.is_whitespace() || c == ',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

fn read_sites_checked() -> Result<Vec<Site>, String> {
    let path = sites_file()?;
    crate::backend::utils::load_json_or_report(&path, "sites")
}

fn write_sites_unchecked(sites: &[Site]) -> Result<(), String> {
    save_json(&sites_file()?, sites, "sites")
}

fn acquire_sites_lock() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    SITES_LOCK
        .lock()
        .map_err(|e| format!("Sites lock poisoned: {e}"))
}

pub fn update_or_insert_site(sites: &mut Vec<Site>, site: Site) {
    if let Some(existing) = sites.iter_mut().find(|s| s.name == site.name) {
        *existing = site;
    } else {
        sites.push(site);
    }
}

/// Validate a site/domain name: non-empty, alphanumeric plus `.`, `-`, `_`,
/// no empty/`..` segments (so it can never escape a directory or inject
/// nginx/SQL syntax).
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

    if input.split('.').any(|seg| seg.is_empty()) || input.split('.').any(|seg| seg == "..") {
        return Err("Site name contains invalid '.' segments".to_string());
    }

    Ok(input.to_string())
}

/// Validate a web-root segment: relative, single path segment, no traversal,
/// no path/control characters.
fn validate_site_webroot(input: &str) -> Result<(), String> {
    if input.is_empty() {
        return Ok(());
    }
    if input.contains('/')
        || input.contains('\\')
        || input.contains("..")
        || input.chars().any(char::is_control)
    {
        return Err(format!(
            "Web root '{input}' must be a single relative path segment without '..' or '/'"
        ));
    }
    Ok(())
}

fn validate_site_aliases(aliases: Option<&str>) -> Result<(), String> {
    if let Some(a) = aliases {
        for alias in split_aliases(a) {
            validate_site_name(alias)?;
        }
    }
    Ok(())
}

/// Append `.test` when the input has no top-level dot (mirrors the previous
/// renderer behaviour).
pub fn format_domain(domain: &str) -> String {
    let trimmed = domain.trim();
    if trimmed.contains('.') {
        trimmed.to_string()
    } else {
        format!("{trimmed}.test")
    }
}

/// Simple email format check (mirrors the previous renderer validation).
pub fn is_valid_email(email: &str) -> bool {
    let at = email.find('@');
    let Some(at) = at else {
        return false;
    };
    let local = &email[..at];
    let domain = &email[at + 1..];
    !local.is_empty()
        && !local.contains(char::is_whitespace)
        && domain.contains('.')
        && !domain.contains(char::is_whitespace)
}

fn parse_domains(domain: &str, aliases: Option<&str>) -> Result<Vec<String>, String> {
    let mut domains = vec![validate_site_name(domain)?];
    if let Some(a) = aliases {
        for alias in split_aliases(a) {
            domains.push(validate_site_name(alias)?);
        }
    }
    Ok(domains)
}

fn regenerate_certificate(sites: &[Site]) -> Result<(), String> {
    let cert_dir = crate::backend::utils::project_root().join("config/certs");

    // Collect every domain and alias across all sites
    let mut domains: Vec<String> = Vec::new();
    for s in sites {
        domains.push(s.name.clone());
        if let Some(aliases) = &s.aliases {
            for alias in split_aliases(aliases) {
                domains.push(alias.to_string());
            }
        }
    }
    // Sort before dedup: `dedup` alone only removes consecutive repeats.
    domains.sort();
    domains.dedup();

    if domains.is_empty() {
        return Ok(());
    }

    // Ensure mkcert is available — look in common locations
    let mkcert = find_mkcert()?;

    // Build mkcert args: -cert-file, -key-file, then all domains
    let cert_out = cert_dir.join("cert.pem");
    let key_out = cert_dir.join("key.pem");
    let s_cert_out = cert_out.to_str().ok_or("Non-UTF8 cert path")?.to_string();
    let s_key_out = key_out.to_str().ok_or("Non-UTF8 cert path")?.to_string();

    let mut args = vec!["-cert-file", &s_cert_out, "-key-file", &s_key_out];
    let domain_refs: Vec<&str> = domains.iter().map(|d| d.as_str()).collect();
    args.extend(domain_refs);

    info!(
        "Regenerating certificate with mkcert for domains: {}",
        domains.join(", ")
    );

    let result = run_command(&mkcert, &args)?;
    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr).to_string();
        return Err(format!("mkcert failed: {stderr}"));
    }

    // Ensure mkcert's CA is available for nginx (ssl_trusted_certificate)
    let caroot_output = run_command(&mkcert, &["-CAROOT"])?;
    let caroot = String::from_utf8_lossy(&caroot_output.stdout)
        .trim()
        .to_string();
    let ca_src = std::path::Path::new(&caroot).join("rootCA.pem");
    let ca_dst = cert_dir.join("ca.pem");
    if ca_src.exists() {
        fs::copy(&ca_src, &ca_dst).map_err(|e| format!("Failed to copy mkcert CA: {e}"))?;
    }

    Ok(())
}

/// Find the mkcert binary. Checks PATH first, then common install locations.
pub fn find_mkcert() -> Result<String, String> {
    // Check PATH
    if let Ok(paths) = std::env::var("PATH") {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join("mkcert");
            if candidate.exists() {
                return Ok(candidate.to_string_lossy().to_string());
            }
        }
    }
    // Check common user install locations
    let home = home_dir();
    let common_locations = vec![
        home.join(".local/bin/mkcert"),
        home.join(".cargo/bin/mkcert"),
        home.join("bin/mkcert"),
    ];
    for loc in &common_locations {
        if loc.exists() {
            return Ok(loc.to_string_lossy().to_string());
        }
    }
    Err("mkcert not found. Please install mkcert first:\n  https://github.com/FiloSottile/mkcert#installation\nor run: scripts/setup-certs.sh".to_string())
}

/// Validate the generated config with `nginx -t` before reloading; an invalid
/// config must never be applied (and would fail the running nginx otherwise).
/// A transport failure of the check itself also skips the reload — we cannot
/// know the config is safe to apply.
fn nginx_reload() {
    let test = exec_in_container("devwp_nginx", &["nginx", "-t"], &ExecOptions::default());
    match test {
        Ok(output) if output.success() => {}
        Ok(output) => {
            crate::state::push_notification(
                NotificationType::Error,
                format!(
                    "Nginx config check failed, reload skipped:\n{}",
                    output.stderr
                ),
            );
            return;
        }
        Err(error) => {
            crate::state::push_notification(
                NotificationType::Error,
                format!("Nginx config check could not run, reload skipped: {error}"),
            );
            return;
        }
    }
    if let Err(error) = exec_in_container(
        "devwp_nginx",
        &["nginx", "-s", "reload"],
        &ExecOptions::default(),
    ) {
        crate::state::push_notification(
            NotificationType::Warning,
            format!("Nginx reload failed: {error}"),
        );
    }
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
        Some(m) if m.enabled => Some(m.site_type),
        _ => None,
    };

    let domain_list = {
        let mut parts = vec![domain];
        if let Some(a) = aliases {
            for alias in split_aliases(a) {
                parts.push(alias);
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
                Some(MultisiteType::Subdirectory) => is_wp_subdir,
                Some(MultisiteType::Subdomain) => is_wp_subdom,
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

    elevate_hosts(&to_append, true)
}

/// Stage hosts content in a temp file so it never has to survive
/// AppleScript/PowerShell string escaping (a `'` in a hosts comment must not
/// break out of the elevated command). Windows hosts files want CRLF endings.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn stage_hosts_temp(content: &str) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let content = content.replace("\r\n", "\n").replace('\n', "\r\n");

    let tmp = std::env::temp_dir().join(format!(
        "devwp-hosts-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0),
    ));
    fs::write(&tmp, content).map_err(|e| format!("Failed to stage hosts content: {e}"))?;

    let path = tmp.display().to_string();
    if path.contains('\'') || path.contains('"') || path.contains('\\') {
        let _ = fs::remove_file(&tmp);
        return Err("Temp path contains shell metacharacters".to_string());
    }
    Ok(tmp)
}

/// Write (`append == false`) or append to the hosts file with elevated
/// privileges, after the direct unelevated attempt was denied. Linux pipes
/// the content through `pkexec tee`; macOS/Windows elevate a helper that
/// copies the staged temp file, so only validated paths cross a quoting
/// boundary.
#[allow(unreachable_code)]
fn elevate_hosts(content: &str, append: bool) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let mut cmd = Command::new("pkexec");
        cmd.arg("tee");
        if append {
            cmd.arg("-a");
        }
        let mut child = cmd
            .arg(HOSTS_FILE_PATH)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .map_err(|_| {
                format!(
                    "pkexec not available. Run manually:\n  echo '127.0.0.1 <domain>' | sudo tee {}{}",
                    if append { "-a " } else { "" },
                    HOSTS_FILE_PATH
                )
            })?;
        {
            let mut stdin = child
                .stdin
                .take()
                .ok_or_else(|| "pkexec closed stdin before receiving data".to_string())?;
            stdin
                .write_all(content.as_bytes())
                .map_err(|e| format!("Failed to write to pkexec stdin: {e}"))?;
        }
        // stdin dropped — tee sees EOF and can exit
        let status = child
            .wait()
            .map_err(|e| format!("pkexec wait failed: {e}"))?;
        if !status.success() {
            return Err(format!(
                "pkexec exited with code {:?}. Run the sudo command manually.",
                status.code()
            ));
        }
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let tmp = stage_hosts_temp(content)?;
        let script = format!(
            "do shell script \"/bin/cat '{}' {} {}\" with administrator privileges",
            tmp.display(),
            if append { ">>" } else { ">" },
            HOSTS_FILE_PATH
        );
        let status = Command::new("osascript")
            .args(["-e", &script])
            .status()
            .map_err(|e| format!("Failed to launch osascript: {e}"))?;
        let _ = fs::remove_file(&tmp);
        if !status.success() {
            return Err("Failed to modify hosts file: osascript returned non-zero".to_string());
        }
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let tmp = stage_hosts_temp(content)?;
        let verb = if append { "Add-Content" } else { "Set-Content" };
        // The elevated child copies the staged file, so only two validated
        // paths cross the PowerShell quoting boundary.
        let inner = format!(
            "{verb} -Path '{HOSTS_FILE_PATH}' -Encoding Ascii -Value (Get-Content -Raw '{}')",
            tmp.display()
        );
        let ps_cmd = format!(
            "Start-Process -Verb RunAs -Wait powershell -ArgumentList @('-NoProfile','-Command','{}')",
            inner.replace('\'', "''")
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_cmd])
            .status()
            .map_err(|e| format!("Failed to launch PowerShell: {e}"))?;
        let _ = fs::remove_file(&tmp);
        if !status.success() {
            return Err("Failed to modify hosts file: elevation declined or failed".to_string());
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

    elevate_hosts(&new_content, false)
}

pub fn get_sites() -> Vec<Site> {
    // A read path: recover from a poisoned lock rather than fail the listing.
    let _lock = SITES_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut sites = match read_sites_checked() {
        Ok(sites) => sites,
        Err(error) => {
            // Never scan-and-rewrite past a corrupt state file: that would
            // permanently drop aliases/multisite/web_root metadata.
            emit_notification(NotificationType::Error, error);
            return Vec::new();
        }
    };
    let webroot = get_webroot_from_settings();
    let mut discovered = false;

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
                    status: SiteStatus::Active,
                    aliases: None,
                    web_root: None,
                    multisite: None,
                });
                discovered = true;
            }
        }
    }

    // Persist only when the webroot scan found directories the state file
    // does not know about — otherwise every UI refresh rewrites sites.json
    // (extra IO and a wider race window against concurrent writers).
    if discovered {
        let _ = write_sites_unchecked(&sites);
    }
    sites
}

/// MariaDB database name for a site domain (`.` and `-` become `_`).
pub fn db_name_for(domain: &str) -> String {
    domain.replace(['.', '-'], "_")
}

/// `wp config create` argv for a fresh site (DB creds are the stack's
/// hardcoded MariaDB root account).
fn wp_config_create_argv(db_name: &str) -> Vec<String> {
    vec![
        "config".to_string(),
        "create".to_string(),
        format!("--dbname={db_name}"),
        format!("--dbuser={}", crate::backend::utils::DB_ROOT_USER),
        format!("--dbpass={}", crate::backend::utils::DB_ROOT_PASSWORD),
        format!("--dbhost={}", crate::backend::utils::DB_HOST),
    ]
}

/// Create the site's database via the mariadb container. Safe only because
/// `validate_site_name` restricts the charset of everything that flows into
/// `db_name` (alphanumerics plus `.`, `-`, `_`, and the `.`/`-` → `_` mapping
/// happens before this point).
fn create_database(db_name: &str) -> Result<(), String> {
    let sql = format!("CREATE DATABASE IF NOT EXISTS `{db_name}`");
    let user_arg = format!("-u{}", crate::backend::utils::DB_ROOT_USER);
    let pass_arg = format!("-p{}", crate::backend::utils::DB_ROOT_PASSWORD);
    let output = exec_in_container(
        crate::backend::utils::DB_HOST,
        &["mariadb", &user_arg, &pass_arg, "-e", &sql],
        &ExecOptions::default(),
    )?;
    if !output.success() {
        return Err(format!("Failed to create database: {}", output.stderr));
    }
    Ok(())
}

/// `wp core install` argv; empty config fields fall back to the same
/// defaults the previous renderer flow used.
fn wp_install_args(domain: &str, config: &WordPressInstallConfig) -> Vec<String> {
    let or_default = |value: &str, default: &str| {
        if value.is_empty() {
            default.to_string()
        } else {
            value.to_string()
        }
    };
    vec![
        "core".to_string(),
        "install".to_string(),
        format!("--url=https://{domain}"),
        format!("--title={}", or_default(&config.title, domain)),
        format!("--admin_user={}", or_default(&config.admin_user, "root")),
        format!(
            "--admin_password={}",
            or_default(&config.admin_password, "root")
        ),
        format!(
            "--admin_email={}",
            or_default(&config.admin_email, "root@example.com")
        ),
        "--skip-email".to_string(),
    ]
}

fn install_wordpress(
    domain: &str,
    web_root: Option<&str>,
    config: &WordPressInstallConfig,
) -> Result<(), String> {
    let work_dir = match web_root {
        Some(wr) => format!("{DOCKER_SITE_ROOT_PATH}/{domain}/{wr}"),
        None => format!("{DOCKER_SITE_ROOT_PATH}/{domain}"),
    };

    let db_name = db_name_for(domain);

    let run_wp = |phase: &str, args: &[String]| -> Result<(), String> {
        let mut argv = vec![
            "php".to_string(),
            "-d".to_string(),
            WP_CLI_ERROR_REPORTING.to_string(),
            "/usr/local/bin/wp".to_string(),
        ];
        argv.extend_from_slice(args);
        let argv_refs: Vec<&str> = argv.iter().map(String::as_str).collect();
        let output = exec_in_container(
            PHP_CONTAINER_NAME,
            &argv_refs,
            &ExecOptions {
                working_dir: Some(work_dir.clone()),
                env: Vec::new(),
            },
        )?;
        if output.success() {
            Ok(())
        } else {
            let detail = if !output.stderr.is_empty() {
                output.stderr
            } else {
                output.stdout
            };
            Err(format!("wp {phase} failed: {detail}"))
        }
    };

    emit_notification(
        NotificationType::Info,
        format!("[{domain}] Downloading WordPress..."),
    );
    run_wp(
        "core download",
        &["core".to_string(), "download".to_string()],
    )?;

    emit_notification(
        NotificationType::Info,
        format!("[{domain}] Creating wp-config.php..."),
    );
    run_wp("config create", &wp_config_create_argv(&db_name))?;

    emit_notification(
        NotificationType::Info,
        format!("[{domain}] Creating database..."),
    );
    create_database(&db_name)?;

    emit_notification(
        NotificationType::Info,
        format!("[{domain}] Running WordPress install..."),
    );
    run_wp("core install", &wp_install_args(domain, config))?;

    Ok(())
}

/// Regenerate the shared TLS certificate for `sites`. In the GUI this runs
/// on a worker thread (mkcert can be slow with many sites); in headless
/// (CLI) mode it must run inline so the process cannot exit mid-run.
fn run_cert_regen<F>(job: F)
where
    F: FnOnce() + Send + 'static,
{
    if crate::backend::utils::headless_mode() {
        job();
    } else {
        std::thread::spawn(job);
    }
}

pub fn create_site(site: SiteCreateRequest) -> Result<(), String> {
    // The domain, web root and aliases flow into filesystem paths, nginx
    // config and SQL — validate everything up front, never trust the UI.
    validate_site_name(&site.domain)?;
    if let Some(web_root) = &site.web_root {
        validate_site_webroot(web_root)?;
    }
    validate_site_aliases(site.aliases.as_deref())?;

    let webroot = ensure_webroot_exists()?;
    let site_root = webroot.join(&site.domain);
    fs::create_dir_all(&site_root).map_err(|e| format!("Failed to create site root: {e}"))?;

    if let Some(web_root) = &site.web_root {
        fs::create_dir_all(site_root.join(web_root))
            .map_err(|e| format!("Failed to create site webroot directory: {e}"))?;
    }

    let _lock = acquire_sites_lock()?;
    let mut sites = read_sites_checked()?;

    // Generate the vhost before committing to sites.json: a template failure
    // must not leave a registered site without an nginx config.
    generate_nginx_config(
        &site.domain,
        site.aliases.as_deref(),
        site.web_root.as_deref(),
        site.multisite.as_ref(),
    )?;

    update_or_insert_site(
        &mut sites,
        Site {
            name: site.domain.clone(),
            path: site_root.to_string_lossy().to_string(),
            url: format!("https://{}", site.domain),
            status: SiteStatus::Active,
            aliases: site.aliases.clone(),
            web_root: site.web_root.clone(),
            multisite: site.multisite.clone(),
        },
    );

    if let Err(error) = write_sites_unchecked(&sites) {
        // Roll the vhost back so state and config stay consistent.
        let _ = fs::remove_file(nginx_sites_enabled_path().join(format!("{}.conf", site.domain)));
        return Err(error);
    }
    drop(_lock);

    // Regenerate TLS certificate in background — this can be slow with many sites.
    // The callback runs on a worker thread, so it only touches SyncSignal state.
    let sites_for_cert = sites.clone();
    run_cert_regen(move || {
        if let Err(e) = regenerate_certificate(&sites_for_cert) {
            emit_notification(
                NotificationType::Warning,
                format!("Certificate regeneration failed: {e}"),
            );
        } else {
            emit_notification(
                NotificationType::Success,
                "TLS certificates regenerated for all sites",
            );
        }
    });

    nginx_reload();
    if let Err(e) = add_hosts_entry(&site.domain, site.aliases.as_deref()) {
        emit_notification(
            NotificationType::Warning,
            format!(
                "Site created but hosts entry not added: {e}\nSite is accessible via URL but domain won't resolve without a hosts entry."
            ),
        );
    }

    if let Some(wp_config) = &site.wordpress {
        install_wordpress(&site.domain, site.web_root.as_deref(), wp_config)?;
    }

    emit_notification(
        NotificationType::Success,
        format!("Site {} created", site.domain),
    );
    Ok(())
}

pub fn delete_site(site: Site) -> Result<(), String> {
    // Validate before any mutation — matches create_site/update_site ordering.
    validate_site_name(&site.name)?;

    let _lock = acquire_sites_lock()?;
    let mut sites = read_sites_checked()?;
    sites.retain(|existing| existing.name != site.name);
    write_sites_unchecked(&sites)?;
    drop(_lock);

    // Regenerate TLS certificate in background — worker thread, SyncSignal only.
    let sites_for_cert = sites.clone();
    run_cert_regen(move || {
        if let Err(e) = regenerate_certificate(&sites_for_cert) {
            emit_notification(
                NotificationType::Warning,
                format!("Certificate regeneration failed: {e}"),
            );
        }
    });

    let webroot = get_webroot_from_settings();
    let canonical_webroot = fs::canonicalize(&webroot).unwrap_or(webroot);
    let path = if site.path.trim().is_empty() {
        canonical_webroot.join(&site.name)
    } else {
        PathBuf::from(&site.path)
    };

    // Never delete outside the webroot — the stored path is trusted state,
    // but a migrated/edited sites.json must not be able to wipe arbitrary dirs.
    let canonical = fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
    if !canonical.starts_with(&canonical_webroot) {
        return Err(format!(
            "Refusing to delete '{}': outside the webroot '{}'",
            path.display(),
            canonical_webroot.display()
        ));
    }

    if path.exists() {
        fs::remove_dir_all(path).map_err(|e| format!("Failed to remove site directory: {e}"))?;
    }

    let conf_path = nginx_sites_enabled_path().join(format!("{}.conf", site.name));
    if conf_path.exists() {
        let _ = fs::remove_file(conf_path);
    }

    nginx_reload();
    let _ = remove_hosts_entry(&site.name, site.aliases.as_deref());

    emit_notification(
        NotificationType::Success,
        format!("Site {} deleted", site.name),
    );
    Ok(())
}

/// Interpret an `SiteUpdateRequest` field: `None` keeps the existing value,
/// `Some("")` (or whitespace) clears it, `Some(value)` sets it.
fn updated_field(new: Option<String>, existing: Option<String>) -> Option<String> {
    match new {
        None => existing,
        Some(s) if s.trim().is_empty() => None,
        Some(s) => Some(s),
    }
}

pub fn update_site(site: Site, data: SiteUpdateRequest) -> Result<(), String> {
    // Validate the incoming data before any side effect writes config/certs.
    validate_site_name(&site.name)?;
    if let Some(web_root) = &data.web_root {
        validate_site_webroot(web_root)?;
    }
    validate_site_aliases(data.aliases.as_deref())?;

    let _lock = acquire_sites_lock()?;
    let mut sites = read_sites_checked()?;

    let existing = sites
        .iter()
        .find(|s| s.name == site.name)
        .cloned()
        .unwrap_or(site);

    let old_aliases = existing.aliases.clone();

    let updated = Site {
        aliases: updated_field(data.aliases, existing.aliases.clone()),
        web_root: updated_field(data.web_root, existing.web_root.clone()),
        ..existing.clone()
    };

    update_or_insert_site(&mut sites, updated.clone());
    write_sites_unchecked(&sites)?;
    drop(_lock);

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

    emit_notification(NotificationType::Success, "Site updated");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_site_name_accepts_valid_names() {
        assert!(validate_site_name("example.test").is_ok());
        assert!(validate_site_name("my-site_2.test").is_ok());
        assert!(validate_site_name("example-com").is_ok());
    }

    #[test]
    fn validate_site_name_rejects_invalid_names() {
        assert!(validate_site_name("").is_err());
        assert!(validate_site_name("bad name.test").is_err());
        assert!(validate_site_name("bad/name").is_err());
        assert!(validate_site_name("bad:name").is_err());
        assert!(validate_site_name("..").is_err());
        assert!(validate_site_name("a..b").is_err());
        assert!(validate_site_name(".hidden").is_err());
        assert!(validate_site_name("example..test").is_err());
    }

    #[test]
    fn validate_site_aliases_rejects_bad_tokens() {
        assert!(validate_site_aliases(Some("alias1.test alias2.test")).is_ok());
        assert!(validate_site_aliases(Some("bad/alias")).is_err());
        assert!(
            validate_site_aliases(Some("bad\nalias")).is_ok(),
            "newline splits into tokens"
        );
        assert!(validate_site_aliases(Some("..")).is_err());
        assert!(validate_site_aliases(None).is_ok());
    }

    #[test]
    fn validate_site_webroot_rejects_traversal() {
        assert!(validate_site_webroot("public").is_ok());
        assert!(validate_site_webroot("a/b").is_err());
        assert!(validate_site_webroot("..").is_err());
        assert!(validate_site_webroot("a\nb").is_err());
    }

    #[test]
    fn format_domain_appends_tld() {
        assert_eq!(format_domain("example"), "example.test");
        assert_eq!(format_domain("example.test"), "example.test");
        assert_eq!(format_domain("sub.example.com"), "sub.example.com");
    }

    #[test]
    fn db_name_for_maps_dots_and_dashes() {
        assert_eq!(db_name_for("example.test"), "example_test");
        assert_eq!(db_name_for("my-site.test"), "my_site_test");
        assert_eq!(db_name_for("plain"), "plain");
    }

    #[test]
    fn is_valid_email_matches_simple_emails() {
        assert!(is_valid_email("root@example.com"));
        assert!(is_valid_email("a.b+c@sub.example.co.uk"));
        assert!(!is_valid_email(""));
        assert!(!is_valid_email("no-at-sign"));
        assert!(!is_valid_email("no-domain@"));
        assert!(!is_valid_email("space at@example.com"));
    }

    #[test]
    fn update_or_insert_updates_existing() {
        let mut sites = vec![Site {
            name: "a.test".into(),
            path: "p".into(),
            url: "u".into(),
            status: SiteStatus::Active,
            aliases: None,
            web_root: None,
            multisite: None,
        }];
        update_or_insert_site(
            &mut sites,
            Site {
                name: "a.test".into(),
                path: "p2".into(),
                url: "u2".into(),
                status: SiteStatus::Active,
                aliases: None,
                web_root: None,
                multisite: None,
            },
        );
        assert_eq!(sites.len(), 1);
        assert_eq!(sites[0].path, "p2");
    }

    #[test]
    fn update_or_insert_appends_new() {
        let mut sites = Vec::new();
        update_or_insert_site(
            &mut sites,
            Site {
                name: "b.test".into(),
                path: "p".into(),
                url: "u".into(),
                status: SiteStatus::Active,
                aliases: None,
                web_root: None,
                multisite: None,
            },
        );
        assert_eq!(sites.len(), 1);
    }
}
