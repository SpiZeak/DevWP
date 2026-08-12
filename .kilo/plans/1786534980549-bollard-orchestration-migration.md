# Plan: Complete the bollard migration (remaining work)

## Context

The Tauri→Dioxus half of the original migration plan is already committed on `feat/dioxus-migration` (`db64e5c` + follow-ups through `f2cd7c8`): Dioxus 0.7.10 desktop, signals in `src/state.rs`, full UI in `src/components/`, embedded assets (`src/assets.rs`), prebuilt Tailwind CSS (`scripts/build-css.sh`), frameless window. Keep all of it as-is — **no Dioxus.toml, no dx-run Tailwind, no `webbrowser` crate** (system.rs already uses `open_target`, `src/backend/system.rs:18-24`).

What remains: replace every `docker`/`docker compose` CLI call in the app binary with bollard, parse `compose.yml` in Rust, move config/state to XDG dirs with first-run extraction and `.devwp-tauri` migration, then clean up.

## Current docker CLI call sites (all must disappear from the app)

| File:line | Today | bollard replacement |
|---|---|---|
| `src/backend/docker.rs:133` | `docker compose ps` | `list_containers` filtered by label `com.docker.compose.project=devwp` |
| `src/backend/docker.rs:69` | `docker exec <name> <ver-cmd>` (version probe) | `exec_in_container` (keep stdout/stderr split — nginx `-v` writes stderr) |
| `src/backend/docker.rs:172` | `docker restart <id>` | `restart_container` |
| `src/backend/lifecycle.rs:29` | `docker compose up -d nginx` (streaming) | orchestration: ensure network/volumes → build/pull → create/start in dep order → health waits |
| `src/backend/lifecycle.rs:65` | `docker compose down` | stop + remove project-label containers; keep volumes + network |
| `src/backend/wp_cli.rs:48,116,155` | `docker exec` (wp, composer w/ `--env-file`) | `exec_in_container` w/ `CreateExecOptions.working_dir` + `.env` |
| `src/backend/xdebug.rs:75` | `docker compose restart php` | `restart_container("devwp_php")` |
| `src/backend/site.rs:300,311` | `docker exec devwp_nginx nginx -t` / `-s reload` | `exec_in_container("devwp_nginx", …)` — keep `-t` validation |
| `src/backend/site.rs:692,723` (+ same shape ~660-760) | `docker exec` wp-install steps / `mariadb -e CREATE DATABASE` | `exec_in_container` with `working_dir` / plain exec |

`run_command` / `run_command_streaming` (`src/backend/utils.rs:71-128`) are deleted once nothing calls them.

## Decisions

- **Deps (add to `Cargo.toml`)**: `bollard` (latest 0.x, default features), `futures-util = "0.3"`, `include_dir = "0.7"`, `serde_yaml = "0.9"`, `shellexpand = "3"`, `tar = "0.4"`, `dirs` (latest major). Extend `tokio` features from `["rt"]` to `["full"]`. No `flate2` (tar stream, not gzip, is accepted by the build API). `rfd`, `serde`, `serde_json`, `shell-words`, `tracing`, `dioxus` stay.
- **YAML**: `serde_yaml` 0.9.34+deprecated has **no feature flags** (the old plan's `merge_keys` feature doesn't exist). Not needed: `compose.yml` uses a plain alias (`logging: *default-logging`, compose.yml:25) which resolves natively. If a future `<<:` merge key appears, serde_yaml 0.9 handles it natively; crate is archived — `serde_yaml_ng`/`serde_yml` are drop-in forks if anything breaks.
- **Config root**: `dirs::config_dir().join("devwp")` (`~/.config/devwp` on Linux). **State root**: `dirs::data_dir().join("devwp")` (`~/.local/share/devwp` on Linux). Keep the `DEVWP_TEST_MODE` redirect (redirect both roots to temp, `src/backend/utils.rs:41-46`).
- **Embedded config — selective, never wholesale**. `config/` on disk contains gitignored runtime/machine-local data: `config/mariadb/files/*.sql` (**3.4 GB**, `.gitignore` line), `config/certs/**`, `config/nginx/sites-enabled/**`. Embed only tracked files: `compose.yml`, `config/php/**`, `config/nginx/{nginx.conf,global/**,conf.d/**}`, `config/mariadb/my.cnf`. On first run materialize the skeleton and create empty dirs for `config/certs/`, `config/nginx/sites-enabled/`, `config/mariadb/files/` (bind-mount sources must exist; Docker would otherwise create them as root).
- **Environment field** (`compose.yml` uses both forms): untagged enum — `Map<String, Value> | Vec<String>` (mailpit:116-119 is a list; `MARIADB_AUTO_UPGRADE: true` :39 is a YAML bool). Stringify values (`true` → `"true"`); output `Vec<String>` of `K=V` for `ContainerConfig.env`.
- **Binds**: parse `src:dst[:ro|rw]`; tilde-expand all host paths (php mounts `~/www`, `~/.ssh`, `~/.config/composer`); `./config/...` resolves against config root; replace `~/www` host side with the settings `webroot_path` (default `~/www`); named volumes `mariadb`/`redis` → `devwp_mariadb`/`devwp_redis`.
- **Ports**: parse `[host_ip:]host:container[/proto]` — note `443:443/tcp` **and** `443:443/udp` (compose.yml:83-84) → `PortMap` keys `443/tcp`, `443/udp`. `expose` → `ExposedPorts` only (no host binding).
- **Healthcheck**: compose `test` forms already match Docker exec form — `['CMD', …]` and `['CMD-SHELL', '…']` (php/nginx vs mariadb/redis/mailpit) map directly to `HealthConfig.test`; interval/timeout/retries/start_period in ms.
- **Health waits**: old plan's 30 s timeout is **too short** — php has `start_period: 40s` (compose.yml:31). Use 90 s per dependency, poll every 2 s. Topo order from `depends_on` (only nginx has deps): start php, mariadb, redis, mailpit, wait each until healthy, then nginx.
- **Startup semantics**: for each service in topo order — if container missing: build (build images `devwp_php`/`devwp_nginx` via `build_image` with `tar`red context) or pull (`create_image`); then `create_container` (labels `com.docker.compose.project=devwp` + `com.docker.compose.service=<name>`, `HostConfig.network_mode = "devwp_default"`); if it exists: start it if not running (compose `up` semantics — do NOT recreate). Build/pull stream lines → `state::push_build_log(service, line)` (ANSI already stripped there).
- **Listing/health polling**: keep the existing ~1 s poll (`src/components/services.rs:95-97`) but it now calls `list_containers`; `ContainerSummary` has **no health** — inspect only running containers (≤6 API calls/s over the unix socket is fine) and merge `.state.health.status`. Keep the `VERSION_CACHE` exec-probe pattern (`src/backend/docker.rs:129`).
- **Exec env instead of `--env-file`** (`wp_cli.rs:94-113`): pass `COMPOSER_AUTH` via `CreateExecOptions.env`; secrecy is preserved (env travels over the Docker API socket, not the CLI argv of a child process) — delete the temp-file dance.
- **Shutdown**: stop + remove all project-label containers; **keep** volumes and the `devwp_default` network (deliberate divergence from `docker compose down`, which also removes the network — harmless, cheaper next start).
- **CI harness stays CLI-based**: `pr.yml`/`test.yml` keep using `docker compose` to provision the stack for integration tests. The zero-CLI rule applies to the app binary only.
- **No churn**: `pick_directory` stays sync `rfd::FileDialog` (`src/backend/settings.rs:89-101` — GTK must be on the main thread, documented there); updater stubs stay; `open_target` stays.

## Task list

1. **Cargo.toml** — add the deps above; extend tokio features.
2. **`src/compose.rs`** (new) — structs for **our** compose.yml only:
   ```rust
   struct ComposeFile { services: BTreeMap<String, ServiceConfig>, volumes: Option<BTreeMap<String, VolumeConfig>> }
   struct ServiceConfig {
       container_name: Option<String>,
       build: Option<BuildConfig>,                 // context: String, dockerfile: Option<String>, args: Option<HashMap<String, String>>
       image: Option<String>,
       ports: Option<Vec<String>>,
       expose: Option<Vec<String>>,
       volumes: Option<Vec<String>>,
       environment: Option<EnvConfig>,             // untagged map|list (see Decisions)
       depends_on: Option<BTreeMap<String, DependsCondition>>,  // condition: Option<String>
       healthcheck: Option<HealthcheckConfig>,
       restart: Option<String>,
       tmpfs: Option<Vec<String>>,
       command: Option<serde_yaml::Value>,         // string | list → Vec<String> for Cmd
   }
   ```
   Preprocessing: `include_str!("compose.yml")` → `shellexpand::full_with_context` in one pass (context: `UID`/`GID` from env with fallback `"1000"` — shellexpand 3 supports `${VAR:-default}`; the `:-` default only kicks in if the context returns unset) → `serde_yaml::from_str::<ComposeFile>`. Expose pure helpers: `parse_port(s) -> (port, proto)`, `bind_from_volume_str`, `env_to_vec`, `healthcheck_to_api`, `command_to_vec`.
3. **`src/backend/docker.rs` rewrite** — `docker_client()` (`Docker::connect_with_local_defaults`); `list_containers` (label filter; inspect-health merge); `exec_in_container(container, cmd, {working_dir, env}) -> (stdout, stderr, exit)` (start_exec stream, demux `LogOutput`); `ensure_network`, `ensure_volumes` (create `devwp_default` / `devwp_mariadb` / `devwp_redis` if missing; compose-style labels); `ensure_image` (inspect → pull); `build_image` (tar context via `include_dir`-embedded copy in config root at runtime — actually tar the **extracted** config dir; stream `BuildInfo` lines → `push_build_log`); `create_or_start`; `restart/stop/remove`; adjacency-list topo sort + per-dependency health wait (90 s / 2 s). Keep `Container` and `DockerStatusPayload` shapes and the unit tests for `parse_compose_ps`… which become obsolete — replace with tests of the new pure helpers.
4. **`src/backend/lifecycle.rs`** — `start_services`: mark all 5 building (same as today, `lifecycle.rs:22-25`), run orchestration, stream logs, clear building, set status (`complete`/`error`), refresh container list. `stop_services`: stop+remove project containers, set status, `set_shutdown_done(true)`.
5. **Adapt modules** — `wp_cli.rs` (exec + `working_dir` + env; delete temp env-file), `site.rs` (nginx `-t`/reload, wp-install execs incl. `mariadb` db-create), `xdebug.rs` (`restart_container("devwp_php")`).
6. **`src/backend/utils.rs` + `src/setup.rs` (new)** — delete `run_command`/`run_command_streaming`; `project_root()` walk is no longer needed — replace with `config_root()`; `state_root()` data-dir based (keep test-mode redirect); first-run extraction (skeleton + empty runtime dirs, guard file `.initialized`; if compose.yml missing from extracted dir → warn and re-extract); `.devwp-tauri` migration: if `~/.local/share/devwp/settings.json` absent and `<repo>/.devwp-tauri/settings.json` present (walk up from CWD like today's `project_root()`), copy `settings.json` + `sites.json` once. `xdebug_config_path` (`src/backend/xdebug.rs:7-9`) and any `project_root()`-based paths in `site.rs` switch to `config_root()`.
7. **Tests** — unit tests for `compose.rs` (parse the embedded file: 5 services, container names, both env forms, bool env, `443/udp`, depends_on conditions, both healthcheck test forms, command string vs list, volume forms, UID fallback). `tests/integration.rs`: replace `docker_available()` CLI probe (`integration.rs:16-22`) with a bollard `ping` probe; keep existing cases (they exercise the new bollard code paths). CI workflows: unchanged except verifying `pr.yml` runs `cargo fmt --check` + `cargo clippy -- -D warnings` (add if missing).
8. **Cleanup** — delete `node_modules/`, `dist/`, `out/`, `.env.example`, and (only after the first-run migration is validated) the repo `.devwp-tauri/`. Keep `build/` (icons referenced by `[package.metadata.packager]`, Cargo.toml:41), `resources/`, `scripts/` (build-css.sh, cert scripts), `config/` + `compose.yml` (source of the embedded copy), `docs/`.
9. **Docs** — README: prerequisites become Rust + Docker daemon running (docker CLI/compose no longer needed by the app); dev/build/test commands unchanged (`cargo build --release`, `dx serve`, `cargo test --test integration`); note first-run extraction + `.devwp-tauri` migration. Update `docs/architecture.md` docker-communication and storage sections (extracted config, data-dir state).

## Validation

- `cargo fmt --check` && `cargo clippy -- -D warnings` && `cargo test` (compose unit tests).
- `cargo test --test integration` against a compose-provisioned stack (CI) — status listing, xdebug toggle, wp-cli.
- Manual pass: fresh start with no images (pull path + build path for php/nginx, `~/www` bind, log streaming into BuildLog); second launch (no recreate, existing containers reused); stop mid-health-check (error state); xdebug toggle restarts php via API; create site (mkcert unchanged, nginx `-t` + reload via exec, /etc/hosts); wp-cli `--info` and composer update with auth.json; close app → containers stopped+removed, volumes/network kept, DB survives relaunch; delete `~/.config/devwp` + state dir → clean re-extract; keep repo `.devwp-tauri` until migration copy verified.
- Ledger check: `grep -rn 'run_command\|"docker' src/` returns nothing.

## Risks

| Risk | Mitigation |
|---|---|
| Health timeout vs `start_period: 40s` (php) | 90 s wait cap per dependency (30 s from the old plan is a misconfig) |
| `build_image` needs a tar stream; untracked 3.4 GB SQL dumps under `config/mariadb/files/` | Tar only the extracted config dir, which never contains gitignored data (selective embed); dumps stay a dev-machine-local fixture the extracted config doesn't ship |
| `serde_yaml` archived | Works today; drop-in `serde_yaml_ng`/`serde_yml` fallback keeps the same API if a problem appears |
| Pull/build streams are long-running | Streamed to `build_logs_signal` with existing 500-line cap; UI already renders it |
| Existing compose-created containers lack bollard-created labels | They already carry `com.docker.compose.project=devwp`; label filter covers both old and new stacks |
| Health polling cost (inspect per running container every ~1 s) | Inspect only running containers; version cache unchanged |
