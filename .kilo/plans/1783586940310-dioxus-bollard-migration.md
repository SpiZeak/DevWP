# Plan: Migrate from Tauri + React to Dioxus + bollard

## Summary

Replace the Tauri v2 + React/TypeScript/Vite/Node.js stack with a pure Rust binary (single crate) using Dioxus 0.7.9 desktop (Wry renderer) for the UI and bollard for direct Docker Engine API communication. Eliminate the `docker`/`docker compose` CLI dependency by parsing `compose.yml` and orchestrating containers entirely through bollard. Remove all Node.js/JS/TS code from the repo.

## Key Decisions

| Decision | Choice |
|---|---|
| Dioxus version | 0.7.9 — desktop (Wry) renderer, Linux/macOS/Windows |
| CSS | Dioxus built-in Tailwind (`dx` CLI compiles RSX classes at build time) |
| Docker | Pure bollard — zero `docker`/`docker compose` CLI calls |
| Compose.yml | Specific Rust structs + manual `${VAR}` / `~` resolution, no generic compose parser |
| Writable configs | Co-located in extracted tree (`~/.config/devwp/config/`) — same model as today |
| Update stubs | Keep returning false/not-implemented |
| Project cleanup | Full Rust repo — remove all Node/React/TS/Vite |
| Crate structure | Single crate |
| File dialog | `rfd::AsyncFileDialog` (non-blocking) |
| Logging | `tracing` crate |
| Async runtime | tokio (shared by Dioxus desktop + bollard) |

---

## Task List

### 1. Project scaffold

**1.1** Rewrite `Cargo.toml` at repo root (replace `src/tauri/Cargo.toml`):
- **Remove**: `tauri`, `tauri-build`, `tauri-plugin-opener`, `tauri-plugin-log`
- **Add**: `dioxus = { version = "0.7", features = ["desktop"] }`, `bollard`, `tokio = { version = "1", features = ["full"] }`, `serde_yaml = "0.9"`, `futures-util`, `webbrowser`, `dirs`, `tracing`, `tracing-subscriber`, `shellexpand`, `flate2`, `tar`, `chrono`
- **Keep**: `serde`, `serde_json`, `rfd`, `shell-words`
- Remove `[lib]` section; add `[[bin]]` section for `src/main.rs`

**1.2** Rewrite `src/main.rs`:
- Dioxus desktop entry: `dioxus::LaunchBuilder::desktop().with_cfg(desktop_config).launch(App)`
- Initialize `tracing_subscriber` for logging
- Set `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux (preserve current workaround)

**1.3** Create `Dioxus.toml`:
```toml
[application]
name = "DevWP"
default_platform = "desktop"

[web.resource.dev]
style = ["tailwind.css"]

[desktop]
bundle_identifier = "au.trewhitt.devwp"
```

**1.4** Remove old files:
- `src/tauri/build.rs`
- `src/tauri/Cargo.toml` (replaced by root)
- Move `src/tauri/src/*.rs` → `src/` (adjust `mod` declarations)

**1.5** Verify `dx serve` compiles and launches.

---

### 2. compose.yml parsing (`src/compose.rs`)

**2.1** Define Rust structs matching **our** compose.yml (not the full Compose spec):
```rust
struct ComposeFile {
    services: BTreeMap<String, ServiceConfig>,
    volumes: Option<BTreeMap<String, VolumeConfig>>,
}
struct ServiceConfig {
    container_name: Option<String>,
    build: Option<BuildConfig>,
    image: Option<String>,
    ports: Option<Vec<String>>,
    expose: Option<Vec<String>>,
    volumes: Option<Vec<String>>,
    environment: Option<BTreeMap<String, Option<String>>>,
    depends_on: Option<BTreeMap<String, DependsCondition>>,
    healthcheck: Option<HealthcheckConfig>,
    restart: Option<String>,
    tmpfs: Option<Vec<String>>,
    command: Option<serde_yaml::Value>, // can be string or list
    logging: Option<serde_yaml::Value>, // ignored — Docker handles this
}
// ... other structs as needed
```

**2.2** Preprocess pipeline:
1. Read raw YAML string
2. Resolve YAML anchors/aliases: `serde_yaml::Value` with `merge_keys` feature, re-serialize
3. Expand env vars: `shellexpand::env_with_context` for `${UID:-1000}`, `${GID:-1000}` — pass a context with actual UID/GID values
4. Expand tilde: `shellexpand::full_with_context` or manual `~` → `$HOME`
5. Deserialize into `ComposeFile` struct

**2.3** Add `include_str!("../compose.yml")` as embedded resource for binary. Also embed `config/` via `include_dir` crate or individual `include_str!` calls.

---

### 3. bollard Docker orchestration (`src/docker.rs` rewrite)

**3.1** Docker client singleton:
```rust
pub async fn docker_client() -> Result<Docker, String> {
    Docker::connect_with_local_defaults()
        .map_err(|e| format!("Cannot connect to Docker: {e}"))
}
```

**3.2** Container listing (replaces `docker compose ps`):
- `docker_client().list_containers::<String>(ListContainersOptions {
    all: true,
    filters: hashmap! { "label" => vec!["com.docker.compose.project=devwp"] },
    ..Default::default()
  })`
- Map `bollard` container state → `Container` struct (same fields as current `Container`: id, name, state, health, version)

**3.3** Container version check (replaces `docker exec <name> <version-cmd>`):
- Create exec: `docker_client().create_exec(container_name, CreateExecOptions { cmd: Some(vec!["php", "--version"]), attach_stdout: true, ..Default::default() })`
- Start exec: `docker_client().start_exec(&exec_id, Some(StartExecOptions { .. }))` → stream stdout
- Map output to version string per service (PHP, nginx, mariadb, redis, mailpit)

**3.4** Service startup (replaces `docker compose up -d`):
1. Check if container exists (`inspect_container`); if not → create
2. If service has a `build` context → `build_image` with tarred context directory (see §3.5)
3. If service has an `image` (no build) → `create_image` to pull if not cached
4. `create_container` with configuration from compose.yml:
   - `name`: `container_name` field
   - `Image`: resolved image name
   - `Env`: from `environment` map
   - `Cmd`: from `command` field
   - `HostConfig.binds`: from `volumes` — resolve host paths relative to `~/.config/devwp/`, replace `~/www` with settings webroot
   - `HostConfig.port_bindings`: from `ports`
   - `HostConfig.restart_policy`: from `restart`
   - `HostConfig.tmpfs`: from `tmpfs`
   - `Healthcheck`: from compose `healthcheck`
   - `Labels`: add `com.docker.compose.project=devwp`, `com.docker.compose.service=<name>`
5. Start containers in dependency order:
   - Build adjacency list from `depends_on`
   - Topological sort
   - For each service with `condition: service_healthy`: after `start_container`, poll health (2s interval, 30s timeout) via `inspect_container` → `state.health.status`
   - Continue to next service only after dependency is healthy

**3.5** Build image (replaces `docker compose build`):
```rust
async fn build_image(service: &str, build: &BuildConfig, config_root: &Path) -> Result<(), String> {
    let build_dir = config_root.join(&build.context); // e.g. ./config/php
    // Tar the build directory
    let mut tar = tar::Builder::new(Vec::new());
    tar.append_dir_all(".", &build_dir)?;
    let archive = tar.into_inner()?;
    // Stream to bollard
    let mut stream = docker_client().build_image(
        BuildImageOptions {
            dockerfile: build.dockerfile.as_deref().unwrap_or("Dockerfile"),
            t: &format!("devwp_{service}:latest"),
            buildargs: build.args.clone().unwrap_or_default(),
            rm: true,
            ..Default::default()
        },
        None,
        Some(archive.into()),
    );
    // Read stream events, emit build-status + docker-log signals
    while let Some(event) = stream.next().await {
        // parse event, update BUILDING and BUILD_LOG signals
    }
}
```

Crates needed: `tar`, `flate2` (for gzip if needed).

**3.6** Service stop (replaces `docker compose stop`):
- `docker_client().stop_container(container_name, None)`

**3.7** Service restart (replaces `docker restart` / `docker compose restart`):
- `docker_client().restart_container(container_name, None)`

**3.8** Container exec (replaces `docker exec <container> <cmd>`):
- Abstract into `exec_in_container(container: &str, cmd: &[&str]) -> Result<ExecOutput, String>`
- Returns captured stdout + stderr
- Used by: version checks, WP-CLI, composer, nginx reload

**3.9** Network management:
- On first startup: `list_networks` filtered by name `devwp_default`
- If not found: `create_network(CreateNetworkOptions { name: "devwp_default", driver: "bridge", labels: hashmap!{"com.docker.compose.project" => "devwp"}, ..Default::default() })`

**3.10** Volume management (named volumes `mariadb`, `redis`):
- On first startup: `list_volumes` filtered by name
- If not found: `create_volume(CreateVolumeOptions { name: "devwp_mariadb", labels: ..., ..Default::default() })`

**3.11** Service shutdown (replaces `docker compose down` / app close):
- `stop_container` for all project containers
- `remove_container` for all project containers
- (Do not remove volumes or network — preserving data between sessions)

---

### 4. Adapt existing modules

**4.1** `src/wp_cli.rs`:
- Remove `run_command("docker", ...)` calls
- Replace with `exec_in_container(PHP_CONTAINER_NAME, &full_cmd_args)`
- Keep `shell_words::split` for user input parsing
- Keep error extraction logic (debug fallback)

**4.2** `src/site.rs`:
- Remove `nginx_reload()` → replace with `exec_in_container("devwp_nginx", &["nginx", "-s", "reload"])`
- Keep hosts-file logic (pkexec/osascript/PowerShell) — pure Rust, no changes needed
- Keep nginx config generation — pure file I/O
- Keep mkcert calls via `std::process::Command` — mkcert is an external tool, bollard can't replace it
- Keep `install_wordpress()` → replace all `run_command("docker", ...)` with `exec_in_container`
- Remove `#[tauri::command]` attributes — functions become regular pub async fn

**4.3** `src/xdebug.rs`:
- Remove `run_command("docker", &["compose", "restart", "php"])`
- Replace with `docker_client().restart_container("devwp_php", None)`
- Keep xdebug.ini file read/write unchanged

**4.4** `src/settings.rs`:
- Remove `#[tauri::command]` attributes — functions become regular pub fn
- `pick_directory`: use `rfd::AsyncFileDialog::new().pick_folder()` instead of blocking `rfd::FileDialog`

**4.5** `src/system.rs`:
- Remove `#[tauri::command]` attributes
- `open_external`: use `webbrowser::open(&url)`
- `open_directory`: keep `open_target` logic (xdg-open/open/start) unchanged
- Update stubs: keep as-is (return false/not-implemented)

**4.6** `src/utils.rs`:
- Remove `run_command` and `run_command_streaming`
- Remove `emit_notification` (replaced by signal writes)
- Remove `NotificationPayload` (notifications become Dioxus signals)
- Keep `project_root`, `state_root`, `logs_dir`, `home_dir`, `default_webroot`, `open_target`
- Update `project_root()`: no longer look for `compose.yml` in CWD — use config directory instead

---

### 5. Config extraction & runtime paths

**5.1** Config directory: `~/.config/devwp/` (`dirs::config_dir().join("devwp")`)

**5.2** State directory: `~/.local/share/devwp/` (`dirs::data_dir().join("devwp")`)

**5.3** First-run extraction logic (in `src/setup.rs`):
1. Check if `~/.config/devwp/compose.yml` exists
2. If not: create directory, extract embedded `compose.yml` and `config/` tree
3. Mark as done (touch `~/.config/devwp/.initialized`)
4. If exists: skip extraction, but warn if any required file is missing

**5.4** Path resolution:
- All paths in compose.yml that start with `./` resolve relative to `~/.config/devwp/`
- The `~/www` webroot bind mount resolves to the **settings value** (`webroot_path`), not the compose.yml literal — override during container creation
- State files (`sites.json`, `settings.json`) read from / written to `~/.local/share/devwp/`

**5.5** `.devwp-tauri` migration:
- On first run after migration, if `~/.local/share/devwp/settings.json` doesn't exist but `./.devwp-tauri/settings.json` does (project-root relative), copy settings.json and sites.json to the new state directory

---

### 6. State management (Dioxus 0.7 signals)

**6.1** Define global signals in `src/state.rs`:
```rust
use dioxus::prelude::*;
use std::collections::{HashMap, HashSet, VecDeque};

pub struct AppState {
    pub containers: Signal<Vec<Container>>,
    pub sites: Signal<Vec<Site>>,
    pub settings: Signal<HashMap<String, String>>,
    pub building: Signal<HashSet<String>>,       // container names currently building
    pub build_log: Signal<Vec<BuildLogEntry>>,   // streaming log lines
    pub notifications: Signal<VecDeque<Notification>>,
    pub xdebug_enabled: Signal<bool>,
    pub docker_status: Signal<DockerStatus>,     // idle/starting/stopping/error
}
```
Provide via `use_context_provider` at the App root.

**6.2** Async operations pattern:
- `use_resource` for initial data fetches (containers, sites, settings) — auto-re-fetches when dependencies change
- `spawn` for fire-and-forget operations (restart, stop, toggle xdebug)
- `Coroutine` for long-running streams (build output, WordPress install progress) that yield intermediate states to signals
- All bollard calls are async and run on tokio; Dioxus 0.7 desktop uses tokio as its runtime

**6.3** App startup sequence (`src/startup.rs`):
1. Set all 5 services as "building" in `building` signal
2. Spawn async task: ensure network, ensure volumes, build/start services in dependency order
3. Stream build log to `build_log` signal
4. On all healthy: clear `building`, refresh `containers`
5. On error: set `docker_status` to error, show message

**6.4** Periodic health polling:
- When any container has `health == "starting"`, run a 2-second interval that calls `inspect_container` for each
- Stop the interval when all containers are healthy or stopped

---

### 7. Dioxus UI components

**7.1** `src/ui/app.rs` — App root:
- `use_context_provider` for `AppState`
- Grid layout: `div { class: "grid grid-cols-[40%_60%] p-6 w-full" }`
- Left panel: `Services {}`
- Right panel: `SiteList {}`
- Conditional modals: `if is_settings_open { SettingsModal {} }`, etc.
- Footer: attribution link with `onclick: |_| webbrowser::open("...")`

**7.2** `src/ui/services.rs` — Services panel:
- Header: Docker icon + "Docker Services" title + Settings/About buttons
- XdebugSwitch (inline toggle)
- 5 container cards in a responsive grid
- Each card: service icon, display name, status badge, version text, restart button
- BuildLog: collapsible below cards when `building` is non-empty
- Restart button: spin on click, call `spawn` → restart container → refresh status

**7.3** `src/ui/site_list.rs` — Site list panel:
- Site cards from `sites` signal
- Each card: domain, status, action buttons (Open, Edit, Delete, WP-CLI, Composer)
- Create site button → opens `CreateSiteModal`
- Context: `SiteActionContext` for action availability per site

**7.4** `src/ui/modals/` — Modal components:
- `CreateSiteModal`: form fields for domain, web_root, aliases, multisite (subdir/subdomain toggle), WordPress install (title, admin user, password, email)
- `EditSiteModal`: aliases, web_root update
- `WpCliModal`: text input for command, output panel
- `ComposerModal`: run button + output panel
- `SettingsModal`: webroot picker (calls `rfd::AsyncFileDialog`), other KV settings
- `VersionsModal`: app version, credits, GitHub link

**7.5** `src/ui/components/` — Shared components:
- `Notifications`: renders `notifications` signal as toast stack, auto-dismiss after 5s
- `Spinner`: CSS-animated SVG spinner
- `Icon`: renders inline SVG or emoji
- `BrandLogo`: constant SVG strings for Docker, Nginx, PHP, MariaDB, Redis, Mailpit
- `BuildLog`: scrollable log panel reading from `build_log` signal

**7.6** Styling (Tailwind):
- The `dx` CLI's built-in Tailwind compiler scans all `class: "..."` attributes in RSX macros and generates `tailwind.css`
- Custom theme: define in `Dioxus.toml` `[tailwind.theme.extend.colors]` for warm-charcoal, seasalt, pumpkin, gunmetal, crimson, amber, emerald
- Custom animations (fade-in-up): `[tailwind.theme.extend.keyframes]` and `[tailwind.theme.extend.animation]`
- Custom fonts: copy `.woff2` font files from `src/renderer/src/assets/fonts/` to `assets/fonts/`, reference in root `tailwind.css` via `@font-face` directives

**7.7** Error boundary:
- Wrap app content in a component that catches panics and renders a fallback "Something went wrong" screen

---

### 8. Cleanup

**8.1** Delete old stack (after confirming new app works):
- `src/renderer/` (React/TS source)
- `src/tauri/` (old Rust Tauri code)
- `src/test/` (JS tests)
- `package.json`, `bun.lock`, `tsconfig*.json`, `vite.config*.ts`, `vitest.config*.ts`, `biome.json`, `.npmrc`
- `node_modules/`, `dist/`, `out/`
- `build/` (Tauri bundling assets — icons kept for packaging)
- `.devwp-tauri/` (old state directory)

**8.2** Update CI/CD:
- Remove Node.js/bun install steps
- Replace `tauri build` with `cargo build --release` 
- Add `rustfmt` and `clippy` checks

**8.3** Update README:
- New prerequisites: Rust, Dioxus CLI (`cargo install dioxus-cli`), Docker
- Build: `cargo build --release` (or `dx build --release`)
- Dev: `dx serve`
- No more Node/bun required

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| bollard `build_image` requires tar stream of build context | Use `tar` crate in memory; test that Dockerfiles in `config/php/` and `config/nginx/` build correctly from tarred context |
| `depends_on` with `service_healthy` requires sequential startup | Accept slower cold-start; implement health polling loop with 30s timeout per service |
| `rfd::AsyncFileDialog` may not exist in the `rfd` version we use | Fallback: `tokio::task::spawn_blocking` with sync `rfd::FileDialog`, send path via channel to Dioxus signal |
| YAML anchors (`&default-logging`, `<<: *default-logging`) | `serde_yaml` requires feature `merge_keys` and `Value` round-trip preprocessing |
| `${UID:-1000}` substitution | Use `shellexpand::env_with_context` with a custom context providing `UID`, `GID` |
| Custom fonts and Tailwind theme | Dioxus 0.7 Tailwind config in `Dioxus.toml` may have limitations; if so, fall back to a pre-built `tailwind.css` generated separately |
| `simple-icons` npm package no longer available | Embed the 6 SVG icons as Rust `&str` constants (hand-copy from the package or use inline SVGs) |

---

## Implementation Order

1. **Scaffold** — Cargo.toml, main.rs, Dioxus.toml, delete old JS/TS files
2. **compose.yml parsing** — structs, YAML preprocessing, env var / tilde expansion
3. **bollard orchestration** — connection, container list/create/start/stop/restart/exec, build, network, volumes
4. **Adapt modules** — wp_cli, site, xdebug, settings, system, utils to bollard + pure async
5. **Config extraction** — first-run setup, path resolution, state directory
6. **State signals** — AppState struct, context provider, async startup sequence
7. **UI shell** — App layout, modal system, notifications, error boundary
8. **Services panel** — container cards, build log, xdebug toggle
9. **SiteList panel** — site cards, create/edit/delete/WP-CLI/composer modals
10. **Settings & Versions modals** — settings form, directory picker, about screen
11. **Styling pass** — Tailwind theme, animations, fonts, icons, polish
12. **Async wiring** — health polling, build stream → signals, startup sequence
13. **Cleanup** — remove old code, update CI, update README
14. **Packaging** (future) — AppImage/DMG/MSI via cargo-packager
