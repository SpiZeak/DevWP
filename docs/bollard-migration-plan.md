# Bollard Migration Plan — replacing the docker CLI with the Docker Engine API

Status: **executed** (see "Phased rollout" below; each phase landed as one unit on this
branch). All `docker` / `docker compose` invocations in the app binary were replaced by
[Bollard](https://crates.io/crates/bollard) (Docker Engine API over the local unix
socket / named pipe). The CLI remains in use **only** outside the app binary:
CI provisioning (`pr.yml` / `test.yml`), docs, and the mkcert/hosts elevation helpers,
which are not Docker operations.

## 1. Inventory of current docker-cli usage (pre-migration)

| # | Site | Command | Purpose |
|---|------|---------|---------|
| 1 | `src/backend/docker.rs` `get_container_status` | `docker compose ps --format … -a` | List project containers + health for the Services panel (~1 s poll) |
| 2 | `src/backend/docker.rs` `get_container_version` | `docker exec <name> <cmd>` | Per-service version probes (php/nginx/mariadb/redis/mailpit), cached in `VERSION_CACHE` |
| 3 | `src/backend/docker.rs` `restart_container` | `docker restart <id>` | Services-panel restart button |
| 4 | `src/backend/lifecycle.rs` `start_services` | `docker compose up -d nginx` (streaming) | App launch: build/pull + create/start with dependency health waits |
| 5 | `src/backend/lifecycle.rs` `stop_services` | `docker compose down` | App close: stop + remove project containers |
| 6 | `src/backend/wp_cli.rs` `run_wp_cli` | `docker exec -w <dir> devwp_php php -d … /usr/local/bin/wp …` | WP-CLI runner |
| 7 | `src/backend/wp_cli.rs` `extract_error` | same + `--debug` | WP-CLI empty-output retry |
| 8 | `src/backend/wp_cli.rs` `run_composer_update` | `docker exec -w <dir> [--env-file …] devwp_php composer update` | Composer update; `COMPOSER_AUTH` via temp env-file (mode 600) |
| 9 | `src/backend/xdebug.rs` `toggle_xdebug` | `docker compose restart php` | Apply xdebug.ini change |
| 10 | `src/backend/site.rs` `nginx_reload` | `docker exec devwp_nginx nginx -t` / `nginx -s reload` | Validate config, then reload |
| 11 | `src/backend/site.rs` `install_wordpress` | `docker exec -w … devwp_php php … wp core download/config create/install` + `docker exec devwp_mariadb mariadb -e "CREATE DATABASE …"` | WordPress provisioning |
| 12 | `tests/integration.rs` `docker_available` | `docker info` | Skip-probe for integration tests |

Non-goals (unchanged by this migration): `mkcert`, `pkexec`/`osascript`/`powershell`
hosts-file elevation, `xdg-open`; the XDG config/state move and embedded-config
extraction remain future work (`.kilo/plans/1786534980549-bollard-orchestration-migration.md`).

## 2. Command → Bollard mapping

New module `src/backend/compose.rs` parses the repo's `compose.yml` (with `${UID:-1000}`
expansion) into typed `ServiceConfig`s; `src/backend/docker.rs` holds all Bollard calls.
Every Bollard op runs inside a dedicated current-thread tokio runtime
(`docker_block_on`) created per call, so the sync call sites (spawn_blocking bodies,
sync fns like `nginx_reload`) keep their shape.

| CLI command | Bollard counterpart | Wrapper |
|---|---|---|
| `docker compose ps -a` | `list_containers` (filter `label=com.docker.compose.project=devwp`, `all=1`) + `inspect_container` per container to merge `state.health.status` (`ContainerSummary` has no health) | `get_container_status()` |
| `docker exec <c> <cmd…>` | `create_exec` (`cmd`, `working_dir`, `env`) → `start_exec` → demux `LogOutput` stream into stdout/stderr → `inspect_exec` (retried) for `exit_code` | `exec_in_container()` → `ExecOutput { stdout, stderr, exit_code }` |
| `docker restart <id>` | `restart_container(id, None)` | `restart_container()` (async signature kept) |
| `docker compose up -d nginx` | ensure `devwp_default` network (`inspect_network`→`create_network`), ensure volumes `devwp_mariadb`/`devwp_redis` (`list_volumes`→`create_volume`), per service in topological order: `inspect_image` → missing? `build_image` (tar of `config/<svc>` context, `BuildInfo` stream → build log, tag `devwp-<svc>`) or `create_image` (`CreateImageInfo` stream → build log) → `create_container` (compose labels, binds, ports, env, healthcheck, tmpfs, log config, network aliases) or **adopt existing by name** → `start_container` → wait dependencies `healthy` (90 s cap, 2 s poll) | `lifecycle::start_services()` |
| `docker compose down` | `list_containers` (project label, all) → `stop_container(t=10s)` → `remove_container(force)`; **keep** volumes + network (deliberate divergence: cheaper restart, data survives) | `lifecycle::stop_services()` |
| `docker compose restart php` | `restart_container("devwp_php", None)` | `xdebug::toggle_xdebug` |
| `docker info` (test probe) | `ping()` | `docker::docker_daemon_available()` |

Compatibility invariants (both directions of rollback):
- containers created by the app carry the **full compose discovery label set**
  (`com.docker.compose.project`, `service`, `container-number`, `oneoff`,
  `config-hash`, `version`, `depends_on` — empirically, compose v5's
  `ps`/`down`/`up` discovery ignores project+service-only containers and `up`
  then fails on the fixed container name), fixed `container_name`s, and live
  on network `devwp_default` with service-name aliases;
- verified live: `docker compose ps` lists app-created containers, and
  `docker compose up -d <svc>` cleanly **recreates** them (the placeholder
  config-hash always diverges, so a CLI `up` after an app start takes
  ownership with a one-time recreate — volumes/network/data untouched);
- built images are tagged `devwp-php` / `devwp-nginx` (compose v2+ v5's
  `<project>-<service>` convention, so CLI-built images are reused);
- volumes `devwp_mariadb` / `devwp_redis` are never removed by the app.

Known divergences from compose (documented, acceptable):
- a container is **never recreated** when `compose.yml` changes — `up` starts existing
  containers as-is (edit → app close/open to apply);
- `down` keeps the network;
- bind-mount host paths resolve `~` via `$HOME` and `./` via the project root,
  exactly as compose does.

## 3. Error handling and edge scenarios

| Scenario | Handling |
|---|---|
| Daemon down / socket unreachable | Connection error mapped to `Docker daemon not reachable` (status banner Error; probes return `None`; `docker_daemon_available()` gates tests) |
| Image pull fails (offline, bad tag) | `CreateImageInfo.error` on the stream → `Err` with detail; progress lines already pushed to build log |
| Image build fails | `BuildInformation.error/errorDetail` → `Err`; stream lines pushed |
| Port already allocated on start | `start_container` 500 surfaced verbatim (parity with compose failure) |
| Container name conflict on create (409) | Treated as *adopt*: start if not running (parity with `compose up` on existing stack) |
| Network/volume already exists | Inspect/list first; create only if missing; concurrent "already exists" errors ignored |
| Exec into stopped container | `create_exec`/`start_exec` error string surfaced; version probe → `None` (previous behavior) |
| Exec exit code not yet written after stream end | `inspect_exec` retried up to 10 × 100 ms until `exit_code` is set |
| `nginx -v` writes to stderr; php/mailpit exit non-zero with usable output | Demuxed `ExecOutput` keeps stdout/stderr split; per-probe `use_stderr` / `ignore_failure` flags preserved |
| WP-CLI non-zero exit with empty output | `--debug` re-run kept (now via exec) to flush its buffer |
| Dependency never healthy | Fail fast on `unhealthy`; 90 s cap on `starting`/no-healthcheck (php `start_period: 40s` → 30 s would misfire); error names the service and last status |
| Invalid/edited `compose.yml` | Parse error fails startup before any Docker mutation |
| Non-UTF-8 exec output | `from_utf8_lossy` (parity) |
| Stopped containers listed | `all=1` filter (parity with `-a`) |
| Health of exited containers | Reported `None` (matches CLI `{{.Health}}` blank for stopped) |
| `COMPOSER_AUTH` secrecy | Passed as exec `env` (travels over the Docker API socket, never in child-process argv) — temp env-file dance deleted |
| Slow exec/build/pull (wp core download, composer) | Per-op client timeouts (inspect ops 30 s, exec 900 s, build/pull 1800 s) |

## 4. Testing strategy

- **Unit (`cargo test --lib --bins`, no Docker):** `compose.rs` parses the embedded
  `compose.yml`: 5 services, container names, map+list env forms, YAML bool → `"true"`,
  `443:443/udp` port key, `depends_on` conditions, both healthcheck `test` forms,
  string-vs-list `command`, bind/named-volume forms, `tmpfs`, `${UID:-1000}` fallback,
  duration parsing, topological ordering, env stringification. `docker.rs` keeps unit
  tests for `ContainerState`/version parsers; `parse_compose_ps` (CLI-output parser)
  was deleted with its tests.
- **Integration (`cargo test --test integration`, live daemon, skips when absent):**
  skip-probe swapped to `docker::docker_daemon_available()` (Bollard `ping`); the four
  Docker tests now exercise the Bollard paths directly: status listing (incl. health
  merge + version exec), xdebug toggle (API restart), WP-CLI exec (demux + exit code),
  plus a new full-stack `bollard_orchestration_down_and_up_roundtrip` (API teardown →
  `lifecycle::start_services` rebuild → all five running; Docker-touching tests
  serialize on a lock and share one Dioxus runtime thread).
- **CI stays CLI-provisioned** (`docker compose up -d nginx` in `pr.yml`/`test.yml`):
  intentional — it proves the app's Bollard code adopts a CLI-created stack, which is
  also the rollback path.
- **Manual pass (checklist):** first run with no images (build php/nginx + pull three
  images, log streaming); second launch (adopt, no rebuild); daemon stopped at launch
  (error banner, no hang); unhealthy dependency (error, no dependent start); site
  create (nginx `-t` + reload via exec); wp-cli/composer; app close (stop+remove,
  volumes/network kept, DB survives relaunch); rollback build (CLI binary) against the
  Bollard-created stack.
- Ledger: `grep -rn 'run_command_streaming\|Command::new("docker"\|"compose", "up"\|"compose", "down"' src/` → no matches; `run_command` survives only for mkcert.

## 5. Phased rollout and rollback

Each phase is an independently revertible unit (commit-sized) ordered so the risky
cutover is small and late:

| Phase | Content | Revert = |
|---|---|---|
| 0 | `Cargo.toml`: add `bollard`, `futures-util`, `tar`, `serde_yaml`; tokio → `full` features | drop deps |
| 1 | `src/backend/compose.rs` parser + unit tests (pure addition) | delete module |
| 2 | `docker.rs` Bollard core (exec, status, restart) + switch all `docker exec` call sites (wp_cli, site, xdebug). Lifecycle up/down still CLI at this point | revert `docker.rs` + call-site files; CLI behavior unchanged |
| 3 | Lifecycle up/down via Bollard orchestration; delete `run_command_streaming` | revert `lifecycle.rs` (+ re-add streaming helper); exec sites from phase 2 unaffected |
| 4 | Integration probe swap + docs (README prerequisites, `docs/architecture.md`, `AGENTS.md`) | docs only |

Rollback considerations:

- **Data**: volumes/network are never destroyed by either version; MariaDB data and
  certs survive any rollback. `down` semantics identical (stop + remove containers).
- **Naming**: the app pins the compose project identity to `devwp` (labels,
  network `devwp_default`, volumes `devwp_mariadb`/`devwp_redis`, build tags
  `devwp-php`/`devwp-nginx`) regardless of the checkout directory — the CLI
  derived it from the directory name, so a worktree checkout previously
  produced `marbled-roast_*` resources. The fixed identity matches the
  canonical checkout and CI naming.
- **Interop**: all created resources use compose-identical names and the full
  compose discovery label set (§2) — verified live that a CLI `compose ps`
  sees an app-created stack and `compose up` recreates containers under its
  own config-hash (one-time, data-preserving), so `git revert` of any phase is
  safe with the stack running.
- **Feature risk concentrated in phase 3** (orchestration); phases 0–2 are behavior-
  preserving rewrites of exec/ps/restart with the same public function signatures, so
  UI code never changes.
- If Bollard proves unusable on a platform (e.g. named-pipe regression on Windows),
  reverting phases 2–3 restores the CLI paths without touching data or state.
