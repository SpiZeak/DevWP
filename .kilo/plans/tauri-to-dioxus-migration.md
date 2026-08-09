# Plan: Migrate DevWP from Tauri to Dioxus Desktop (revised)

## Summary

Replace the Tauri (Rust backend + React/TypeScript renderer) architecture with a pure-Rust
Dioxus desktop app. All React components become Dioxus RSX components, Tauri IPC/events become
direct Rust calls + `GlobalSignal`s, and packaging moves from `tauri build` to `cargo-packager`.
The Node/TypeScript toolchain (Vite, bun, vitest, biome, tauri CLI) is removed entirely; the
Tailwind v4 CSS build is handled by the `dioxus-tailwindcss` crate (or a committed prebuilt CSS).

**Decisions (resolved):**
- **Test strategy: Rust-only.** Port backend logic tests to `cargo test`; add Rust integration
  tests that call backend fns directly against the real compose stack; delete the ~1,900 lines of
  React/vitest suites, vitest configs, coverage tooling, and the coverage PR-comment job. CI
  becomes `cargo fmt --check` + `cargo clippy` + `cargo test`.
- **Node teardown:** remove `package.json`, `bun.lock`, `tsconfig*.json`, `biome.json`,
  `vite.config.ts`, `vitest.config*.ts`, `.npmrc`. Dev/build/test/format commands move to cargo/
  `dx`.
- **Artifact naming:** align all consumers on one convention. Tauri today publishes
  `DevWP_x.x.x_amd64.AppImage` (release body) but AUR downloads `dev-wp_x.x.x_amd64.AppImage`
  — inconsistent, and AUR is currently broken. Set the Cargo package name so cargo-packager emits
  `devwp_x.x.x_amd64.AppImage` (or an equivalent single name), and update `release.yml`, the
  release notes body, `aur-deploy.yml`, and the AUR PKGBUILD sed patterns to match.

**Architecture:**

```
Before (Tauri):                    After (Dioxus Desktop):
┌──────────────────┐               ┌──────────────────────┐
│  React (TS/TSX)  │               │  Dioxus RSX (Rust)   │
│  invoke()/emit() │  IPC/Events   │  direct fn calls     │
└────────┬─────────┘◄────────────► │  Signals             │
         │                         └───────────┬──────────┘
┌────────┴─────────┐               ┌───────────┴──────────┐
│  Rust backend    │               │  Rust backend logic  │
│  (tauri commands)│               │  (pure async fns)    │
└──────────────────┘               └──────────────────────┘
```

## Phase 0: Version pinning & API verification spike

- [ ] **0.1** Pin Dioxus to the current stable on crates.io (the Tauri codebase predates it;
  verify the live version — 0.6/0.7/0.8 differ). Verify against *that* version:
  - `Signal::global_sync` exists and is `Send + Sync` (cross-thread mutation).
  - Close interception API: `Window::on_close` (0.6) vs `use_close_event` (0.7+, returns
    prevent-close bool).
  - `spawn`/`spawn_blocking` for background work; `use_effect`, `use_resource`, `use_memo`.
  - `dioxus-tailwindcss` configuration and required Node/tailwind binary.
- [ ] **0.2** Spike: single `main.rs` rendering a window with correct title/size/min-size via
  `dioxus::desktop::WindowBuilder`, a `global_sync` signal mutated from a spawned thread, and a
  working close-interception that delays exit. This de-risks findings #1–#3 below before the
  real migration starts.

## New Crate Structure

```
Cargo.toml                      # Workspace root (moved up from src/tauri)
Dioxus.toml                     # app assets config only (window config is code, see 1.2)
src/
├── main.rs                     # LaunchBuilder + WindowBuilder + compose-up-on-launch
├── lib.rs                      # Re-exports (kept for integration tests)
├── app.rs                      # Root component (was App.tsx)
├── backend/
│   ├── mod.rs
│   ├── lifecycle.rs            # NEW: lib.rs setup + CloseRequested logic (compose up/down)
│   ├── docker.rs               # from tauri/src/docker.rs; drop #[tauri::command]
│   ├── settings.rs             # from tauri/src/settings.rs; drop #[tauri::command]
│   ├── site.rs                 # from tauri/src/site.rs; drop #[tauri::command]
│   ├── system.rs               # from tauri/src/system.rs; keep update stubs
│   ├── utils.rs                # from tauri/src/utils.rs; emit_notification → signal push
│   ├── wp_cli.rs               # from tauri/src/wp_cli.rs; drop #[tauri::command]
│   └── xdebug.rs               # from tauri/src/xdebug.rs; drop #[tauri::command]
├── components/
│   ├── mod.rs
│   ├── app_sidebar_or_logo.rs  # BrandLogo.rsx equivalent (was BrandLogo.tsx)
│   ├── services.rs             # was Services.tsx
│   ├── site_list.rs            # was SiteList/index.tsx (container; owns modal state)
│   ├── site_item.rs            # was SiteItem.tsx
│   ├── site_info.rs            # was SiteInfo.tsx
│   ├── notifications.rs        # was Notifications.tsx
│   ├── build_log.rs            # was BuildLog.tsx
│   ├── xdebug_switch.rs        # was XdebugSwitch.tsx
│   ├── settings.rs             # was Settings/SettingsModal.tsx
│   ├── versions.rs             # was Versions.tsx
│   ├── create_site.rs          # was CreateSiteModal.tsx
│   ├── edit_site.rs            # was EditSiteModal.tsx
│   ├── wp_cli.rs               # was WpCliModal.tsx
│   ├── composer.rs             # was ComposerModal.tsx
│   └── ui/                     # modal_base, form_input, toggle, icon, spinner, error_boundary
├── state.rs                    # GlobalSignals (all global_sync, see 3.1)
├── assets/
│   ├── tailwind.css            # migrated from renderer assets
│   ├── theme.css               # migrated (design tokens)
│   ├── fonts.css               # migrated; URLs replaced with asset!()
│   └── fonts/*.woff2           # copy the 40+ MonaspaceNeonNF files
└── tests/
    └── integration.rs          # NEW: cargo integration tests vs real compose stack
src/tauri/                      # deleted in Phase 7
src/renderer/                   # deleted in Phase 7
```

## Phase 1: Bootstrap Dioxus Project

- [ ] **1.1** Root `Cargo.toml` (promote `src/tauri/Cargo.toml`):
  - Add: `dioxus` (desktop feature, pinned per 0.1), `dioxus-logger`, `tracing` +
    `tracing-subscriber`, `webbrowser` (replaces `tauri-plugin-opener`/`open_target`), `image`
    (window icon), `dioxus-tailwindcss` (or committed prebuilt CSS).
  - Keep: `serde`/`serde_json`, `rfd`, `shell-words` (verify it still works; else pure-Rust
    splitter — only used by `wp_cli.rs`).
  - Remove: `tauri`, `tauri-build`, `tauri-plugin-opener`, `tauri-plugin-log`, `build.rs`,
    `capabilities/`, staticlib/cdylib crate types.
- [ ] **1.2** Window config is **code, not `Dioxus.toml`**: title "DevWP", 1200×800,
  min 800×600 via `dioxus::desktop::WindowBuilder` (`with_title`, `with_inner_size`,
  `with_min_inner_size`) passed into `DesktopConfig`. `Dioxus.toml` only lists assets/style
  order.
- [ ] **1.3** `src/main.rs`: `LaunchBuilder` + `WindowBuilder`, window icon loaded from
  `assets/icons` (RGBA via `image` crate; icns/ico not supported — see 7.x), WebKit DMA-BUF
  workaround env var kept, compose-up launched per 5.1.
- [ ] **1.4** Assets: copy `tailwind.css`, `theme.css`, `fonts.css`, and the woff2 files. Tailwind
  v4 is CSS-first — no `tailwind.config`; the compiler auto-detects sources (`.rs` files are
  scanned by default, respect `.gitignore`). Wire the CSS build through `dioxus-tailwindcss` or
  prebuild and commit the output. Replace `url(...)` font refs with Dioxus `asset!()` paths and
  verify the fonts package into the binary.

## Phase 2: Backend Migration

Cross-cutting rules:
- Strip `#[tauri::command]`, `tauri::AppHandle`/`tauri::State` params, `tauri::async_runtime::`
  (→ `tokio::spawn`/`tokio::task::spawn_blocking`), `tauri::Emitter`/`Manager`.
- `emit_notification(app, ...)` → `NOTIFICATIONS.write().push(notification)` — the signal pushes
  are the only notification path, including from spawned OS threads (see 3.1).
- `run_command_streaming` callbacks and `std::thread::spawn` sites (`site.rs:746,800`) must only
  mutate `global_sync` signals, not spawn UI-side effects directly.

- [ ] **2.1** `utils.rs`: keep `project_root`, `state_root`, `ensure_state_root`, `logs_dir`,
  `run_command`, `run_command_streaming` (unchanged threading model), `open_target`
  (replace `xdg-open`/`open`/`cmd start` with `webbrowser` or keep as-is if simpler), convert
  `emit_notification` to signal push.
- [ ] **2.2** `settings.rs`: plain fns; keep `pick_directory` **synchronous** — rfd must run on
  the main thread, so it is called synchronously from the click handler, never inside
  `spawn(async {...})` (Linux GTK panics otherwise).
- [ ] **2.3** `site.rs`: drop `#[tauri::command]`/`AppHandle`; notification emissions →
  `NOTIFICATIONS` signal. Keep mkfront logic, `pkexec`/`osascript`/powershell elevation paths
  (`site.rs:368-535`), cert regeneration, and `docker compose` exec calls unchanged. Migrate
  `std::thread::spawn` cert/notify callbacks to `global_sync` signal writes.
- [ ] **2.4** `docker.rs`: `BuildState(Mutex<HashMap>)` → `BUILDING_SERVICES` signal.
  `app.emit("build-status"/"docker-status"/"container-status"/"docker-log")` →
  `BUILD_STATUS_...`/`DOCKER_STATUS`/`CONTAINERS`/`BUILD_LOGS` signal updates. Keep
  `parse_compose_ps` and version parsing (unit tests already exist — keep them).
- [ ] **2.5** `wp_cli.rs`: drop `#[tauri::command]`; keep `build_wp_args`, `extract_error`
  (incl. `--debug` retry), composer auth.json handling.
- [ ] **2.6** `xdebug.rs`: `XdebugStatusPayload` emissions → xdebug signals; keep ini
  rewrite + `docker compose restart php` logic.
- [ ] **2.7** `system.rs`: plain fns; **keep the update stubs** (`get_update_ready` → false,
  `install_update_now` → OperationResult error) — Tauri updater was never wired up; note
  `uptick` as a future option, out of scope.
- [ ] **2.8** NEW `backend/lifecycle.rs`: port `lib.rs` startup sequence (mark 5 services
  building → emit `starting` → `docker compose up -d nginx` streaming → clear building →
  status complete/error → refresh containers) and the close sequence (`docker compose down`)
  from `lib.rs:54-198` into an async fn `start_services()` and a close handler per 5.2.

## Phase 3: State Management (`src/state.rs`)

- [ ] **3.1** All cross-thread state uses `Signal::global_sync` (every writer runs on the tokio
  runtime or an OS thread; unsync `Signal::global` panics off the main thread):
  ```rust
  pub static CONTAINERS: GlobalSignal<Vec<Container>> = Signal::global_sync(Vec::new);
  pub static BUILDING_SERVICES: GlobalSignal<HashMap<String, bool>> = Signal::global_sync(HashMap::new);
  pub static DOCKER_STATUS: GlobalSignal<DockerStatusPayload> = Signal::global_sync(|| DockerStatusPayload { status: "idle".into(), message: String::new() });
  pub static BUILD_LOGS: GlobalSignal<Vec<String>> = Signal::global_sync(Vec::new); // see shape note
  pub static NOTIFICATIONS: GlobalSignal<Vec<Notification>> = Signal::global_sync(Vec::new);
  pub static XDEBUG_ENABLED: GlobalSignal<Option<bool>> = Signal::global_sync(|| None);
  pub static XDEBUG_TOGGLING: GlobalSignal<bool> = Signal::global_sync(|| false);
  pub static SITES: GlobalSignal<Vec<Site>> = Signal::global_sync(Vec::new);
  pub static SITES_LOADING: GlobalSignal<bool> = Signal::global_sync(|| false);
  ```
- [ ] **3.2** `BUILD_LOGS` semantics: backend pushes `docker-log` lines; preserve the current
  behavior (`BuildLog.tsx`): format as `[{service_name}] {line}` after ANSI stripping, cap at
  500 lines, clear when the first build of a cycle starts (building count 0 → >0). Either store
  pre-formatted strings (simplest, matches today) or `(service, line)` pairs and format at
  render.
- [ ] **3.3** Notification shape keeps `{type: "success"|"error"|"info", message}`; dedupe/consum
  e semantics per `Notifications.tsx` (auto-dismiss) now live in a `use_effect` watching
  `NOTIFICATIONS`.

## Phase 4: UI Components (React → RSX)

Mapping rules (from the existing table — verified accurate, exceptions marked):
- `useState` → `use_signal`; `useEffect` → `use_effect`/`use_resource`; `useCallback`/`useMemo`
  → closures/`use_memo`; `useRef` → `use_signal`.
- `invoke(cmd, args)` → `spawn(async { backend::cmd(args).await })` (camelCase arg names are
  implicit — no serde rename needed on the Rust side beyond existing struct derives).
- `listen(evt, cb)` → `use_effect` subscribing to the matching signal (components render
  directly from signals; no subscription helper needed).
- `emit(evt, data)` from the renderer (e.g. `SettingsModal.tsx:28,56`) → direct signal push —
  notifications are now purely signal-based, one direction only.
- `useContext(SiteActionContext)` → pass action callbacks as props (Dioxus has no context
  provider pattern here); removes `SiteActionContext.tsx`.
- `React.lazy`/`Suspense` for modals (`App.tsx`, `SiteList/index.tsx`) → render conditionally
  from the modal-state signal (no code-splitting in native Dioxus desktop).

- [ ] **4.1** UI primitives: `icon` (simple-icons SVGs — inline `<svg>` data, mindful of
  `asset!()` vs inline), `spinner`, `toggle`, `form_input`, `modal_base`, `error_boundary`
  (Dioxus `ErrorBoundary` component).
- [ ] **4.2** `app.rs` root: grid layout, modals state, docker status banner (from App.tsx) —
  includes lazy-modals → signal-gated rendering.
- [ ] **4.3** `services.rs`: port container polling (while any health == "starting", poll
  `get_container_status` every 1s — `Services.tsx:88-99`), the known-services ordering with
  building/pending/placeholder rows, restart flow, and the per-service "building" overlays from
  `BUILDING_SERVICES` + `BUILD_LOGS`.
- [ ] **4.4** `notifications.rs` (auto-dismiss toast), **4.5** `build_log.rs` (collapsible panel,
  auto-scroll, per-cycle clear), **4.6** `xdebug_switch.rs` (status + toggling states).
- [ ] **4.7** `site_list.rs`: search input, scrollable list, modal-open signal & conditional
  modal rendering; **4.8** `site_item.rs` (row actions incl. menu); **4.9** `site_info.rs`
  (detail actions).
- [ ] **4.10** Modals: `create_site`, `edit_site`, `wp_cli`, `composer` — form validation logic
  reuses Rust-side validation from `site.rs` (recommend extracting `validate_site_name` +
  domain/php-version checks into testable pure fns with Rust unit tests, since the TS modal
  validation tests are being deleted).
- [ ] **4.11** `settings.rs` (SettingsModal incl. direct NOTIFICATIONS pushes, webroot pick via
  sync `pick_directory` in the click handler), `versions.rs`.
- [ ] **4.12** BrandLogo (`brand_logo.rs`): used by Services icons + app header — port alongside
  4.1/4.3.

## Phase 5: Lifecycle & Docker Integration

- [ ] **5.1** compose `up` on launch: call `backend::lifecycle::start_services()` from a
  `use_effect` mount hook in `app.rs` (mirrors `lib.rs:54-141`); replaces tauri `setup`.
- [ ] **5.2** compose `down` on close: replace `on_window_event(CloseRequested)` with the
  pinned Dioxus close API (0.7: `use_close_event`, return `true` to prevent default close).
  Pattern: on first request mark "stopping" + spawn `docker compose down`; when done set
  "stopped" and call `window.close()`/`destroy()` to complete teardown. **Do not rely on `Drop`
  or `on_exit`** — there is no Tauri-equivalent close-request interception in Dioxus and the
  process/runtime teardown races the spawned cleanup (risk 2).
- [ ] **5.3** WebKit DMA-BUF workaround: keep the `std::env::set_var` call in `main.rs` before
  launch.

## Phase 6: Build, CI & Distribution

- [ ] **6.1** Scripts table (README + any remaining docs):
  dev → `dx serve` (or `cargo run`); build → `dx build`; test → `cargo test`;
  lint → `cargo clippy -- -D warnings`; format → `cargo fmt`.
  Remove `package.json` (and `bun.lock`, `.npmrc`, tsconfigs, biome.json, vite/vitest configs)
  once `src/renderer/` is gone.
- [ ] **6.2** Packaging via **`cargo-packager`** (`cargo-bundle` is archived). Configure bundlers:
  deb/rpm/AppImage (Linux), msi/nsis (Windows), dmg (macOS). Set the package `name` to the
  single artifact name decided above (e.g. `devwp`) so every consumer matches.
- [ ] **6.3** `release.yml`: replace tauri-action steps with `cargo-packager` (or `dx bundle`)
  per platform; keep the existing matrix (macos/ubuntu-24.04(+arm)/windows), the
  `APPLE_SIGNING_IDENTITY` ad-hoc signing env, `APPIMAGE_EXTRACT_AND_RUN`, and prune the
  Bun/`node_modules` cache steps. Update the release body artifact names.
- [ ] **6.4** `aur-deploy.yml`: fix the download URL to the agreed artifact name (currently
  broken: downloads `dev-wp_...`, workflow/release body say `DevWP_...`); update PKGBUILD sed
  patterns accordingly.
- [ ] **6.5** `pr.yml` & `test.yml`: replace Bun steps with Rust toolchain + webkit2gtk-4.1
  deps; jobs become fmt/clippy/test. Integration job: bake php/nginx (+mariadb) via
  `docker/bake-action` as today, then `cargo test --test integration` (skips gracefully when
  Docker unavailable — see 7.6). Delete the coverage artifact + PR-comment jobs and `coverage/`
  ignores.
- [ ] **6.6** `update-deps.yml` (auto-update bot): extend to bump Cargo dependencies/lockfile;
  review what the bun-based job still covers.
- [ ] **6.7** `.gitignore`: drop `src/tauri/target` + `src/tauri/gen`, add root `target/`,
  `dist/`, `out/`, delete `.devwp-tauri` ignore only if state dir is renamed (it isn't —
  keep ignoring it).

## Phase 7: Cleanup

- [ ] **7.1** Delete `src/tauri/` (incl. `build.rs`, `capabilities/`, `gen/`, `tauri.conf.json`,
  `Cargo.lock` moved up).
- [ ] **7.2** Delete `src/renderer/` (React app, fonts already copied, tests deleted per
  strategy).
- [ ] **7.3** Delete root Node config files: `package.json`, `bun.lock`, `.npmrc`,
  `tsconfig*.json`, `biome.json`, `vite.config.ts`, `vitest.config*.ts`. Keep `scripts/*.sh`
  (Linux dev helpers) and `docs/` (update).
- [ ] **7.4** Verify stray references: `dev:web`, `test:ui`, `sudo-prompt` (unused today),
  `@tailwindcss/vite` — none survive. Check `README.md` badges (ci status, coverage) and any
  `docs/` pages that reference tauri/bun commands.
- [ ] **7.5** README: architecture diagram, cargo commands, packaging instructions, AUR note.
- [ ] **7.6** Tests wire-up: keep existing Rust unit tests (`parse_compose_ps`, utils) and add
  unit tests for site validation logic. Integration suite in `src/tests/` calls backend fns
  directly (no IPC): container status, settings CRUD, xdebug toggle/restore, wp_cli version.
  Guard side-effectful cases (create/delete site mutate `config/nginx` + certs on the host) —
  confine to CI or a `DEVWP_TEST_MODE` that redirects `project_root()`/`state_root()` to a temp
  dir. The `test.yml` integration job is the only place that runs against real Docker.

## Key API Mappings (verified against current code)

| Tauri (current) | Dioxus Desktop |
|-------|---------------|
| `tauri::Builder::...run()` | `dioxus::LaunchBuilder::new().launch(app)` |
| `#[tauri::command]` | plain fn / async fn, called directly |
| `app.emit(event, payload)` | `Signal`/`GlobalSignal` write (all `global_sync`) |
| `listen('evt', cb)` | `use_effect` reading the signal — reactive render |
| `invoke('cmd', args)` | `spawn(async { backend::cmd(args).await })` |
| `tauri::State<T>` / `manage()` | `GlobalSignal<T>` |
| `on_window_event(CloseRequested)` | `use_close_event` (0.7) / `Window::on_close` (0.6) with deferred destroy |
| `tauri_plugin_log` | `dioxus-logger` + `tracing` |
| `tauri_plugin_opener::open_url` | `webbrowser::open`/`open::that` (or keep `open_target`) |
| `rfd::FileDialog` | same crate, **main-thread only** (sync calls in click handlers) |
| `tauri::async_runtime::spawn` | `dioxus::prelude::spawn` (tokio) |
| `tauri::async_runtime::spawn_blocking` | `tokio::task::spawn_blocking` |
| `tauri::generate_context!` / `build.rs` | not needed |
| `tauri.conf.json` windows | `WindowBuilder` in code — **not** `Dioxus.toml` |
| `tauri build` → bundles | `cargo-packager` |
| React `Suspense`/lazy modals | conditional render from modal state signal |

## Risks & Mitigations (updated)

1. **Cross-thread signal writes (critical).** Every backend writer (tokio runtime tasks, OS
   threads in `run_command_streaming`, cert threads in `site.rs`) must touch only
   `Signal::global_sync` state. Mitigation: 0.2 spike; rule enforced in 2.1+3.1; no unsync
   signals anywhere in shared state.
2. **Close lifecycle.** No `CloseRequested` prevent-close equivalent; naive `Drop`/`on_exit`
   cleanup races process teardown. Mitigation: intercept close, run compose-down, then
   destroy window (5.2); spike verifies exact API for the pinned version.
3. **rfd main-thread (Linux).** `pick_directory` must stay sync and be invoked directly from the
   click handler; calling it inside `spawn` panics with GTK. Mitigation: keep signature
   `Option<String>` sync; document in 2.2.
4. **Dioxus API drift 0.6→0.8.** Close handling, signal APIs, `asset!()` behavior differ.
   Mitigation: Phase 0 pin + spike + note in task handoff.
5. **Tailwind v4 scanning.** No content glob — compiler auto-detects sources from the project
   root; `.rs` files included by default but the CSS must be produced into the Dioxus asset set.
   Mitigation: `dioxus-tailwindcss` config or committed prebuilt CSS; verify class names survive
   minification.
6. **Fonts/assets.** 40+ woff2 files and `theme.css`/`fonts.css` must be bundled via `asset!()`.
   Mitigation: 1.4; smoke-check custom font renders in the packaged app (webview `.woff2` +
   CSP-less local loading).
7. **Integration tests touch the host.** create_site/delete_site mutate `config/nginx`,
   certs, and MariaDB. Mitigation: `DEVWP_TEST_MODE` temp-root redirection or CI-only suite
   (7.6).
8. **shell-words.** Only used in `wp_cli.rs` username/command handling; if incompatible with
   the migration, swap for a pure-Rust word splitter (small, isolated).
9. **Icons.** Dioxus needs RGBA pixel data; load `32x32.png` via `image` crate at startup;
   icns/ico remain Tauri bundle artifacts only.

## Validation Plan

- **Per phase:** `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`.
- **Phase 5/6 milestone:** full `cargo test` incl. integration (Docker up), manual smoke of the
  packaged binary: window geometry/min-size, launch compose-up, create site, xdebug toggle,
  close → compose-down completes before exit, fonts/theme render.
- **End state:** `git grep -i tauri` returns hits only in README/docs history or `.gitignore`
  remnants; `cargo build --release` and `cargo-packager` produce the release artifacts;
  `pr.yml` green on a fresh branch.
