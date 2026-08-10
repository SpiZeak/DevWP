# Integrate SQL Studio Container with Web GUI — feat/dioxus-migration

Target branch: `origin/feat/dioxus-migration` (Dioxus 0.7 desktop UI, `src/backend/*` Rust backend, no Node tooling). App still orchestrates via the `docker compose` CLI (`src/backend/docker.rs`, `src/backend/lifecycle.rs`); the future bollard rewrite is separate (`plans/1783586940310`) and this work must not assume bollard.

## Goal

Add SQL Studio (`sqlstudio/sqlstudio`) to the compose stack and surface it in the Dioxus Services panel: card + restart handling like mailpit, plus a new "open in browser" button on cards that have a web UI (SQL Studio, and Mailpit for consistency).

## Decisions (confirmed with user)

- **Tool**: SQL Studio (`sqlstudio/sqlstudio:latest`, web port 3000). Connects to MariaDB on the shared compose network: host `devwp_mariadb`, port 3306, user `root`, password `root` (same as WP stack).
- **GUI integration**: Services card + open-in-browser button via existing `system::open_external` (SiteList pattern). No webview embedding.
- **Auto-start**: SQL Studio starts with the app (like mailpit) via the lifecycle startup sequence; app close `docker compose down` stops it.
- **No healthcheck, no version detection**: image tooling unknown (avoid false "Unhealthy"); `get_container_version` in `src/backend/docker.rs:44` already returns `None` for unmapped names and `VERSION_CACHE` caches it. No docker.rs changes needed.

## Files to change

### 1. `compose.yml` — add `sqlstudio` service

Append after `mailpit` (before `volumes:`), matching mailpit's minimal style:

```yaml
  sqlstudio:
    container_name: devwp_sqlstudio
    image: sqlstudio/sqlstudio:latest
    ports:
      - '3000:3000'
    logging: *default-logging
```

No `depends_on` (connections are user-initiated), no healthcheck, no restart policy — same as mailpit.

### 2. `src/backend/lifecycle.rs` — start on app launch

- `STARTUP_SERVICES` (line 24): append `"sqlstudio"` so the building-state marks include it.
- Start command (inside `start_services`, ~line 33): change `&["compose", "up", "-d", "nginx"]` to `&["compose", "up", "-d", "nginx", "sqlstudio"]`.
  - Required: `compose up <service>` starts only that service + its dependencies; SQL Studio is not in nginx's `depends_on`, so it must be named explicitly or it never starts with the app.
- `stop_services` (`compose down`) needs no change.

### 3. `src/components/services.rs` — card + open button

- `KNOWN_CONTAINER_NAMES` (line ~10): append `"devwp_sqlstudio"` (5 → 6).
- `display_name` (line ~28): add `"devwp_sqlstudio" => "SQL Studio".to_string()`.
- Icons: no change — `container_icon`'s catch-all arm (line ~41) already returns `SI_DOCKER` for unknown names (same as mailpit).
- New constant near the top:
  ```rust
  /// Containers that expose a web UI reachable from the host.
  const WEB_UI_URLS: [(&str, &str); 2] = [
      ("devwp_sqlstudio", "http://localhost:3000"),
      ("devwp_mailpit", "http://localhost:8025"),
  ];
  ```
- New helper (plain fn, unit-testable, mirroring `display_name` style):
  ```rust
  fn web_ui_url(container_name: &str) -> Option<&'static str> {
      WEB_UI_URLS
          .iter()
          .find(|(name, _)| *name == container_name)
          .map(|(_, url)| *url)
  }
  ```
- In the card `<li>` action area (next to the restart `button`, ~line 160): render an open button when `web_ui_url(&item_name)` is `Some`:
  - Reuse the restart button's classes (same `size-7` round gunmetal style, title `"Open SQL Studio"` / `"Open Mailpit"` via display name).
  - `disabled: container.state != "running"` (placeholders/stopped/exited stay disabled, mirroring the restart button's disabled pattern).
  - `onclick: move |_| { let _ = system::open_external(web_ui_url.to_string()); }` — exact SiteList pattern (`src/components/site_list.rs`), call the sync fn directly; `open_target` only spawns the process and validates unsafe chars. Add `use crate::backend::system;` if not already imported.
  - Icon: `Icon { content: "↗".to_string(), class: "text-lg".to_string() }` — same component the header buttons use. These classes already exist in the prebuilt CSS.
  - Do not render the button for non-web containers (nginx/php/mariadb/redis); keep placeholder ("pending"/"building") cards disabled.

### 4. Tests — `#[cfg(test)] mod tests` in `src/components/services.rs`

- No JS test infra on this branch; unit tests run via `cargo test --lib`. docker.rs already has this pattern.
- Add small tests: `web_ui_url("devwp_sqlstudio")` → `Some("http://localhost:3000")`; `web_ui_url("devwp_nginx")` → `None`; `display_name("devwp_sqlstudio")` → `"SQL Studio"`.
- Existing tests (`docker.rs` parse tests, `utils.rs`) unaffected.

### 5. `README.md` — Available Services table

- Add row: `| SQL Studio | 3000 | http://localhost:3000 | Database manager |`.
- Note under the table: connection settings = host `devwp_mariadb` (compose-network DNS, NOT `localhost`), user `root`, password `root`.

## Validation

1. `docker compose config` — YAML valid.
2. `docker pull sqlstudio/sqlstudio`; `docker compose up -d sqlstudio`; verify UI loads at `http://localhost:3000`.
3. `cargo run` on the branch — Services panel shows "SQL Studio" card; restart works; open button launches the browser (running state only); app startup via `docker compose up -d nginx sqlstudio` works; shutdown `compose down` includes it.
4. Add a MariaDB connection in SQL Studio UI (host `devwp_mariadb`, port 3306, root/root) and confirm tables/schemas render.
5. `cargo test --lib`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all -- --check`.
6. CI integration path is unaffected: `docker compose up -d nginx` (workflow) does not start sqlstudio — by design.
7. CSS: no new Tailwind classes introduced, so `src/assets/style.css` (prebuilt, committed) needs no rebuild; run `scripts/build-css.sh` only if classes are added.

## Risks / notes

- **Image/port drift**: verify `sqlstudio/sqlstudio` tag and default port 3000 at `docker pull` time; adjust compose entry if the published port differs (image supports a `PORT` env).
- **Root auth over TCP**: WP stack already connects as root/root from a container to `devwp_mariadb`, so expected to work. If access denied (MariaDB `MARIADB_ROOT_HOST: localhost` semantics), fallback: set `MARIADB_ROOT_HOST: '%'` for the mariadb service (dev-only stack) and document.
- **Port 3000 conflicts**: container exits; card shows exited state, open button disabled. Documented in README note only. (3000 is unused by the rest of the stack.)
- **No healthcheck**: GUI shows `running` without a health badge for SQL Studio; acceptable.
- **Intersection with the bollard migration**: when bollard lands, the service comes generically from parsed `compose.yml`; `lifecycle.rs` `STARTUP_SERVICES` and `services.rs` (`KNOWN_CONTAINER_NAMES`, `display_name`, `WEB_UI_URLS`) are the only hardcoded touch points to keep in sync.
