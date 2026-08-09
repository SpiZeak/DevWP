# DevWP Quick Reference

## Commands

| Task                  | Command                                     |
| --------------------- | ------------------------------------------- |
| Run the app           | `cargo run`                                 |
| Build (release)       | `cargo build --release`                     |
| Format check          | `cargo fmt --all -- --check`                |
| Lint                  | `cargo clippy --all-targets -- -D warnings` |
| Unit tests            | `cargo test --lib --bins`                   |
| Integration tests     | `cargo test --test integration` (needs Docker) |
| Rebuild CSS bundle    | `scripts/build-css.sh`                      |
| Package installers    | `cargo install cargo-packager --locked && cargo packager --release` |

## Layout

```
src/
├── main.rs          # window config, icon, custom asset protocol
├── lib.rs           # re-exports (integration tests use `devwp::…`)
├── app.rs           # root component: compose-up on launch, close interception
├── state.rs         # global SyncSignals (cross-thread safe)
├── assets.rs        # embedded CSS/fonts served under /assets/* on the dioxus scheme
├── assets/          # tailwind sources, prebuilt style.css, fonts
├── backend/         # docker, site, settings, wp_cli, xdebug, system, lifecycle
└── components/      # RSX components + ui primitives
tests/integration.rs # tests against the real compose stack
```

## State & Threading Rules

- Every piece of state that a background thread writes (docker log streaming,
  certificate threads, tokio tasks) must be a `SyncSignal` from `state.rs`.
  `run_command_streaming` callbacks and `std::thread::spawn` bodies may ONLY
  mutate `SyncSignal` state.
- UI-only state uses local `use_signal` handles.
- `rfd` dialogs (`pick_directory`) must run synchronously on the main thread —
  call them directly from click handlers, never inside `spawn`.

## Common Patterns

### Backend command (async, runs in a blocking task)

```rust
pub async fn restart_container(container_id: String) -> Result<bool, String> {
    let output = tokio::task::spawn_blocking(move || run_command("docker", &["restart", &container_id]))
        .await
        .map_err(|e| format!("Task join error: {e}"))??;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let _ = get_container_status();
    Ok(true)
}
```

### Streaming docker output into state

```rust
let svc = service_name.clone();
let svc_for_log = svc.clone();
let success = tokio::task::spawn_blocking(move || {
    run_command_streaming("docker", &["compose", "up", "-d", "--build", &svc], move |line| {
        state::push_build_log(&svc_for_log, &line);
    })
})
.await
.map_err(|e| format!("Task join error: {e}"))??;
```

### Notifications from the backend

```rust
crate::state::push_notification("success", format!("Site {} created", site.domain));
```

The UI auto-dismisses notifications; no event plumbing needed.

### From a component

```rust
spawn(async move {
    let _ = backend::docker::restart_container(id).await;
});
```

## Close Lifecycle

- The window starts with `WindowCloseBehaviour::WindowHides`.
- On `CloseRequested` (intercepted via `use_wry_event_handler`) the app runs
  `docker compose down` in the background.
- When it completes, `state::shutdown_done()` flips and the app switches the
  window to `WindowCloses` and closes it — compose-down always finishes before
  the process exits.

## Troubleshooting

- **Signal writes panic off-thread**: you touched an unsync signal from a task.
  Move the value into a `SyncSignal` (see `state.rs`).
- **UI doesn't reflect CSS changes**: rebuild and commit the CSS:
  `scripts/build-css.sh`.
- **"Copy Value hoisted" warnings**: a global signal was first created in a
  child component scope — call `state::init_globals()` at the root (already
  wired in `app.rs`).
- **Fonts missing in a packaged build**: everything is embedded via
  `include_bytes!`; if a font is absent, `assets.rs` is missing an entry.
