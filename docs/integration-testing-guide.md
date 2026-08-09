# Integration Testing Guide

## Overview

Integration tests (`tests/integration.rs`) exercise the backend directly — no IPC — against the real compose stack. They use `devwp::backend::*` functions the same way the UI does.

## Running Integration Tests

```bash
# Start the stack (from the repo root)
docker compose up -d nginx

# Wait until services are healthy, then run
cargo test --test integration
```

With Docker unavailable, tests print `SKIP` and pass. Unit tests run without Docker:

```bash
cargo test --lib --bins
```

## Prerequisites

Integration tests require:

- Docker with the DevWP compose stack running
- The default webroot (`~/www`) writable (one test creates a throwaway dir)

## What Integration Tests Cover

- **Container status**: `docker compose ps` parsing and versions (`docker::get_container_status`)
- **Settings CRUD**: settings.json roundtrip in a temp state dir (`DEVWP_TEST_MODE`)
- **Xdebug toggle**: flips `config/php/conf.d/xdebug.ini` and restarts php
- **WP-CLI**: `wp --info` runs inside the php container
- **Global signals**: build-log formatting/ANSI stripping, building flags, notifications

Side-effectful flows that mutate the host (create/delete site → nginx configs,
`/etc/hosts`, certs) are intentionally **not** covered; `DEVWP_TEST_MODE`
redirects `state_root()` to a temp dir so tests never touch your real
`.devwp-tauri` state.

## Writing Integration Tests

```rust
#[test]
fn settings_crud_roundtrip_in_test_state() {
    with_test_state(|| {
        settings::save_setting("webroot_path".to_string(), "/tmp/devwp-www".to_string());
        assert_eq!(settings::get_setting("webroot_path".to_string()).as_deref(), Some("/tmp/devwp-www"));
    });
}
```

Two helpers are provided:

- `with_runtime(...)` — runs the closure inside a Dioxus runtime so global signal writes work.
- `with_test_state(...)` — redirects the state dir to a temp location.

Async backend functions are called through the local `block_on` helper (a
current-thread tokio runtime); do **not** use `#[tokio::test]` here to avoid
clashing with dioxus's own runtime.
