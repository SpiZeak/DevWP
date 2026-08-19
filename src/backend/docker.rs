//! Docker integration via the Bollard SDK (Docker Engine API over the local
//! socket/named pipe). No `docker` CLI is spawned anywhere.
//!
//! All public functions are synchronous: every call runs its async Bollard
//! work on a dedicated single-threaded tokio runtime ([`docker_block_on`]),
//! which is safe to call from `spawn_blocking` bodies and plain sync code.
//!
//! Resource naming follows docker compose conventions (`devwp` project) so a
//! CLI-provisioned stack and an app-provisioned stack are interchangeable in
//! both directions (rollback compatibility).

use crate::backend::compose::{
    self, ServiceConfig, COMPOSE_PROJECT_LABEL, COMPOSE_PROJECT_NAME, NETWORK_NAME, SERVICE_LABEL,
};
use crate::backend::utils::headless_mode;
use crate::state;
use bollard::container::LogOutput;
use bollard::exec::{CreateExecOptions, StartExecResults};
use bollard::query_parameters::{
    BuildImageOptionsBuilder, CreateContainerOptionsBuilder, CreateImageOptionsBuilder,
    ListContainersOptionsBuilder, ListVolumesOptionsBuilder, RemoveContainerOptionsBuilder,
    StopContainerOptionsBuilder,
};
use bollard::Docker;
use bytes::Bytes;
use futures_util::StreamExt;
use http_body_util::{Either, Full};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::{Duration, Instant};

const STATUS_TIMEOUT: Duration = Duration::from_secs(30);
const EXEC_TIMEOUT: Duration = Duration::from_secs(900);
const BUILD_TIMEOUT: Duration = Duration::from_secs(1800);
/// php has `start_period: 40s`, so 30s would misfire; 90s matches compose's
/// practical dependency wait.
pub(crate) const DEPENDENCY_HEALTH_TIMEOUT: Duration = Duration::from_secs(90);
pub(crate) const DEPENDENCY_RUNNING_TIMEOUT: Duration = Duration::from_secs(30);
const STOP_TIMEOUT_SECS: i32 = 10;

/// Client for long orchestration work (builds/pulls can take minutes).
pub(crate) fn stack_client() -> Result<Docker, String> {
    docker_client(BUILD_TIMEOUT)
}

/// Fail fast with an actionable message when the daemon is down.
pub(crate) async fn require_daemon(docker: &Docker) -> Result<(), String> {
    docker
        .ping()
        .await
        .map(|_| ())
        .map_err(|e| describe_daemon_error(&e))
}

/// Matches compose's `x-logging` anchor (json-file, 10 MB × 3 files).
const LOG_DRIVER: &str = "json-file";

// ── Client & runtime plumbing ─────────────────────────────────

pub(crate) fn docker_client(timeout: Duration) -> Result<Docker, String> {
    Docker::connect_with_local_defaults()
        .map(|docker| docker.with_timeout(timeout))
        .map_err(|e| format!("Failed to create Docker client: {e}"))
}

/// Run a Bollard operation to completion on a dedicated current-thread
/// runtime. Callers run inside `spawn_blocking` (or plain threads), so a
/// private runtime per call avoids depending on the UI runtime's drivers.
pub(crate) fn docker_block_on<F: std::future::Future>(future: F) -> Result<F::Output, String> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("Failed to create Docker runtime: {e}"))
        .map(|rt| rt.block_on(future))
}

fn is_not_found(err: &bollard::errors::Error) -> bool {
    matches!(
        err,
        bollard::errors::Error::DockerResponseServerError {
            status_code: 404,
            ..
        }
    )
}

fn is_conflict(err: &bollard::errors::Error) -> bool {
    matches!(
        err,
        bollard::errors::Error::DockerResponseServerError {
            status_code: 409,
            ..
        }
    )
}

/// Connection-level failures are common (Docker Desktop not started) and the
/// raw error text is cryptic; rewrite them into an actionable message.
fn describe_daemon_error(err: &bollard::errors::Error) -> String {
    let text = err.to_string();
    if text.contains("docker.sock")
        || text.contains("docker_engine")
        || text.contains("Connection refused")
        || text.contains("No such file or directory")
    {
        return "Docker daemon not reachable (is Docker running?)".to_string();
    }
    text
}

/// Probe the daemon via the Engine API (no `docker` CLI). Returns the
/// formatted connection error so CLI diagnostics can surface why.
pub fn daemon_reachable() -> Result<(), String> {
    docker_block_on(async {
        let docker = docker_client(STATUS_TIMEOUT)?;
        docker
            .ping()
            .await
            .map(|_| ())
            .map_err(|e| describe_daemon_error(&e))
    })?
}

/// Probe the daemon without going through the CLI (test skip-probe and
/// startup diagnostics).
pub fn docker_daemon_available() -> bool {
    daemon_reachable().is_ok()
}

// ── UI-facing types (unchanged shapes) ────────────────────────

/// Typed container state. Docker may report arbitrary strings, so an
/// `Other` variant catches anything not in the known set.
#[derive(Debug, Clone, PartialEq)]
pub enum ContainerState {
    Running,
    Exited,
    Stopped,
    Pending,
    Building,
    Other(String),
}

impl ContainerState {
    pub fn from_docker(s: &str) -> Self {
        match s {
            "running" => Self::Running,
            "exited" => Self::Exited,
            "stopped" => Self::Stopped,
            "pending" => Self::Pending,
            "building" => Self::Building,
            other => Self::Other(other.to_string()),
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            Self::Running => "running",
            Self::Exited => "exited",
            Self::Stopped => "stopped",
            Self::Pending => "pending",
            Self::Building => "building",
            Self::Other(s) => s,
        }
    }
}

impl std::fmt::Display for ContainerState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl Serialize for ContainerState {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for ContainerState {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        Ok(Self::from_docker(&s))
    }
}

/// Typed docker lifecycle status reported to the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DockerStatus {
    Idle,
    Starting,
    Complete,
    Error,
    Stopping,
    Stopped,
    #[serde(other)]
    Unknown,
}

impl std::fmt::Display for DockerStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Idle => "idle",
            Self::Starting => "starting",
            Self::Complete => "complete",
            Self::Error => "error",
            Self::Stopping => "stopping",
            Self::Stopped => "stopped",
            Self::Unknown => "unknown",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Container {
    pub id: String,
    pub name: String,
    pub state: ContainerState,
    pub health: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DockerStatusPayload {
    pub status: DockerStatus,
    pub message: String,
}

// ── Exec (replaces `docker exec`) ─────────────────────────────

/// Extra settings for [`exec_in_container`].
#[derive(Debug, Clone, Default)]
pub struct ExecOptions {
    pub working_dir: Option<String>,
    /// `KEY=VALUE` entries passed to the exec's environment. Values travel
    /// over the Docker API socket, never through a child process's argv.
    pub env: Vec<String>,
}

/// Result of a container exec — the API equivalent of
/// `std::process::Output`.
#[derive(Debug, Clone, Default)]
pub struct ExecOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i64,
}

impl ExecOutput {
    pub fn success(&self) -> bool {
        self.exit_code == 0
    }
}

/// Run a command inside a container (`docker exec`), capturing demuxed
/// stdout/stderr and the exit code.
pub fn exec_in_container(
    container: &str,
    cmd: &[&str],
    opts: &ExecOptions,
) -> Result<ExecOutput, String> {
    docker_block_on(async {
        let docker = docker_client(EXEC_TIMEOUT)?;
        exec_in_container_async(&docker, container, cmd, opts).await
    })?
}

pub(crate) async fn exec_in_container_async(
    docker: &Docker,
    container: &str,
    cmd: &[&str],
    opts: &ExecOptions,
) -> Result<ExecOutput, String> {
    let exec = docker
        .create_exec(
            container,
            CreateExecOptions::<String> {
                cmd: Some(cmd.iter().map(|s| (*s).to_string()).collect()),
                attach_stdout: Some(true),
                attach_stderr: Some(true),
                working_dir: opts.working_dir.clone(),
                env: (!opts.env.is_empty()).then(|| opts.env.clone()),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| format!("exec in `{container}`: {}", describe_daemon_error(&e)))?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    match docker
        .start_exec(&exec.id, None)
        .await
        .map_err(|e| format!("start exec in `{container}`: {e}"))?
    {
        StartExecResults::Attached { mut output, .. } => {
            while let Some(chunk) = output.next().await {
                match chunk.map_err(|e| format!("exec stream in `{container}`: {e}"))? {
                    LogOutput::StdOut { message } => {
                        stdout.push_str(&String::from_utf8_lossy(&message));
                    }
                    LogOutput::StdErr { message } => {
                        stderr.push_str(&String::from_utf8_lossy(&message));
                    }
                    LogOutput::Console { message } => {
                        stdout.push_str(&String::from_utf8_lossy(&message));
                    }
                    LogOutput::StdIn { .. } => {}
                }
            }
        }
        StartExecResults::Detached => {}
    }

    let exit_code = wait_for_exit_code(docker, &exec.id, container).await?;
    Ok(ExecOutput {
        stdout,
        stderr,
        exit_code,
    })
}

/// The daemon can take a moment to publish the exit code after the output
/// stream ends; poll briefly instead of racing.
async fn wait_for_exit_code(
    docker: &Docker,
    exec_id: &str,
    container: &str,
) -> Result<i64, String> {
    for _ in 0..10 {
        let inspect = docker
            .inspect_exec(exec_id)
            .await
            .map_err(|e| format!("inspect exec in `{container}`: {e}"))?;
        if !inspect.running.unwrap_or(false) {
            if let Some(code) = inspect.exit_code.filter(|c| *c != 0) {
                return Ok(code);
            }
            if inspect.exit_code.is_some() {
                return Ok(0);
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Err(format!(
        "exec in `{container}` finished without reporting an exit code"
    ))
}

// ── Container listing (replaces `docker compose ps -a`) ───────

/// List the project's containers with health (via inspect — the list API
/// does not expose health) and cached version probes.
pub fn get_container_status() -> Result<Vec<Container>, String> {
    let mut containers = docker_block_on(async {
        let docker = docker_client(STATUS_TIMEOUT)?;
        let mut filters: HashMap<String, Vec<String>> = HashMap::new();
        filters.insert(
            "label".to_string(),
            vec![format!("{COMPOSE_PROJECT_LABEL}={COMPOSE_PROJECT_NAME}")],
        );
        let options = ListContainersOptionsBuilder::new()
            .all(true)
            .filters(&filters)
            .build();
        let summaries = docker
            .list_containers(Some(options))
            .await
            .map_err(|e| describe_daemon_error(&e))?;

        let mut containers = Vec::with_capacity(summaries.len());
        for summary in summaries {
            let name = summary
                .names
                .as_ref()
                .and_then(|names| names.first())
                .map(|n| n.trim_start_matches('/').to_string())
                .unwrap_or_default();
            let state = ContainerState::from_docker(
                &summary
                    .state
                    .map(|s| s.to_string())
                    .unwrap_or_default()
                    .to_lowercase(),
            );
            // Health only matters while running (matches `compose ps`, which
            // leaves the column blank for stopped containers).
            let health = if state == ContainerState::Running && !name.is_empty() {
                docker
                    .inspect_container(&name, None)
                    .await
                    .ok()
                    .and_then(|inspect| inspect.state.and_then(|s| s.health))
                    .and_then(|health| health.status.map(health_status_to_string))
                    .flatten()
            } else {
                None
            };
            containers.push(Container {
                id: summary.id.unwrap_or_else(|| name.clone()),
                name,
                state,
                health,
                version: None,
            });
        }
        Ok::<Vec<Container>, String>(containers)
    })??;

    // Version probing execs inside each running container for the UI's poll
    // loop. Skip it in headless (CLI) mode — the one-shot process never
    // benefits from the cache.
    if !headless_mode() {
        let mut cache = VERSION_CACHE
            .lock()
            .map_err(|e| format!("Version cache poisoned: {e}"))?;
        for container in &mut containers {
            if container.state == ContainerState::Running {
                if let Some(version) = cache.get(&container.id) {
                    container.version = version.clone();
                } else {
                    let version = docker_block_on(async {
                        let docker = docker_client(EXEC_TIMEOUT).ok()?;
                        get_container_version_async(&docker, &container.name).await
                    })
                    .ok()
                    .flatten();
                    cache.insert(container.id.clone(), version.clone());
                    container.version = version;
                }
            }
        }
    }

    state::set_containers(containers.clone());
    Ok(containers)
}

fn health_status_to_string(status: bollard::models::HealthStatusEnum) -> Option<String> {
    match status {
        bollard::models::HealthStatusEnum::HEALTHY => Some("healthy".to_string()),
        bollard::models::HealthStatusEnum::STARTING => Some("starting".to_string()),
        bollard::models::HealthStatusEnum::UNHEALTHY => Some("unhealthy".to_string()),
        bollard::models::HealthStatusEnum::NONE | bollard::models::HealthStatusEnum::EMPTY => None,
    }
}

// ── Version probes (replaces `docker exec` probes) ────────────

struct VersionProbe {
    cmd: &'static str,
    args: &'static [&'static str],
    use_stderr: bool,
    /// php and mailpit may exit non-zero yet still emit a usable version line.
    ignore_failure: bool,
    parse: fn(&str) -> Option<String>,
}

fn parse_php_version(output: &str) -> Option<String> {
    output
        .lines()
        .find(|line| {
            line.starts_with("PHP ") && line.chars().nth(4).is_some_and(|c| c.is_ascii_digit())
        })
        .unwrap_or("")
        .split_whitespace()
        .nth(1)
        .map(|v| format!("v{}", v))
}

fn parse_nginx_version(output: &str) -> Option<String> {
    output
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .split('/')
        .nth(1)
        .map(|v| format!("v{}", v.trim()))
}

fn parse_mariadb_version(output: &str) -> Option<String> {
    output
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .split("from ")
        .nth(1)
        .and_then(|s| s.split('-').next())
        .map(|v| format!("v{}", v.trim()))
}

fn parse_redis_version(output: &str) -> Option<String> {
    output
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .split("v=")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .map(|v| format!("v{}", v))
}

fn parse_mailpit_version(output: &str) -> Option<String> {
    output
        .lines()
        .find(|line| line.contains("mailpit") && line.contains(" v"))
        .unwrap_or("")
        .split(" v")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .map(|v| format!("v{}", v))
}

fn version_probe(name: &str) -> Option<VersionProbe> {
    let probe = match name {
        "devwp_php" => VersionProbe {
            cmd: "php",
            args: &["--version"],
            use_stderr: false,
            ignore_failure: true,
            parse: parse_php_version,
        },
        "devwp_nginx" => VersionProbe {
            cmd: "nginx",
            args: &["-v"],
            use_stderr: true,
            ignore_failure: false,
            parse: parse_nginx_version,
        },
        "devwp_mariadb" => VersionProbe {
            cmd: "mariadb",
            args: &["--version"],
            use_stderr: false,
            ignore_failure: false,
            parse: parse_mariadb_version,
        },
        "devwp_redis" => VersionProbe {
            cmd: "redis-server",
            args: &["--version"],
            use_stderr: false,
            ignore_failure: false,
            parse: parse_redis_version,
        },
        "devwp_mailpit" => VersionProbe {
            cmd: "/mailpit",
            args: &["version"],
            use_stderr: false,
            ignore_failure: true,
            parse: parse_mailpit_version,
        },
        _ => return None,
    };
    Some(probe)
}

async fn get_container_version_async(docker: &Docker, name: &str) -> Option<String> {
    let probe = version_probe(name)?;
    let mut cmd = vec![probe.cmd];
    cmd.extend(probe.args);
    let output = exec_in_container_async(docker, name, &cmd, &ExecOptions::default())
        .await
        .ok()?;

    if !output.success() && !probe.ignore_failure {
        return None;
    }

    let output_str = if probe.use_stderr {
        output.stderr
    } else {
        output.stdout
    };

    (probe.parse)(&output_str)
}

// Version probing execs inside each container; cache results by container id
// so the 1s status polls don't re-exec five binaries every tick.
static VERSION_CACHE: std::sync::LazyLock<std::sync::Mutex<HashMap<String, Option<String>>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

// ── Single-container lifecycle ────────────────────────────────

/// Restart a container (`docker restart`) and refresh the cached list.
pub async fn restart_container(container_id: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        docker_block_on(async {
            let docker = docker_client(EXEC_TIMEOUT)?;
            docker
                .restart_container(&container_id, None)
                .await
                .map_err(|e| format!("restart `{container_id}`: {}", describe_daemon_error(&e)))
        })??;
        if !headless_mode() {
            let _ = get_container_status();
        }
        Ok(true)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

// ── Orchestration primitives (used by lifecycle) ──────────────

fn project_label_filter() -> HashMap<String, Vec<String>> {
    HashMap::from([(
        "label".to_string(),
        vec![format!("{COMPOSE_PROJECT_LABEL}={COMPOSE_PROJECT_NAME}")],
    )])
}

/// Compose-compatible labels. Beyond project/service, compose v5's container
/// discovery (ps/down/up) requires the full set — a project+service-only
/// container is invisible to the CLI and `up` then fails on the fixed
/// container name. The config-hash is a placeholder (compose's real hash is
/// implementation-defined), so a CLI `up` after an app start recreates the
/// container once and takes ownership — the supported rollback path.
fn project_labels(service: Option<&str>, depends_on: &[&str]) -> HashMap<String, String> {
    let mut labels = HashMap::new();
    labels.insert(
        COMPOSE_PROJECT_LABEL.to_string(),
        COMPOSE_PROJECT_NAME.to_string(),
    );
    if let Some(service) = service {
        labels.insert(SERVICE_LABEL.to_string(), service.to_string());
        labels.insert(
            "com.docker.compose.container-number".to_string(),
            "1".to_string(),
        );
        labels.insert("com.docker.compose.oneoff".to_string(), "False".to_string());
        labels.insert(
            "com.docker.compose.config-hash".to_string(),
            format!("{COMPOSE_PROJECT_NAME}-bollard-managed"),
        );
        labels.insert(
            "com.docker.compose.version".to_string(),
            "5.5.0".to_string(),
        );
        labels.insert(
            "com.docker.compose.depends_on".to_string(),
            depends_on.join(","),
        );
    }
    labels
}

/// Create the project network if it does not exist (`devwp_default`, bridge,
/// compose labels — identical to `docker compose up`).
pub(crate) async fn ensure_network(docker: &Docker) -> Result<(), String> {
    if let Err(e) = docker.inspect_network(NETWORK_NAME, None).await {
        if !is_not_found(&e) {
            return Err(format!("inspect network `{NETWORK_NAME}`: {e}"));
        }
        docker
            .create_network(bollard::models::NetworkCreateRequest {
                name: NETWORK_NAME.to_string(),
                driver: Some("bridge".to_string()),
                labels: Some(project_labels(None, &[])),
                ..Default::default()
            })
            .await
            .map_err(|e| format!("create network `{NETWORK_NAME}`: {e}"))?;
        state::push_build_log("startup", &format!("Created network {NETWORK_NAME}"));
    }
    Ok(())
}

/// Create any missing named volumes with compose-style labels.
pub(crate) async fn ensure_volumes(docker: &Docker, names: &[String]) -> Result<(), String> {
    let filters = HashMap::from([("name".to_string(), names.to_vec())]);
    let options = ListVolumesOptionsBuilder::new().filters(&filters).build();
    let existing: HashSet<String> = docker
        .list_volumes(Some(options))
        .await
        .map_err(|e| format!("list volumes: {e}"))?
        .volumes
        .unwrap_or_default()
        .into_iter()
        .map(|v| v.name)
        .collect();

    for name in names {
        if existing.contains(name) {
            continue;
        }
        // Label the volume with the compose *volume* label so a CLI rollback
        // recognizes it as `devwp` project state.
        let mut labels = HashMap::new();
        labels.insert(
            COMPOSE_PROJECT_LABEL.to_string(),
            COMPOSE_PROJECT_NAME.to_string(),
        );
        let short_name = name
            .strip_prefix(&format!("{COMPOSE_PROJECT_NAME}_"))
            .unwrap_or(name);
        labels.insert(
            "com.docker.compose.volume".to_string(),
            short_name.to_string(),
        );
        docker
            .create_volume(bollard::models::VolumeCreateRequest {
                name: Some(name.clone()),
                labels: Some(labels),
                ..Default::default()
            })
            .await
            .map_err(|e| format!("create volume `{name}`: {e}"))?;
        state::push_build_log("startup", &format!("Created volume {name}"));
    }
    Ok(())
}

pub(crate) async fn image_exists(docker: &Docker, image: &str) -> Result<bool, String> {
    match docker.inspect_image(image).await {
        Ok(_) => Ok(true),
        Err(e) if is_not_found(&e) => Ok(false),
        Err(e) => Err(format!("inspect image `{image}`: {e}")),
    }
}

/// Pull `image` unless it already exists (`docker pull`), streaming progress
/// into the build log under `service`.
pub(crate) async fn ensure_image(
    docker: &Docker,
    image: &str,
    service: &str,
) -> Result<(), String> {
    if image_exists(docker, image).await? {
        return Ok(());
    }
    state::push_build_log(service, &format!("Pulling {image}..."));
    let mut options_builder = CreateImageOptionsBuilder::new();
    // The API takes repo and tag separately; split at the last colon that is
    // not part of a digest reference.
    if let Some((repo, tag)) = image.rsplit_once(':') {
        if !tag.contains('/') {
            options_builder = options_builder.from_image(repo).tag(tag);
        } else {
            options_builder = options_builder.from_image(image);
        }
    } else {
        options_builder = options_builder.from_image(image);
    }
    let mut stream = docker.create_image(Some(options_builder.build()), None, None);
    while let Some(item) = stream.next().await {
        let info = item.map_err(|e| format!("pull `{image}`: {e}"))?;
        if let Some(message) = info
            .error_detail
            .as_ref()
            .and_then(|detail| detail.message.clone())
        {
            return Err(format!("pull `{image}`: {message}"));
        }
        if let Some(status) = info.status {
            state::push_build_log(service, &status);
        }
    }
    state::push_build_log(service, &format!("Pulled {image}"));
    Ok(())
}

/// Build a service image from its build context (`docker compose build`),
/// streaming BuildKit/classic step output into the build log.
pub(crate) async fn build_image(
    docker: &Docker,
    service: &str,
    image: &str,
    cfg: &ServiceConfig,
) -> Result<(), String> {
    let build = cfg
        .build
        .as_ref()
        .ok_or_else(|| format!("Service `{service}` has no build context"))?;
    let context = cfg.build_context_path()?;
    if !context.is_dir() {
        return Err(format!("Build context `{}` not found", context.display()));
    }
    state::push_build_log(service, &format!("Building {image}..."));
    let tarball = tar_directory(&context)?;

    let mut options = BuildImageOptionsBuilder::default()
        .dockerfile(build.dockerfile.as_deref().unwrap_or("Dockerfile"))
        .t(image)
        .rm(true);
    if let Some(args) = &build.args {
        options = options.buildargs(args);
    }

    let body = Either::Left(Full::new(Bytes::from(tarball)));
    let mut stream = docker.build_image(options.build(), None, Some(body));
    while let Some(item) = stream.next().await {
        let info = item.map_err(|e| format!("build `{image}`: {e}"))?;
        if let Some(message) = info
            .error_detail
            .as_ref()
            .and_then(|detail| detail.message.clone())
        {
            return Err(format!("build `{image}`: {message}"));
        }
        if let Some(line) = info.stream {
            state::push_build_log(service, &line);
        }
    }
    state::push_build_log(service, &format!("Built {image}"));
    Ok(())
}

/// Tar a directory tree into memory for the build API's context body.
fn tar_directory(dir: &Path) -> Result<Vec<u8>, String> {
    let mut builder = tar::Builder::new(Vec::new());
    builder
        .append_dir_all(".", dir)
        .map_err(|e| format!("tar `{}`: {e}", dir.display()))?;
    builder
        .into_inner()
        .map_err(|e| format!("tar `{}`: {e}", dir.display()))
}

/// Create the container if missing (compose labels, binds, ports, env,
/// healthcheck, tmpfs, log config, network aliases) or adopt the existing
/// one; start it if it is not running. Mirrors `compose up`'s adopt-don't-
/// recreate behaviour — an edited compose.yml needs a down/up cycle to apply.
pub(crate) async fn ensure_service_container(
    docker: &Docker,
    service: &str,
    cfg: &ServiceConfig,
    image: &str,
) -> Result<(), String> {
    let name = cfg.container_id(service);

    match docker.inspect_container(&name, None).await {
        Ok(_) => {
            if !container_running(docker, &name).await? {
                docker
                    .start_container(&name, None)
                    .await
                    .map_err(|e| format!("start `{name}`: {e}"))?;
                state::push_build_log(service, &format!("Started {name}"));
            }
            return Ok(());
        }
        Err(e) if is_not_found(&e) => {}
        Err(e) => return Err(format!("inspect `{name}`: {}", describe_daemon_error(&e))),
    }

    let mut exposed: Vec<String> = cfg.expose.clone().unwrap_or_default();
    let mut port_bindings: HashMap<String, Option<Vec<bollard::models::PortBinding>>> =
        HashMap::new();
    for spec in cfg.ports.clone().unwrap_or_default() {
        let mapping = compose::parse_port_mapping(&spec)?;
        let key = format!("{}/{}", mapping.container_port, mapping.proto);
        exposed.push(key.clone());
        port_bindings.insert(
            key,
            Some(vec![bollard::models::PortBinding {
                host_ip: mapping.host_ip,
                host_port: Some(mapping.host_port),
            }]),
        );
    }

    let healthcheck = cfg
        .healthcheck
        .as_ref()
        .map(|h| bollard::models::HealthConfig {
            test: Some(h.test.clone()),
            interval: h
                .interval
                .as_deref()
                .and_then(|d| compose::parse_duration_ns(d).ok())
                .map(|ns| ns as i64),
            timeout: h
                .timeout
                .as_deref()
                .and_then(|d| compose::parse_duration_ns(d).ok())
                .map(|ns| ns as i64),
            retries: h.retries,
            start_period: h
                .start_period
                .as_deref()
                .and_then(|d| compose::parse_duration_ns(d).ok())
                .map(|ns| ns as i64),
            start_interval: None,
        });

    let env = cfg.env_vec();
    let host_config = bollard::models::HostConfig {
        binds: Some(cfg.binds()?),
        network_mode: Some(NETWORK_NAME.to_string()),
        port_bindings: Some(port_bindings),
        tmpfs: cfg.tmpfs.as_ref().map(|entries| {
            entries
                .iter()
                .map(|path| (path.clone(), String::new()))
                .collect()
        }),
        log_config: Some(bollard::models::HostConfigLogConfig {
            typ: Some(LOG_DRIVER.to_string()),
            config: Some(HashMap::from([
                ("max-size".to_string(), "10m".to_string()),
                ("max-file".to_string(), "3".to_string()),
            ])),
        }),
        ..Default::default()
    };

    let networking = bollard::models::NetworkingConfig {
        endpoints_config: Some(HashMap::from([(
            NETWORK_NAME.to_string(),
            bollard::models::EndpointSettings {
                // Service-name alias keeps container-to-container DNS working
                // exactly like compose (DB host is the container name, but
                // compose also registers the bare service name).
                aliases: Some(vec![service.to_string(), name.clone()]),
                ..Default::default()
            },
        )])),
    };

    // Mirror compose's depends_on label format (observed:
    // `svc:service_healthy:false,...`) — only the label's presence matters
    // for CLI discovery, but staying close to the real format costs nothing.
    let depends_on: Vec<String> = cfg
        .dependency_names()
        .into_iter()
        .map(|dep| {
            let condition = if cfg.requires_healthy(dep) {
                "service_healthy"
            } else {
                "service_started"
            };
            format!("{dep}:{condition}:false")
        })
        .collect();
    let depends_on_refs: Vec<&str> = depends_on.iter().map(String::as_str).collect();

    let body = bollard::models::ContainerCreateBody {
        image: Some(image.to_string()),
        env: (!env.is_empty()).then_some(env),
        cmd: cfg.command_vec(),
        exposed_ports: (!exposed.is_empty()).then_some(exposed),
        healthcheck,
        labels: Some(project_labels(Some(service), &depends_on_refs)),
        host_config: Some(host_config),
        networking_config: Some(networking),
        ..Default::default()
    };

    let options = CreateContainerOptionsBuilder::new().name(&name).build();
    match docker.create_container(Some(options), body).await {
        Ok(_) => {}
        // A concurrent creator (or an old CLI run) already made it — adopt.
        Err(e) if is_conflict(&e) => {}
        Err(e) => return Err(format!("create `{name}`: {e}")),
    }

    docker
        .start_container(&name, None)
        .await
        .map_err(|e| format!("start `{name}`: {e}"))?;
    state::push_build_log(service, &format!("Started {name}"));
    Ok(())
}

pub(crate) async fn container_running(docker: &Docker, name: &str) -> Result<bool, String> {
    let inspect = docker
        .inspect_container(name, None)
        .await
        .map_err(|e| format!("inspect `{name}`: {e}"))?;
    Ok(inspect
        .state
        .and_then(|state| state.running)
        .unwrap_or(false))
}

/// Wait until `name` reports a healthy healthcheck. Fails fast on
/// `unhealthy`; a container without a healthcheck is immediately "healthy".
pub(crate) async fn wait_for_health(
    docker: &Docker,
    name: &str,
    timeout: Duration,
) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    loop {
        let inspect = docker
            .inspect_container(name, None)
            .await
            .map_err(|e| format!("inspect `{name}`: {e}"))?;
        let health = inspect.state.and_then(|state| state.health);
        match health.and_then(|h| h.status) {
            Some(bollard::models::HealthStatusEnum::HEALTHY) => return Ok(()),
            Some(bollard::models::HealthStatusEnum::UNHEALTHY) => {
                return Err(format!("`{name}` reported unhealthy"));
            }
            Some(
                bollard::models::HealthStatusEnum::NONE | bollard::models::HealthStatusEnum::EMPTY,
            )
            | None => return Ok(()),
            Some(bollard::models::HealthStatusEnum::STARTING) => {}
        }
        if Instant::now() >= deadline {
            return Err(format!("`{name}` not healthy after {}s", timeout.as_secs()));
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

/// Wait until `name` is running (for `service_started` dependencies).
pub(crate) async fn wait_for_running(
    docker: &Docker,
    name: &str,
    timeout: Duration,
) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    loop {
        if container_running(docker, name).await? {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!("`{name}` not running after {}s", timeout.as_secs()));
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

/// Stop and remove every project container (`docker compose down` minus the
/// network/volume removal — data must survive rollback and relaunch).
pub(crate) async fn stop_project_containers(docker: &Docker) -> Result<(), String> {
    let options = ListContainersOptionsBuilder::new()
        .all(true)
        .filters(&project_label_filter())
        .build();
    let summaries = docker
        .list_containers(Some(options))
        .await
        .map_err(|e| describe_daemon_error(&e))?;

    for summary in summaries {
        let Some(name) = summary
            .names
            .as_ref()
            .and_then(|names| names.first())
            .map(|n| n.trim_start_matches('/').to_string())
        else {
            continue;
        };
        // Graceful stop first (10s SIGTERM window — mariadb flushes), then
        // force-remove. Stopping an already-stopped container is 304/ok.
        let stop_options = StopContainerOptionsBuilder::default()
            .t(STOP_TIMEOUT_SECS)
            .build();
        if let Err(e) = docker.stop_container(&name, Some(stop_options)).await {
            if !is_not_found(&e) {
                state::push_build_log("startup", &format!("stop `{name}`: {e}"));
            }
        }
        let remove_options = RemoveContainerOptionsBuilder::default().force(true).build();
        docker
            .remove_container(&name, Some(remove_options))
            .await
            .map_err(|e| format!("remove `{name}`: {e}"))?;
        state::push_build_log("startup", &format!("Removed {name}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_php_version_extracts_semver() {
        assert_eq!(
            parse_php_version("PHP 8.3.7 (cli)\nCopyright"),
            Some("v8.3.7".to_string())
        );
        assert_eq!(
            parse_php_version("PHP 8.3.7-dev (cli)"),
            Some("v8.3.7-dev".to_string())
        );
        assert_eq!(parse_php_version("nope"), None);
    }

    #[test]
    fn parse_nginx_version_splits_on_slash() {
        assert_eq!(
            parse_nginx_version("nginx version: nginx/1.27.0"),
            Some("v1.27.0".to_string())
        );
    }

    #[test]
    fn parse_mariadb_version_takes_first_segment() {
        assert_eq!(
            parse_mariadb_version("mariadb from 11.4.3-MariaDB-ubu2404"),
            Some("v11.4.3".to_string())
        );
    }

    #[test]
    fn parse_redis_version_after_v_eq() {
        assert_eq!(
            parse_redis_version("Redis server v=7.2.4 sha=abc malloc=jemalloc"),
            Some("v7.2.4".to_string())
        );
    }

    #[test]
    fn parse_mailpit_version_extracts_version() {
        assert_eq!(
            parse_mailpit_version("mailpit v1.21.0 (build abc)"),
            Some("v1.21.0".to_string())
        );
    }

    #[test]
    fn container_state_maps_known_and_unknown() {
        assert_eq!(
            ContainerState::from_docker("running"),
            ContainerState::Running
        );
        assert_eq!(
            ContainerState::from_docker("paused"),
            ContainerState::Other("paused".to_string())
        );
        assert_eq!(ContainerState::from_docker("running").as_str(), "running");
    }

    #[test]
    fn exec_output_success_checks_exit_code() {
        assert!(ExecOutput {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 0
        }
        .success());
        assert!(!ExecOutput {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 1
        }
        .success());
    }

    #[test]
    fn project_labels_include_service_and_discovery_set() {
        let labels = project_labels(Some("php"), &["mariadb:service_healthy:false"]);
        assert_eq!(
            labels.get(COMPOSE_PROJECT_LABEL).map(String::as_str),
            Some(COMPOSE_PROJECT_NAME)
        );
        assert_eq!(labels.get(SERVICE_LABEL).map(String::as_str), Some("php"));
        assert_eq!(
            labels
                .get("com.docker.compose.container-number")
                .map(String::as_str),
            Some("1")
        );
        assert_eq!(
            labels
                .get("com.docker.compose.depends_on")
                .map(String::as_str),
            Some("mariadb:service_healthy:false")
        );
        assert!(labels.contains_key("com.docker.compose.config-hash"));
        assert!(labels.contains_key("com.docker.compose.oneoff"));
        assert!(labels.contains_key("com.docker.compose.version"));
    }
}
