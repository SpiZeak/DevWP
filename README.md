# DevWP

[![Build Status](https://github.com/SpiZeak/DevWP/actions/workflows/release.yml/badge.svg)](https://github.com/SpiZeak/DevWP/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/SpiZeak)

A pure-Rust desktop application (Dioxus) for simplified local WordPress development using Docker, Nginx, and PHP-FPM.

## What changed in the Dioxus migration

DevWP was previously a Tauri app (Rust backend + React/TypeScript renderer). It is now a **single Rust binary** built with [Dioxus](https://dioxuslabs.com) desktop:

- All React components became Dioxus RSX components; there is no Node/TypeScript toolchain (no Vite, bun, vitest, biome) and no IPC — the UI calls the backend functions directly.
- All shared state lives in process-wide `SyncSignal`s so background threads (docker streaming, certificate regeneration) can safely mutate it.
- The Tailwind v4 CSS bundle is **prebuilt and committed** (`src/assets/style.css`); rebuild with `scripts/build-css.sh` after changing classes.
- All fonts are embedded in the binary (no external asset loading, identical behaviour in dev and packaged builds).
- Packaging uses [cargo-packager](https://github.com/crabnebula-dev/cargo-packager) instead of Tauri bundling.

<img width="2770" height="1856" alt="image" src="https://github.com/user-attachments/assets/10c22380-77e9-4702-b6a2-8b23dab4b064" />

## Features

- **Easy Site Management**: Create and manage local WordPress sites with a simple GUI
- **Docker Integration**: Isolated environments with Nginx, PHP-FPM, MariaDB, and Redis
- **WP-CLI Support**: Run WP-CLI commands directly from the interface
- **Development Tools**: Mailpit for email testing
- **Xdebug Support**: Toggle PHP debugging on/off
- **Multisite Support**: WordPress multisite configurations
- **Cross-Platform**: Windows, macOS, and Linux support
- **ARM Support**: Native ARM builds for Apple Silicon and Linux (ARM64)

## Prerequisites

### For Using the App

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) - Required for managing WordPress environments

### For Development (Building from Source)

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Rust](https://rustup.rs/) - stable toolchain
- Linux: `libwebkit2gtk-4.1-dev` (and `libappindicator3-dev`, `librsvg2-dev`, `patchelf` for packaging)

## Installation

### Pre-built Binaries

Download from [GitHub Releases](https://github.com/SpiZeak/DevWP/releases). See the release notes for platform-specific installation instructions.

### Arch Linux (AUR)

```bash
# Using yay
yay -S devwp

# Manual installation
git clone https://aur.archlinux.org/devwp.git
cd devwp
makepkg -si
```

## Development Setup

### Quick Start

```bash
git clone https://github.com/SpiZeak/DevWP.git
cd DevWP

# Set up trusted SSL certificates with mkcert (eliminates browser warnings)
./scripts/setup-certs.sh

# Run the app (starts Docker services on launch)
cargo run
```

### Commands

| Task              | Command                                        |
| ----------------- | ---------------------------------------------- |
| Run (dev)         | `cargo run`                                    |
| Build (release)   | `cargo build --release`                        |
| Test              | `cargo test`                                   |
| Integration tests | `cargo test --test integration` (needs Docker) |
| Lint              | `cargo clippy --all-targets -- -D warnings`    |
| Format            | `cargo fmt --all -- --check` / `cargo fmt`     |
| Rebuild CSS       | `scripts/build-css.sh`                         |
| Package installers| `cargo install cargo-packager --locked && cargo packager --release` |

### Architecture

```
┌────────────────────────────┐
│  Dioxus RSX UI (Rust)      │
│  components/ …             │
│  reads/writes SyncSignals  │
└─────────────┬──────────────┘
              │ direct function calls (no IPC)
┌─────────────┴──────────────┐
│  backend/ (pure Rust fns)  │
│  docker, site, settings,   │
│  wp_cli, xdebug, lifecycle │
└─────────────┬──────────────┘
              │ docker / filesystem
┌─────────────┴──────────────┐
│  compose stack (nginx/php/ │
│  mariadb/redis/mailpit)    │
└────────────────────────────┘
```

State files live in `.devwp-tauri/` (sites.json, settings.json); the webroot defaults to `~/www`.

### Packaging

[cargo-packager](https://github.com/crabnebula-dev/cargo-packager) produces the release artifacts; configuration lives in `[package.metadata.packager]` in `Cargo.toml`. Artifact naming (single `devwp` name everywhere):

- Linux: `devwp_<version>_x86_64.AppImage`, `devwp_<version>_amd64.deb` (+ `_aarch64`/`_arm64` variants)
- Windows: `devwp_<version>_x64-setup.exe`, `devwp_<version>_x64_en-US.msi`
- macOS: `DevWP_<version>_aarch64.dmg`, `DevWP_<version>_x86_64.dmg`

## Usage

### Creating a Site

1. Launch DevWP and click "New Site"
2. Enter a domain name (`.test` is added automatically)
3. Configure options like web root and multisite settings
4. Click "Create" - DevWP handles the rest!

### Managing Sites

- **Access**: Click site URLs to open in browser
- **WP-CLI**: Use the terminal icon to run WordPress commands
- **Delete**: Remove sites completely (includes cleanup)

### Available Services

| Service | Port | URL                   | Purpose       |
| ------- | ---- | --------------------- | ------------- |
| Nginx   | 80   | https://site.test     | Web server    |
| Mailpit | 8025 | http://localhost:8025 | Email testing |

## Troubleshooting

### Common Issues

- **App won't start**: Ensure Docker Desktop is running
- **Sites not loading**: Check ports 80/443 aren't in use by other services
- **Permission errors**: Run DevWP as administrator for hosts file modifications
- **Container issues**: Use the container status panel to restart services
- **UI doesn't reflect CSS changes**: run `scripts/build-css.sh` and commit `src/assets/style.css`

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

CI runs `cargo fmt --check`, `cargo clippy -- -D warnings` and `cargo test` (unit + integration against the real compose stack).

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/SpiZeak)

## License

MIT License - see `LICENSE` file for details.
