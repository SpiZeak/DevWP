# Architecture

DevWP is a pure-Rust desktop application built with the Dioxus framework
(0.7, desktop feature) running in a WebKitGTK (Linux) / WebView2 (Windows) /
WKWebView (macOS) webview. There is no JavaScript frontend and no IPC layer:
the RSX UI calls the Rust backend functions directly.

## Layer overview

```
src/main.rs            entry point: window config, icon, custom "devwp://" asset protocol
src/app.rs             root component: compose-up on launch, close interception
src/state.rs           global SyncSignal state (cross-thread safe)
src/assets.rs          embedded CSS + fonts served through the custom protocol
src/backend/           pure Rust functions (docker, site, settings, wp_cli, xdebug, system, lifecycle)
src/components/        RSX components (services, site list, modals, ui primitives)
tests/integration.rs   backend tests against the real compose stack
```

## State management

All shared state lives in process-wide signals declared with the
`sync_state!` macro in `src/state.rs` (a `SyncSignal` behind a `OnceLock`):

- `CONTAINERS` — `docker compose ps` results
- `BUILDING_SERVICES` — service → building flag
- `DOCKER_STATUS` — status banner (idle/starting/complete/error/stopping/stopped)
- `BUILD_LOGS` — `[{service}] {line}` strings, ANSI-stripped, capped at 500
- `NOTIFICATIONS` — one-way toasts (auto-dismissed by the UI)
- `XDEBUG_ENABLED` / `XDEBUG_TOGGLING` — xdebug switch state
- `SITES` / `SITES_LOADING` — the site list
- `SHUTDOWN_DONE` — close-lifecycle flag

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

Blocking work is wrapped in `tokio::task::spawn_blocking`; long-running
streams (`docker compose up -d`) stream into `BUILD_LOGS` via
`run_command_streaming`.

## Lifecycle

- **Startup** — `app.rs` mounts, `lifecycle::start_services()` marks the five
  services as building and runs `docker compose up -d nginx` (streaming logs),
  then refreshes container status.
- **Shutdown** — the window starts in `WindowCloseBehaviour::WindowHides`.
  `use_wry_event_handler` observes `CloseRequested` and spawns
  `lifecycle::stop_services()` (`docker compose down`). When it finishes,
  `shutdown_done()` flips and the root component switches the window to
  `WindowCloses` and closes it — compose-down always completes before exit.

## Assets

Everything the webview needs is embedded in the binary:

- `src/assets/style.css` — the prebuilt Tailwind v4 bundle (rebuilt via
  `scripts/build-css.sh`, committed)
- `src/assets/fonts/*.woff2` — Monaspace Neon Nerd Font set (42 files)
- `src/assets/icon_32.png` — window icon (`icon_from_memory`)

`main.rs` registers a `devwp://` custom protocol (`assets.rs::serve`) that
answers `devwp:///assets/style.css` and the relative font URLs it references.
This works identically under `cargo run`, release binaries, and every
packaged bundle.

## Packaging & CI

- Bundling: `cargo packager --release` (config in `[package.metadata.packager]`).
- CI (`pr.yml`, `test.yml`): `cargo fmt --check` + `cargo clippy -- -D warnings`
  + `cargo test`; the integration job runs against the compose stack.
- Releases (`release.yml`): cargo-packager matrix per platform, artifacts
  published to GitHub Releases; `aur-deploy.yml` pushes the AppImage to AUR.
