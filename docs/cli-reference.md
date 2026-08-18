# DevWP CLI Reference

The `devwp` binary is both the desktop app and a CLI. Invoked **without
arguments** it launches the GUI; invoked **with a subcommand** it runs
headless and drives the exact same backend functions as the UI (no separate
code path):

```text
devwp                 # launch the desktop GUI
devwp --help          # CLI overview
devwp <COMMAND> ...   # headless command
```

## General behaviour

- **Streams**: results go to stdout; errors and warnings go to stderr.
  `--json` output (where offered) is stable, pretty-printed, and suitable
  for piping into `jq`.
- **Exit codes**: `0` success, `1` operation failure, `2` usage error
  (unknown command, missing/invalid arguments — clap).
- **Project root**: like the GUI, the CLI walks up from the current
  directory to the checkout containing `compose.yml`; nginx configs,
  certificates and the compose stack resolve relative to it. Run commands
  from (or under) your DevWP checkout.
- **State**: the CLI reads/writes the same `.devwp-tauri/` state
  (`sites.json`, `settings.json`) and the same webroot as the GUI.
- **Confirmation**: destructive commands (`site delete`) prompt on stdin;
  pass `--yes` to skip in scripts.
- **Windows note**: the packaged release binary is built with the
  `windows_subsystem = "windows"` attribute, so it has no console of its own
  and CLI output is **not visible in an interactive terminal** — only
  redirected output works (`devwp info > out.txt`, or piping into another
  command). Use a debug build (`cargo run -- info`) for interactive CLI use
  on Windows.

Global options on every command (handled by clap): `-h/--help`, and
`-V/--version` on the root command.

## Command overview

| Command                  | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `devwp init`             | Initialize state dir, webroot, and the stack       |
| `devwp doctor`           | Environment health report (PASS/WARN/FAIL)         |
| `devwp info`             | Show paths, versions, and environment facts        |
| `devwp site list`        | List sites (table or JSON)                         |
| `devwp site show`        | Show one site's stored configuration               |
| `devwp site create`      | Create a site (optionally install WordPress)       |
| `devwp site update`      | Change aliases / web root                          |
| `devwp site delete`      | Delete a site (prompts unless `--yes`)             |
| `devwp services status`  | Container states, health, versions                 |
| `devwp services start`   | Start the stack (`docker compose up -d nginx`)     |
| `devwp services stop`    | Stop the stack (`docker compose down`)             |
| `devwp services restart` | Restart one container                              |
| `devwp wp`               | Run a WP-CLI command inside a site's container     |
| `devwp composer`         | Run `composer update` inside a site's container    |
| `devwp xdebug`           | Show / enable / disable / toggle Xdebug            |
| `devwp settings`         | List / get / set / unset settings                  |
| `devwp open`             | Open a site's URL in the default browser           |

---

## `devwp init`

Prepare the environment: optionally set the webroot, create the state
directory and webroot, verify the Docker daemon, and start the service
stack.

```
devwp init [--webroot <DIR>] [--skip-start]
```

| Option         | Effect                                                        |
| -------------- | ------------------------------------------------------------- |
| `--webroot DIR`| Save DIR as the `webroot_path` setting before creating anything |
| `--skip-start` | Prepare directories and checks only; skip `docker compose up` |

**Behaviour**

1. `--webroot` is persisted first (fails with exit 1 if settings can't be written).
2. `.devwp-tauri/` and the webroot directory are created as needed.
3. `docker info` must succeed, otherwise exit 1 with the daemon's error.
4. Unless `--skip-start`, runs `docker compose up -d nginx`, streaming
   build/startup output live (same command as the GUI launch).

**Example**

```bash
devwp init --webroot ~/www
```

---

## `devwp doctor`

Print a PASS/WARN/FAIL report and exit 1 if any check FAILs.

```
devwp doctor
```

Checks: Docker daemon reachable, `compose.yml` found, state directory
writable, webroot present, `mkcert` available (WARN — needed for trusted
HTTPS certs), and how many stack containers are running (WARN when the
stack is down or partially up).

**Example output**

```text
docker daemon               PASS  reachable
compose.yml                 PASS  /home/user/DevWP
state directory             PASS  /home/user/DevWP/.devwp-tauri
webroot                     PASS  /home/user/www
mkcert                      WARN  mkcert not found. Please install ...
service stack               WARN  0/5 running — run `devwp services start`
```

---

## `devwp info`

Show version and configuration facts.

```
devwp info [--json]
```

Prints: app version, project root, state dir, sites/settings file paths,
webroot, Xdebug state, and site count. With `--json`, one pretty-printed
JSON object (camelCase keys, matching the rest of the app's serialization).

---

## `devwp site`

### `devwp site list`

```
devwp site list [--json]
```

Merges `sites.json` with directories found in the webroot (same as the GUI
site list) and prints a table: NAME, STATUS, URL, ALIASES, WEB ROOT,
MULTISITE. `--json` prints the serialized `Site[]` (camelCase fields).

### `devwp site show <DOMAIN>`

```
devwp site show <DOMAIN> [--json]
```

`DOMAIN` may omit the `.test` suffix (resolved as `format_domain` does:
exact match first, then `.test` appended). Exit 1 with a "not found" error
listing the fix (`devwp site list`) when the site is unknown.

### `devwp site create <DOMAIN> [options]`

```
devwp site create <DOMAIN> [--webroot <DIR>] [--aliases <ALIASES>]
                             [--multisite <TYPE>]
                             [--wp-title <T>] [--wp-user <U>]
                             [--wp-password <P>] [--wp-email <E>]
```

| Option             | Effect                                                             |
| ------------------ | ------------------------------------------------------------------ |
| `--webroot DIR`    | Relative web-root segment inside the site dir (e.g. `public`)       |
| `--aliases LIST`   | Comma- or space-separated alias domains                             |
| `--multisite TYPE` | `subdirectory` or `subdomain`; rewrites the nginx WP include        |
| `--wp-title T`     | WordPress site title                                                |
| `--wp-user U`      | WordPress admin username (default `root`)                           |
| `--wp-password P`  | WordPress admin password (default `root`); a bare `--wp-password` prompts on stdin so the value stays out of shell history and `ps` |
| `--wp-email E`     | WordPress admin email (default `root@example.com`); validated       |

**Behaviour**

- A domain without a dot gets `.test` appended (`shop` → `shop.test`).
- Creates the site directory, `sites.json` entry, nginx config (validated
  with `nginx -t` before reload), `/etc/hosts` entries, and regenerates the
  shared mkcert TLS certificate (inline, guaranteed complete on exit).
- Giving **any** `--wp-*` flag installs WordPress (`wp core
  download`/`config`/db create/`install`), mirroring the GUI flow.
- Validation failures (bad name/alias/webroot characters, invalid email)
  exit 1 before anything is written.

**Examples**

```bash
devwp site create shop --wp-title "My Shop" --wp-user admin
devwp site create client.test --aliases "client.local c.test" --webroot public
devwp site create network.test --multisite subdomain
```

### `devwp site update <DOMAIN> [options]`

```
devwp site update <DOMAIN> [--aliases <ALIASES>] [--webroot <DIR>]
```

Replaces the given fields; omitted flags keep their current values (same
merge semantics as the GUI). Removes stale alias hosts entries, regenerates
the certificate and nginx config, then reloads. Passing no flag is a usage
error (exit 1: "nothing to update").

### `devwp site delete <DOMAIN>`

```
devwp site delete <DOMAIN> [-y|--yes]
```

Prompts with the site name and its filesystem path before deleting (unless
`--yes`). Removes the site directory under the webroot (never outside it),
the nginx config, `sites.json` entry, and hosts entries, then regenerates
the shared certificate. The MariaDB database is **kept** (same behaviour as
the GUI); the exit message names it.

---

## `devwp services`

### `devwp services status`

```
devwp services status [--json]
```

Runs `docker compose ps` plus per-container version probes (php, nginx,
mariadb, redis, mailpit) and prints NAME, STATE, HEALTH, VERSION. Requires
the Docker daemon; errors exit 1 with Docker's stderr.

### `devwp services start`

```
devwp services start
```

`docker compose up -d nginx` — identical to the GUI launch — with build
output streamed live to the terminal. Exits 1 if compose fails.

### `devwp services stop`

```
devwp services stop
```

`docker compose down` — identical to the GUI shutdown. Exits 1 with Docker's
stderr on failure.

### `devwp services restart <SERVICE>`

```
devwp services restart <SERVICE>
```

`SERVICE` accepts the compose service name (`php`, `nginx`, `mariadb`,
`redis`, `mailpit` — mapped to `devwp_*` containers), a full container
name, or a container id; anything unrecognized is passed to `docker restart`
verbatim.

---

## `devwp wp <DOMAIN> <ARGS>...`

```
devwp wp <DOMAIN> <ARGS>...
```

Runs WP-CLI inside the site's `devwp_php` container, in the site's
directory (honoring its web root). Everything after `DOMAIN` is passed
through verbatim, including flags — quote arguments with spaces. On WP-CLI
failure the CLI prints WP-CLI's error and exits 1; a retry with `--debug`
is used internally to flush WP-CLI's buffered output when the failure
produced no output.

Note: clap intercepts `--help`/`-h` wherever they appear, so they never reach
WP-CLI. Forward them with the `--` separator (`devwp wp example.test --
--help`); `devwp help wp` shows DevWP's own help for this command.

**Examples**

```bash
devwp wp example.test plugin list
devwp wp example.test core update
devwp wp example.test search-replace "old.test" "new.test" --all-tables
devwp wp example.test user create bob bob@example.test --role=editor
```

---

## `devwp composer <DOMAIN>`

```
devwp composer <DOMAIN>
```

Runs `composer update` in the site's container. The host's
`~/.config/composer/auth.json` (or `~/.composer/auth.json`) is passed via a
mode-600 env file so private packages work non-interactively, exactly like
the GUI button.

---

## `devwp xdebug [<ACTION>]`

```
devwp xdebug [status|on|off|toggle]
```

| Action    | Effect                                                        |
| --------- | ------------------------------------------------------------- |
| `status`  | Print `xdebug is enabled|disabled` (default when omitted)      |
| `on`      | Enable; no-op (exit 0) when already enabled                    |
| `off`     | Disable; no-op (exit 0) when already disabled                  |
| `toggle`  | Flip to the opposite state                                     |

Writes `xdebug.mode` in the mounted `config/php/conf.d/xdebug.ini` and
restarts the `php` service (both GUI and CLI paths). The resulting state is
persisted to the `xdebug_enabled` setting.

---

## `devwp settings`

```
devwp settings list [--json]
devwp settings get <KEY>
devwp settings set <KEY> <VALUE>
devwp settings unset <KEY>
```

Reads/writes `settings.json`. `list` prints sorted `KEY = VALUE` lines (or
JSON). `get` prints the value, or exits 1 with `setting 'KEY' is not set`
when unset. `set`/`unset` print the backend's result message, or exit 1 on
write failure.

Known keys: `webroot_path` (default webroot location), `xdebug_enabled`
(maintained by `devwp xdebug`).

**Example**

```bash
devwp settings set webroot_path /srv/www
```

---

## `devwp open <DOMAIN>`

```
devwp open <DOMAIN>
```

Opens the site's URL (`https://<domain>`) in the default browser via the
backend's safe `open_target` (rejects metacharacters in the URL).

---

## Scripting recipes

```bash
# Fresh environment, one site, plugin installed, ready to browse
devwp init && devwp site create demo --wp-title Demo --wp-user admin
devwp wp demo.test plugin install wordpress-seo --activate

# Nightly dump of every site's database
for site in $(devwp site list --json | jq -r '.[].name'); do
  devwp wp "$site" db export - | gzip > "backup-$site.sql.gz"
done

# CI smoke check
devwp doctor && devwp services status --json | jq -e '[.[] | select(.name=="devwp_nginx" and .state=="running")] | length == 1'
```
