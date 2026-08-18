# DevWP

A pure-Rust desktop application (Dioxus 0.7, desktop) for simplified local
WordPress development using Docker, Nginx, and PHP-FPM. The React/TypeScript
Tauri frontend was migrated to a single Rust binary: RSX components call backend
functions directly (no IPC, no Node toolchain), state lives in process-wide
`SyncSignal`s, and Tailwind v4 CSS is prebuilt and committed.

## Tech Stack

- Language: Rust (edition 2021, MSRV `1.83` per `Cargo.toml`; CI builds on stable)
- Framework: Dioxus 0.7 `desktop` feature — WebKitGTK (Linux) / WebView2 (Windows) / WKWebView (macOS) webview
- Package manager: `cargo` (no Node toolchain for the app; Tailwind CLI is a standalone binary)
- Key deps: `dioxus`, `rfd` (file dialogs), `serde`/`serde_json`, `shell-words`, `tokio` (rt only), `tracing`
- Infra: Docker Compose stack — `nginx`, `php-fpm`, `mariadb`, `redis`, `mailpit` (see `compose.yml`)
- Packaging: `cargo-packager` (config in `[package.metadata.packager]`); AUR publish via `.github/workflows/aur-deploy.yml`
- DB: MariaDB, host `devwp_mariadb`, creds hardcoded as constants (see Env / Config)

## Commands

| Task                | Command                                                              |
| ------------------- | -------------------------------------------------------------------- |
| Run (dev)           | `cargo run`                                                          |
| Build (release)     | `cargo build --release`                                              |
| Typecheck           | `cargo check --all-targets`                                          |
| Lint                | `cargo clippy --all-targets -- -D warnings`                          |
| Format (check)      | `cargo fmt --all -- --check`                                         |
| Format (write)      | `cargo fmt --all`                                                    |
| Test (unit)         | `cargo test --lib --bins`                                            |
| Test (integration)  | `cargo test --test integration` (needs Docker + compose stack up)    |
| Test (all)          | `cargo test`                                                         |
| Rebuild CSS         | `scripts/build-css.sh` (downloads Tailwind v4.3.0 CLI on first run)  |
| Regenerate icons    | `python3 scripts/build-icon.py` (needs Pillow; rewrites all 5 assets) |
| Trusted certs       | `./scripts/setup-certs.sh` (mkcert)                                  |
| Package installers  | `cargo install cargo-packager --locked && cargo packager --release`  |

## Architecture

```
src/
├── main.rs            entry point: window config, icon, frameless + close behaviour
├── lib.rs             module declarations; crate-level Dioxus lint allows (do not remove)
├── app.rs             root component: compose-up on launch, close interception/shutdown
├── state.rs           process-wide SyncSignal globals (thread-safe; background threads write here)
├── assets.rs          embedded CSS + fonts served via the dioxus:// asset handler
├── assets/            committed Tailwind v4 bundle (style.css), fonts/*.woff2, theme.css
├── backend/           pure Rust functions, no IPC; mirrors the old Tauri command surface
│   ├── docker.rs      container status + compose lifecycle
│   ├── lifecycle.rs   start/stop services, shutdown coordination
│   ├── site.rs        create/edit/delete sites, nginx configs, /etc/hosts, certs
│   ├── settings.rs    settings.json CRUD
│   ├── wp_cli.rs      WP-CLI execution inside the php container
│   ├── xdebug.rs      toggle xdebug on/off
│   ├── system.rs      host system info
│   └── utils.rs       project_root, run_command(_streaming), notifications, DB consts
├── components/        Dioxus RSX components
│   ├── ui/            primitives: form_input, icon, modal_base, spinner, toggle
│   ├── site_list / site_item / site_info / create_site / edit_site
│   ├── services / settings / versions / build_log / composer
│   ├── wp_cli / xdebug_switch / notifications / brand_logo / title_bar
└── (tests/integration.rs at repo root: backend tests vs the real compose stack)
```

State files live in `.devwp-tauri/` (`sites.json`, `settings.json`); the webroot
defaults to `~/www`. Both are gitignored. See `docs/architecture.md` for the
full layer/state/lifecycle/asset writeup.

## Conventions

- Naming: `snake_case` functions/vars, `PascalCase` types, flat modules under `backend/` and `components/`.
- Error handling: backend fns return `Result<T, String>` with `.map_err(|e| format!("...: {e}"))` — string errors, no `anyhow`/`thiserror`. Results surface to the UI as `OperationResult { success, message, error }` and/or `state::push_notification(type, msg)`. Blocking work wraps in `tokio::task::spawn_blocking`; long streams use `run_command_streaming` into `BUILD_LOGS`.
- State: cross-thread state via `SyncSignal` + the `sync_state!`/`global_value!` macros in `state.rs`. `init_globals()` (called in `app.rs` root scope) creates every signal in the root scope so storage outlives child scopes. UI-only state stays in local `Signal`s.
- Tests: unit tests are inline `#[cfg(test)] mod tests` inside `src/` modules. Integration tests in `tests/integration.rs` call the backend directly (no IPC), skip gracefully when Docker is unavailable, and isolate state to a temp dir via `with_test_state()` / `set_test_mode(true)`.
- `src/lib.rs` carries `#![allow(unused_braces, clippy::clone_on_copy)]` — these are intentional and documented (Dioxus RSX requires braces for expression children; signal handles are `Copy`). Do not remove them.
- Doc comments (`///`) on public items are the norm; otherwise add comments only where the *why* is non-obvious.
- No `dbg!`/`println!`/`eprintln!` in `src/` — use the `tracing` logger (`dioxus::logger::init`). CI warns on debug statements (`pr.yml`).

## Env / Config

Env vars the Rust code actually reads (from grepping `std::env`/`env::var`):

| Var | Where | Default / notes |
| --- | --- | --- |
| `HOME` | `site.rs`, `utils.rs::home_dir`, `wp_cli.rs` (composer auth) | Falls back to `USERPROFILE`, then `.` |
| `USERPROFILE` | `utils.rs::home_dir` | Windows fallback for `HOME` |
| `PATH` | `site.rs` (locate host binaries) | Host PATH |
| `WEBKIT_DISABLE_DMABUF_RENDERER` | `main.rs` **sets** it to `"1"` on Linux | Nvidia DMA-BUF workaround; not read from outside |
| `XDG_CACHE_HOME` | `scripts/build-css.sh` | Tailwind CLI cache; defaults to `$HOME/.cache` |
| `UID` / `GID` | `compose.yml` Docker build args (php/nginx user mapping) | default `1000` |

No app env vars are required and none are secrets. Database credentials are
**hardcoded constants**, not env: `DB_ROOT_USER`/`DB_ROOT_PASSWORD` = `"root"`/
`"root"` in `src/backend/utils.rs:11-12`, and must match
`MARIADB_ROOT_PASSWORD: root` in `compose.yml:39`.

`.env.example` is **stale**: it documents `NODE_ENV`, `LOG_LEVEL`,
`LOG_MAX_FILES`, `AUTO_UPDATE_CHECK`, `CRASH_REPORTING` — none of which the
Rust code reads (leftovers from the Tauri/Node era). Only `UID`/`GID` are
still relevant (and only to compose). Proposal: trim `.env.example` to just
`UID`/`GID` — not done here without sign-off.

## Gotchas

- **No `rust-toolchain.toml`**: MSRV `1.83` is declared in `Cargo.toml`; CI uses `dtolnay/rust-toolchain@stable`. The local checkout is on nightly — fine, but don't rely on nightly-only features if targeting MSRV.
- **Linux native deps required to build**: `libwebkit2gtk-4.1-dev` (mandatory), plus `libappindicator3-dev`, `libxdo-dev` (linker `-lxdo` from `libxdo-sys`/`global_hotkey`), `librsvg2-dev`, `patchelf` for packaging. Without these `cargo build`/`cargo run` fails on Linux. CI installs them in every workflow.
- **Integration tests are side-effectful**: `cargo test --test integration` runs `docker compose up -d nginx` (may build images, slow on first run) and mutates the local Docker stack (toggles xdebug, runs `wp --info`). They skip gracefully when Docker is absent, but with Docker present they act on the real compose stack — run deliberately, not as a fast loop.
- **DB creds are hardcoded** in `src/backend/utils.rs` and must stay in sync with `compose.yml` (both `root`/`root`). Changing one without the other breaks DB access.
- **State dir is `.devwp-tauri/`** (gitignored). Integration tests redirect it to a temp dir via `set_test_mode(true)`; never have unit/integration tests touch the developer's real state.
- **Tailwind CSS is prebuilt and committed** (`src/assets/style.css`). After changing any class names in `src/**/*.rs`, run `scripts/build-css.sh` and commit the regenerated `style.css` — otherwise the UI won't reflect the change. The script downloads the standalone Tailwind v4.3.0 CLI into `$XDG_CACHE_HOME` on first use (network fetch).
- **`.env.example` is stale** (see Env / Config) — don't trust its var list as authoritative.
- **Git submodules**: CI checks out with `submodules: recursive`; `.gitmodules` is present.
- **`compose.yml` mounts host paths**: `~/www` (webroot), `~/.ssh`, `~/.config/composer` are bind-mounted — they must exist on the host for the stack to behave.
- **No automated UI/E2E runner**: the app is a desktop webview (WebKitGTK/WebView2/WKWebView). Chrome DevTools MCP cannot attach to it. UI changes are verified manually via `cargo run`.

## Verification Checklist

Run these before claiming done (CI gate in `pr.yml` / `test.yml`):

```sh
cargo fmt --all -- --check          # format
cargo check --all-targets           # typecheck
cargo clippy --all-targets -- -D warnings   # lint (warnings are errors)
cargo test --lib --bins             # unit tests (fast, no Docker)
cargo build --release               # production build is the ground truth for packaging
# only when the compose stack is intended to run (slow, side-effectful):
cargo test --test integration
```

Confirmed passing on this checkout: fmt PASS, check PASS, clippy PASS,
`cargo test --lib --bins` → 13 passed / 0 failed. Integration skipped (requires
compose stack; side-effectful on local Docker).

## E2E / UI Verification

Following global AGENTS.md §14:

- **Run dev server**: `cargo run` (launches the frameless 1200×800 webview window; starts the compose stack on launch)
- **E2E runner**: none. No playwright/cypress/puppeteer; the desktop webview (WebKitGTK/WebView2/WKWebView) is not drivable by chrome-devtools MCP.
- **Seed/fixture command**: none — app state is the developer's `.devwp-tauri/` + `~/www`. Integration tests use temp-dir test mode (`set_test_mode(true)`); unit tests need no seed.
- **Viewports**: n/a (fixed window 1200×800, min 800×600 — not a responsive web target).
- **Browser tool**: chrome-devtools MCP is **not applicable** to this desktop webview.
- **Screenshots**: n/a.
- **UI verification is manual**: after a UI change, `cargo run`, exercise the affected screen (create/edit site, services panel, settings, wp-cli, xdebug toggle, title-bar controls), confirm no `tracing` error logs, then rebuild CSS if classes changed. Backend logic backing a UI change should additionally be covered by a unit or integration test in `tests/integration.rs`.
