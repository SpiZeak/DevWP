# Architecture

DevWP is a pure-Rust desktop application built with the Dioxus framework
(0.7, desktop feature) running in a WebKitGTK (Linux) / WebView2 (Windows) /
WKWebView (macOS) webview. There is no JavaScript frontend and no IPC layer:
the RSX UI calls the Rust backend functions directly.

## Layer overview

```
src/main.rs            entry point: window config and icon
src/app.rs             root component: compose-up on launch, close interception
src/state.rs           global SyncSignal state (cross-thread safe)
src/assets.rs          embedded CSS + fonts served through the custom protocol
src/backend/           pure Rust functions (docker, site, settings, wp_cli, xdebug, system, lifecycle)
src/components/        RSX components (services, site list, modals, ui primitives)
tests/integration.rs   backend tests against the real compose stack
```

## State management

All shared state lives in process-wide signals declared with the
`sync_state!` / `global_value!` macros in `src/state.rs` (a `SyncSignal`
behind a `OnceLock`, exposed through accessor functions):

- `containers_signal` — Docker Engine API container listing (project label filter)
- `building_services_signal` — service → building flag
- `service_progress_signal` — service → startup phase + aggregate percent (Services panel progress bars)
- `docker_status_signal` — status banner (idle/starting/complete/error/stopping/stopped)
- `build_logs_signal` — `[{service}] {line}` strings, ANSI-stripped, capped at 500
- `notifications_signal` — one-way toasts (auto-dismissed by the UI)
- `xdebug_enabled_signal` / `xdebug_toggling_signal` — xdebug switch state
- `sites_signal` / `sites_loading_signal` — the site list
- `shutdown_done_signal` — close-lifecycle flag

`SyncSignal` uses thread-safe storage, so background threads (docker log
readers, certificate threads, tokio tasks) can write it. `init_globals()` in
`app.rs` creates every signal in the root scope so they outlive all child
components.

## Backend functions

`src/backend/*` mirrors the old Tauri command surface one-to-one
(`get_container_status`, `create_site`, `run_wp_cli`, `toggle_xdebug`, …),
with `#[tauri::command]` and the `AppHandle` parameter removed. Events are
replaced by signal writes:

| Before (Tauri)             | After (Dioxus)                              |
| -------------------------- | ------------------------------------------- |
| `app.emit("notification", …)` | `state::push_notification(type, msg)`     |
| `app.emit("docker-log", …)`   | `state::push_build_log(service, line)`    |
| `listen("container-status")`  | reading `state::containers()` reactively  |
| `invoke("create_site", {..})` | `spawn(async { site::create_site(req).await })` |

Blocking work is wrapped in `tokio::task::spawn_blocking`. Docker access goes
through the Bollard SDK (`src/backend/docker.rs`) on a dedicated per-call
tokio runtime — no `docker` CLI is spawned. `src/backend/compose.rs` parses
the repo's `compose.yml`, and `lifecycle.rs` orchestrates the stack (network,
volumes, image build/pull, container create/start in `depends_on` order with
health gates). Build/pull progress streams into `BUILD_LOGS`. See
`docs/bollard-migration-plan.md` for the full command→API mapping.

## Lifecycle

- **Startup** — `app.rs` mounts, `lifecycle::start_services()` marks the four
  services as building and orchestrates the stack through the Docker Engine
  API (ensure network/volumes, rebuild web with `--pull` and refresh
  pulled images, create/start containers in dependency order, wait for
  dependency health), then refreshes container status.
- **Shutdown** — the window starts in `WindowCloseBehaviour::WindowHides`.
  `use_wry_event_handler` observes `CloseRequested` and spawns
  `lifecycle::stop_services()` (stop + remove project containers; volumes and
  the network are kept). When it finishes,
  `shutdown_done()` flips and the root component switches the window to
  `WindowCloses` and closes it — teardown always completes before exit.

## Assets

Everything the webview needs is embedded in the binary:

- `src/assets/style.css` — the prebuilt Tailwind v4 bundle (rebuilt via
  `scripts/build-css.sh`, committed)
- `src/assets/fonts/*.woff2` — Monaspace Neon Nerd Font set (4 weights:
  regular/medium/semibold/bold — the ones the UI uses)
- `src/assets/icon_32.png` — window icon (`icon_from_memory`)

The stylesheet is injected as a plain `link` element pointing at
`/assets/style.css`. `app.rs` registers a `use_asset_handler("assets", …)`
that answers those paths on the webview's own `dioxus://` scheme — same
origin as the page, so WebKitGTK loads them (a *separate* custom scheme
would be cross-origin and WebKitGTK never delivers cross-origin
custom-scheme subresources). The relative font URLs inside the CSS resolve
to `/assets/fonts/*` and are served from the same handler. This works
identically under `cargo run`, release binaries, and every packaged bundle.

## Packaging & CI

- Bundling: `cargo packager --release` (config in `[package.metadata.packager]`).
- CI (`pr.yml`, `test.yml`): `cargo fmt --check` + `cargo clippy -- -D warnings`
  + `cargo test`; the integration job runs against the compose stack.
- Releases (`release.yml`): cargo-packager matrix per platform, artifacts
  published to GitHub Releases; `aur-deploy.yml` pushes the AppImage to AUR.

## The web stack (FrankenPHP)

The `web` service (`devwp_web`, image `devwp-web`) is a single
[FrankenPHP](https://frankenphp.dev) container: Caddy with an embedded
PHP 8.5 (ZTS) interpreter. It replaced the previous `devwp_php` (php-fpm) +
`devwp_nginx` (custom nginx/LibreSSL build) pair, so PHP execution and web
serving share one process (base image pinned in `config/frankenphp/Dockerfile`).

- **Config layout** — the global Caddyfile is mounted read-only at
  `/etc/frankenphp/Caddyfile`; DevWP generates one `<domain>.caddy` file per
  site into `config/frankenphp/sites-enabled/` (mounted at
  `/etc/frankenphp/Caddyfile.d/`) from `template-site.caddy`. Caddy state
  lives in `/tmp/caddy` (the Caddyfile relocates `storage` there because
  `/data`/`/config` are root-owned tmpfs). The admin endpoint on
  `localhost:2019` backs the healthcheck, config reloads
  (`caddy validate` + `caddy reload` via Bollard exec) and worker restarts
  (`POST /frankenphp/workers/restart`).
- **`/usr/local/bin/php` shim** — `frankenphp php-cli` rejects the `-d` flag,
  so the shim strips `-d` pairs and points `PHP_INI_SCAN_DIR` at
  `/usr/local/etc/php/cli-extra` (which carries the WP-CLI `error_reporting`
  value DevWP used to pass via `-d`). WP-CLI, composer and `php -r` probes
  therefore run unchanged inside `devwp_web`.

### Worker mode (experimental, opt-in per site)

Sites default to classic mode (one full PHP execution per request, exactly
like php-fpm). The edit/create dialogs expose an opt-in "PHP Worker Mode":
`template-worker.php` is rendered per site into
`config/frankenphp/workers/<domain>.php` and referenced from the site's
Caddyfile via a `worker <file> 2` line inside `php_server`.

The worker boots WordPress once per worker thread (`require wp-load.php`,
never `wp-blog-header.php` — its `require_once` guards would fatal on the
second request) and then loops over `frankenphp_handle_request()`. Each
request resets: superglobals arrive fresh from FrankenPHP;
`wp_magic_quotes()` (boot-time only in core, never inside `wp()`);
`$GLOBALS['current_user'/'wp_styles'/'wp_scripts'/'wp_filesystem']`;
`$wpdb->flush()`; the `$wp_filter` registry (restored from a boot snapshot of
cloned `WP_Hook` objects — a shallow copy would share the mutable objects);
and the object cache (`wp_cache_init()`). Workers recycle after 200 requests,
when memory passes 80% of the limit, or when WordPress calls `exit()`
(accepted v1 trade-off: redirects recycle workers). Mutating wp-cli commands
(`plugin|theme` `install|activate|deactivate|delete|update`) trigger a worker
restart so the change takes effect. Multisite sites refuse worker mode.

Known caveats: `MAGICK_THREAD_LIMIT=1` is baked into the image (imagick's
OpenMP threads crash FrankenPHP); Xdebug develop/profile modes work under
workers, step debugging requires worker mode off; plugin static-state leaks
are possible (the per-site toggle is the escape hatch).
