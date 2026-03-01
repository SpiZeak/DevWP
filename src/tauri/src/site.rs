use crate::settings::{ensure_webroot_exists, get_webroot_from_settings};
use crate::utils::{emit_notification, ensure_state_root, OperationResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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
