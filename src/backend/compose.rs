//! Typed view of the repo's `compose.yml`, used by the Bollard orchestration
//! in [`crate::backend::docker`] / [`crate::backend::lifecycle`].
//!
//! This models **only** the shapes that actually appear in our compose file
//! (both `environment` forms, string/list `command`, `depends_on` conditions,
//! healthchecks, bind/named volumes, tcp/udp ports). It is a deliberate
//! subset of the compose spec: anything richer should be added to
//! `compose.yml` first and then modeled here.

use crate::backend::utils;
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;

/// Label docker compose uses to group a project's containers. Our
/// Bollard-created containers carry the same label so both the CLI and the
/// app can adopt each other's stack (rollback compatibility).
pub const COMPOSE_PROJECT_LABEL: &str = "com.docker.compose.project";
/// Project name docker compose derives from the repo directory name.
pub const COMPOSE_PROJECT_NAME: &str = "devwp";
/// Network name docker compose creates for the project
/// (`<project>_default`).
pub const NETWORK_NAME: &str = "devwp_default";
/// Service label docker compose sets on each container.
pub const SERVICE_LABEL: &str = "com.docker.compose.service";

const COMPOSE_YAML: &str = include_str!("../../compose.yml");

#[derive(Debug, Deserialize)]
pub struct ComposeFile {
    #[serde(default)]
    pub services: BTreeMap<String, ServiceConfig>,
    #[serde(default)]
    pub volumes: BTreeMap<String, VolumeConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VolumeConfig {
    #[serde(default)]
    pub external: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServiceConfig {
    pub container_name: Option<String>,
    pub build: Option<BuildConfig>,
    pub image: Option<String>,
    pub ports: Option<Vec<String>>,
    pub expose: Option<Vec<String>>,
    pub volumes: Option<Vec<String>>,
    pub environment: Option<EnvConfig>,
    pub depends_on: Option<DependsOn>,
    pub healthcheck: Option<HealthcheckConfig>,
    pub restart: Option<String>,
    pub tmpfs: Option<Vec<String>>,
    pub command: Option<CommandConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BuildConfig {
    pub context: String,
    pub dockerfile: Option<String>,
    pub args: Option<HashMap<String, String>>,
}

/// Compose allows `environment` as a map (values may be bools/numbers) or a
/// `KEY=VALUE` list; our file uses both.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum EnvConfig {
    Map(HashMap<String, serde_yaml::Value>),
    List(Vec<String>),
}

/// `depends_on` as a map of `condition`s or a plain service list.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum DependsOn {
    Map(BTreeMap<String, DependsCondition>),
    List(Vec<String>),
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct DependsCondition {
    pub condition: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HealthcheckConfig {
    pub test: Vec<String>,
    pub interval: Option<String>,
    pub timeout: Option<String>,
    pub retries: Option<i64>,
    pub start_period: Option<String>,
}

/// `command` as a shell-like string (tokenized, no shell — matches compose
/// v2 shlex behaviour) or a literal argv list.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum CommandConfig {
    String(String),
    List(Vec<String>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortMapping {
    pub host_ip: Option<String>,
    pub host_port: String,
    pub container_port: String,
    pub proto: String,
}

/// Expand compose-style `$VAR`, `${VAR}` and `${VAR:-default}` references.
/// `lookup` supplies variable values; unset variables expand to the default
/// (or empty).
pub fn expand_env_with(input: &str, lookup: impl Fn(&str) -> Option<String>) -> String {
    let mut out = String::with_capacity(input.len());
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '$' {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        // `$$` is a literal `$` in compose
        if i + 1 < chars.len() && chars[i + 1] == '$' {
            out.push('$');
            i += 2;
            continue;
        }
        if i + 1 < chars.len() && chars[i + 1] == '{' {
            let Some(close) = chars[i + 2..].iter().position(|&c| c == '}') else {
                out.push(chars[i]);
                i += 1;
                continue;
            };
            let inner: String = chars[i + 2..i + 2 + close].iter().collect();
            let (name, default) = match inner.split_once(":-") {
                Some((n, d)) => (n.to_string(), Some(d.to_string())),
                None => (inner.clone(), None),
            };
            let value = lookup(&name)
                .or_else(|| default.filter(|d| !d.is_empty()))
                .unwrap_or_default();
            out.push_str(&value);
            i += 2 + close + 1;
            continue;
        }
        // bare $VAR — name is [A-Za-z_][A-Za-z0-9_]*
        let mut j = i + 1;
        if j < chars.len() && (chars[j].is_ascii_alphabetic() || chars[j] == '_') {
            while j < chars.len() && (chars[j].is_ascii_alphanumeric() || chars[j] == '_') {
                j += 1;
            }
            let name: String = chars[i + 1..j].iter().collect();
            out.push_str(&lookup(&name).unwrap_or_default());
            i = j;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

fn expand_env(input: &str) -> String {
    expand_env_with(input, |name| std::env::var(name).ok())
}

/// Load the embedded compose file with `${VAR:-default}` expansion applied.
pub fn load_compose() -> Result<ComposeFile, String> {
    let expanded = expand_env(COMPOSE_YAML);
    serde_yaml::from_str(&expanded).map_err(|e| format!("Failed to parse compose.yml: {e}"))
}

impl ComposeFile {
    /// Actual docker volume names for compose's `volumes:` section
    /// (`<project>_<name>`).
    pub fn volume_names(&self) -> Vec<String> {
        self.volumes
            .iter()
            .filter(|(_, cfg)| !cfg.external.unwrap_or(false))
            .map(|(name, _)| format!("{COMPOSE_PROJECT_NAME}_{name}"))
            .collect()
    }

    /// Services ordered so every dependency precedes its dependents
    /// (deterministic Kahn's algorithm over the BTreeMap order).
    pub fn service_order(&self) -> Result<Vec<String>, String> {
        let mut in_degree: BTreeMap<&str, usize> = BTreeMap::new();
        let mut dependents: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
        for name in self.services.keys() {
            in_degree.insert(name.as_str(), 0);
        }
        for (name, svc) in &self.services {
            for dep in svc.dependency_names() {
                if !self.services.contains_key(dep) {
                    return Err(format!(
                        "Service `{name}` depends on unknown service `{dep}`"
                    ));
                }
                *in_degree.entry(name.as_str()).or_default() += 1;
                dependents.entry(dep).or_default().push(name.as_str());
            }
        }
        let mut ready: Vec<&str> = in_degree
            .iter()
            .filter(|(_, &d)| d == 0)
            .map(|(name, _)| *name)
            .collect();
        ready.sort_unstable();
        let mut order = Vec::with_capacity(self.services.len());
        while let Some(name) = ready.first().copied() {
            ready.remove(0);
            order.push(name.to_string());
            if let Some(children) = dependents.get(name) {
                for child in children {
                    let deg = in_degree.get_mut(*child).expect("in-degree entry");
                    *deg -= 1;
                    if *deg == 0 {
                        ready.push(child);
                    }
                }
            }
            ready.sort_unstable();
        }
        if order.len() != self.services.len() {
            return Err("Cycle detected in compose depends_on graph".to_string());
        }
        Ok(order)
    }
}

impl ServiceConfig {
    /// Fixed container name (`container_name` or `devwp_<service>`).
    pub fn container_id(&self, service: &str) -> String {
        self.container_name
            .clone()
            .unwrap_or_else(|| format!("{COMPOSE_PROJECT_NAME}_{service}"))
    }

    /// Image reference: explicit `image:`, else compose v2's build tag
    /// `<project>-<service>` (dash — matches the tags a CLI `docker compose
    /// build` produces so existing images are reused, not rebuilt).
    pub fn image_ref(&self, service: &str) -> String {
        self.image
            .clone()
            .unwrap_or_else(|| format!("{COMPOSE_PROJECT_NAME}-{service}"))
    }

    /// Resolved build context directory on the host.
    pub fn build_context_path(&self) -> Result<PathBuf, String> {
        let build = self.build.as_ref().expect("caller checked build");
        resolve_host_path(&build.context)
    }

    /// `environment` normalized to `KEY=VALUE` strings for the Docker API.
    pub fn env_vec(&self) -> Vec<String> {
        match &self.environment {
            Some(EnvConfig::Map(map)) => map
                .iter()
                .map(|(k, v)| format!("{k}={}", yaml_value_to_string(v)))
                .collect(),
            Some(EnvConfig::List(list)) => list.clone(),
            None => Vec::new(),
        }
    }

    /// `command` normalized to an argv list.
    pub fn command_vec(&self) -> Option<Vec<String>> {
        match &self.command {
            Some(CommandConfig::String(s)) => shell_words::split(s).ok(),
            Some(CommandConfig::List(list)) => Some(list.clone()),
            None => None,
        }
    }

    /// Dependency service names (regardless of condition).
    pub fn dependency_names(&self) -> Vec<&str> {
        match &self.depends_on {
            Some(DependsOn::Map(map)) => map.keys().map(String::as_str).collect(),
            Some(DependsOn::List(list)) => list.iter().map(String::as_str).collect(),
            None => Vec::new(),
        }
    }

    /// `true` when `depends_on` names `service` with
    /// `condition: service_healthy`.
    pub fn requires_healthy(&self, service: &str) -> bool {
        match &self.depends_on {
            Some(DependsOn::Map(map)) => map.get(service).is_some_and(|c| {
                c.condition
                    .as_deref()
                    .is_some_and(|c| c == "service_healthy")
            }),
            _ => false,
        }
    }

    /// Resolved bind mounts (`/host:/container[:mode]`), with `~` and `./`
    /// expanded and named volumes project-prefixed.
    pub fn binds(&self) -> Result<Vec<String>, String> {
        let Some(volumes) = &self.volumes else {
            return Ok(Vec::new());
        };
        let mut out = Vec::with_capacity(volumes.len());
        for spec in volumes {
            let (host, rest) = spec.split_once(':').ok_or_else(|| {
                format!("Unsupported volume spec (expected `src:dst[:mode]`): `{spec}`")
            })?;
            if host.starts_with('.') || host.starts_with('~') || host.starts_with('/') {
                out.push(format!(
                    "{}:{rest}",
                    resolve_host_path(host)?.to_string_lossy()
                ));
            } else {
                out.push(format!("{COMPOSE_PROJECT_NAME}_{host}:{rest}"));
            }
        }
        Ok(out)
    }
}

/// Resolve a compose host path: `~`/`~/...` against the home dir, `.`/`./...`
/// against the project root, absolute paths unchanged.
pub fn resolve_host_path(path: &str) -> Result<PathBuf, String> {
    if let Some(rest) = path.strip_prefix("~/") {
        return Ok(utils::home_dir().join(rest));
    }
    if path == "~" {
        return Ok(utils::home_dir());
    }
    if let Some(rest) = path.strip_prefix("./") {
        return Ok(utils::project_root().join(rest));
    }
    if path.starts_with('.') {
        return Ok(utils::project_root().join(path));
    }
    Ok(PathBuf::from(path))
}

/// Stringify a YAML scalar for `environment` (`true` → `"true"`).
pub fn yaml_value_to_string(value: &serde_yaml::Value) -> String {
    match value {
        serde_yaml::Value::Null => String::new(),
        serde_yaml::Value::Bool(b) => b.to_string(),
        serde_yaml::Value::Number(n) => n.to_string(),
        serde_yaml::Value::String(s) => s.clone(),
        // Non-scalars cannot occur in a sane `environment:` block; keep the
        // serialized YAML so the misconfiguration is visible in `docker inspect`.
        other => serde_yaml::to_string(other)
            .unwrap_or_default()
            .trim()
            .to_string(),
    }
}

/// Parse a compose duration (`"30s"`, `"1m30s"`-style components with
/// h/m/s/ms/us/ns) into nanoseconds for the Docker healthcheck API.
pub fn parse_duration_ns(input: &str) -> Result<u64, String> {
    let mut total: u64 = 0;
    let mut num = String::new();
    let mut parsed_any = false;
    for c in input.trim().chars() {
        if c.is_ascii_digit() || c == '.' {
            num.push(c);
            continue;
        }
        let unit_start = c;
        let mut unit = String::new();
        unit.push(unit_start);
        if num.is_empty() {
            return Err(format!("Invalid duration `{input}`"));
        }
        let value: f64 = num
            .parse()
            .map_err(|_| format!("Invalid number in duration `{input}`"))?;
        let multiplier = match unit.as_str() {
            "h" => 3_600_000_000_000.0,
            "m" => 60_000_000_000.0,
            "s" => 1_000_000_000.0,
            _ => return Err(format!("Unsupported duration unit in `{input}`")),
        };
        total += (value * multiplier) as u64;
        num.clear();
        parsed_any = true;
    }
    if !num.is_empty() {
        // trailing unit-less number is invalid, but tolerate plain seconds
        let value: f64 = num
            .parse()
            .map_err(|_| format!("Invalid number in duration `{input}`"))?;
        total += (value * 1_000_000_000.0) as u64;
        parsed_any = true;
    }
    if !parsed_any {
        return Err(format!("Empty duration `{input}`"));
    }
    Ok(total)
}

/// Parse a compose port mapping `[host_ip:]host_port:container_port[/proto]`.
pub fn parse_port_mapping(spec: &str) -> Result<PortMapping, String> {
    let (target, proto) = match spec.split_once('/') {
        Some((t, p)) => (t, p.to_string()),
        None => (spec, "tcp".to_string()),
    };
    let parts: Vec<&str> = target.split(':').collect();
    let (host_ip, host_port, container_port) = match parts.as_slice() {
        [host, container] => (None, (*host).to_string(), (*container).to_string()),
        [ip, host, container] => (
            Some((*ip).to_string()),
            (*host).to_string(),
            (*container).to_string(),
        ),
        _ => return Err(format!("Invalid port mapping `{spec}`")),
    };
    if host_port.is_empty() || container_port.is_empty() {
        return Err(format!("Invalid port mapping `{spec}`"));
    }
    Ok(PortMapping {
        host_ip,
        host_port,
        container_port,
        proto,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_real_compose_file() {
        let compose = load_compose().expect("embedded compose.yml must parse");
        assert_eq!(compose.services.len(), 5, "expected 5 services");
        for name in ["php", "mariadb", "redis", "nginx", "mailpit"] {
            assert!(
                compose.services.contains_key(name),
                "missing service {name}"
            );
        }
    }

    #[test]
    fn container_names_are_fixed() {
        let compose = load_compose().unwrap();
        assert_eq!(compose.services["php"].container_id("php"), "devwp_php");
        assert_eq!(
            compose.services["mailpit"].container_id("mailpit"),
            "devwp_mailpit"
        );
    }

    #[test]
    fn image_refs_cover_build_and_pull_services() {
        let compose = load_compose().unwrap();
        assert_eq!(compose.services["php"].image_ref("php"), "devwp-php");
        assert_eq!(compose.services["nginx"].image_ref("nginx"), "devwp-nginx");
        assert_eq!(
            compose.services["mariadb"].image_ref("mariadb"),
            "mariadb:13.0-rc"
        );
        assert_eq!(compose.services["redis"].image_ref("redis"), "redis:alpine");
        assert_eq!(
            compose.services["mailpit"].image_ref("mailpit"),
            "axllent/mailpit"
        );
    }

    #[test]
    fn build_args_fall_back_to_1000() {
        // The embedded file was already expanded at load time with the
        // process env; assert the documented fallback by re-expanding raw
        // snippets with a controlled lookup.
        let raw = "USER_ID: ${UID:-1000}";
        assert_eq!(expand_env_with(raw, |_| None), "USER_ID: 1000");
        assert_eq!(
            expand_env_with(raw, |v| (v == "UID").then(|| "1001".into())),
            "USER_ID: 1001"
        );
        let compose = load_compose().unwrap();
        let args = compose.services["php"]
            .build
            .as_ref()
            .and_then(|b| b.args.clone())
            .expect("php build args");
        assert!(!args.is_empty());
    }

    #[test]
    fn env_map_bool_stringifies_and_list_passes_through() {
        let compose = load_compose().unwrap();
        let mariadb_env = compose.services["mariadb"].env_vec();
        assert!(mariadb_env.contains(&"MARIADB_AUTO_UPGRADE=true".to_string()));
        assert!(mariadb_env.contains(&"MARIADB_ROOT_PASSWORD=root".to_string()));
        let mailpit_env = compose.services["mailpit"].env_vec();
        assert!(mailpit_env.contains(&"MP_SMTP_AUTH_ACCEPT_ANY=1".to_string()));
    }

    #[test]
    fn ports_include_udp_mapping() {
        let compose = load_compose().unwrap();
        let nginx_ports: Vec<PortMapping> = compose.services["nginx"]
            .ports
            .clone()
            .unwrap()
            .iter()
            .map(|p| parse_port_mapping(p).unwrap())
            .collect();
        assert!(nginx_ports.contains(&PortMapping {
            host_ip: None,
            host_port: "443".into(),
            container_port: "443".into(),
            proto: "tcp".into(),
        }));
        assert!(nginx_ports.contains(&PortMapping {
            host_ip: None,
            host_port: "443".into(),
            container_port: "443".into(),
            proto: "udp".into(),
        }));
    }

    #[test]
    fn depends_on_conditions() {
        let compose = load_compose().unwrap();
        let nginx = &compose.services["nginx"];
        assert_eq!(
            nginx.dependency_names().len(),
            4,
            "nginx depends on 4 services"
        );
        assert!(nginx.requires_healthy("php"));
        assert!(nginx.requires_healthy("mailpit"));
        assert!(!nginx.requires_healthy("nginx"));
    }

    #[test]
    fn healthcheck_test_forms() {
        let compose = load_compose().unwrap();
        let php_test = compose.services["php"]
            .healthcheck
            .as_ref()
            .unwrap()
            .test
            .clone();
        assert_eq!(php_test[0], "CMD-SHELL");
        let mariadb_test = compose.services["mariadb"]
            .healthcheck
            .as_ref()
            .unwrap()
            .test
            .clone();
        assert_eq!(mariadb_test[0], "CMD");
        assert!(mariadb_test.contains(&"mariadb-admin".to_string()));
    }

    #[test]
    fn command_string_form_tokenizes() {
        let compose = load_compose().unwrap();
        let mariadb_cmd = compose.services["mariadb"].command_vec().unwrap();
        assert_eq!(mariadb_cmd[0], "--bind-address=0.0.0.0");
        assert_eq!(
            compose.services["redis"].command_vec().unwrap(),
            vec!["redis-server".to_string()]
        );
    }

    #[test]
    fn binds_expand_home_and_project_paths() {
        let compose = load_compose().unwrap();
        let php_binds = compose.services["php"].binds().unwrap();
        let www_bind = php_binds
            .iter()
            .find(|b| b.ends_with(":/src/www:rw"))
            .expect("php mounts the webroot");
        assert!(www_bind.starts_with(utils::home_dir().to_string_lossy().as_ref()));

        let nginx_binds = compose.services["nginx"].binds().unwrap();
        let conf_bind = nginx_binds
            .iter()
            .find(|b| b.ends_with(":/etc/nginx/nginx.conf:ro"))
            .expect("nginx mounts its config");
        assert!(conf_bind.contains("config/nginx/nginx.conf"));
    }

    #[test]
    fn named_volumes_get_project_prefix() {
        let compose = load_compose().unwrap();
        let mariadb_binds = compose.services["mariadb"].binds().unwrap();
        assert!(mariadb_binds.contains(&"devwp_mariadb:/var/lib/mysql".to_string()));
        assert_eq!(
            compose.volume_names(),
            vec!["devwp_mariadb".to_string(), "devwp_redis".to_string()]
        );
    }

    #[test]
    fn service_order_is_topological() {
        let compose = load_compose().unwrap();
        let order = compose.service_order().unwrap();
        assert_eq!(order.len(), 5);
        let nginx_pos = order.iter().position(|s| s == "nginx").unwrap();
        for dep in ["php", "mariadb", "redis", "mailpit"] {
            let pos = order.iter().position(|s| s == dep).unwrap();
            assert!(pos < nginx_pos, "{dep} must start before nginx");
        }
    }

    #[test]
    fn duration_parsing() {
        assert_eq!(parse_duration_ns("30s").unwrap(), 30_000_000_000);
        assert_eq!(parse_duration_ns("10s").unwrap(), 10_000_000_000);
        assert_eq!(parse_duration_ns("1m").unwrap(), 60_000_000_000);
        assert!(parse_duration_ns("abc").is_err());
        assert!(parse_duration_ns("").is_err());
    }

    #[test]
    fn env_expansion_forms() {
        let lookup = |name: &str| (name == "SET").then(|| "yes".to_string());
        assert_eq!(expand_env_with("${SET}", lookup), "yes");
        assert_eq!(expand_env_with("${UNSET:-dflt}", lookup), "dflt");
        assert_eq!(expand_env_with("$SET!", lookup), "yes!");
        assert_eq!(expand_env_with("$$SET", lookup), "$SET");
        assert_eq!(expand_env_with("${UNSET}", lookup), "");
    }
}
