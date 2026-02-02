# DevWP

[![Build Status](https://github.com/SpiZeak/DevWP/actions/workflows/release.yml/badge.svg)](https://github.com/SpiZeak/DevWP/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/SpiZeak)

A desktop application for simplified local WordPress development using Docker and FrankenPHP.

<img width="1195" height="812" alt="DevWP Screenshot" src="https://github.com/user-attachments/assets/ad1c8b77-ee54-4d7e-b209-d2593af8a14f" />

## Features

- **Easy Site Management**: Create and manage local WordPress sites with a simple GUI
- **Docker Integration**: Isolated environments with FrankenPHP, MariaDB, and Redis
- **WP-CLI Support**: Run WP-CLI commands directly from the interface
- **Development Tools**: Mailpit for email testing, SonarQube for code quality, Seonaut for SEO analysis
- **Xdebug Support**: Toggle PHP debugging on/off
- **Multisite Support**: WordPress multisite configurations
- **Cross-Platform**: Windows, macOS, and Linux support

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Bun](https://bun.sh/)

## Installation

### Pre-built Binaries

Download from [GitHub Releases](https://github.com/SpiZeak/DevWP/releases):

- Windows: `devwp-x.x.x-setup.exe`
- macOS: `devwp-x.x.x.dmg`
- Linux: `devwp-x.x.x.AppImage`

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

```bash
# Clone and setup
git clone https://github.com/SpiZeak/DevWP.git
cd DevWP

# Install dependencies
bun install

# Initialize submodules for SEO analysis
git submodule update --init --recursive

# Start development
bun run dev
```

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

| Service    | Port | URL                   | Purpose       |
| ---------- | ---- | --------------------- | ------------- |
| FrankenPHP | 80   | https://site.test     | Web server    |
| Mailpit    | 8025 | http://localhost:8025 | Email testing |
| SonarQube  | 9000 | http://localhost:9000 | Code quality  |
| Seonaut    | 9001 | http://localhost:9001 | SEO analysis  |

## Development

```bash
# Start development server
bun run dev

# Enable verbose container logs
bun run dev -- --verbose

# Other commands
bun run lint      # Check code quality
bun run format    # Format code
bun run typecheck # Type checking
bun run build     # Build for production

# Verbose logging (any command)
DEVWP_VERBOSE=true bun run dev
```

## Building

```bash
# Build for specific platforms
bun run build:win    # Windows
bun run build:mac    # macOS
bun run build:linux  # Linux
```

Download pre-built releases from [GitHub Releases](https://github.com/SpiZeak/DevWP/releases).

## Troubleshooting

### Common Issues

- **App won't start**: Ensure Docker Desktop is running
- **Sites not loading**: Check ports 80/443 aren't in use by other services
- **Permission errors**: Run DevWP as administrator for hosts file modifications
- **Container issues**: Use the container status panel to restart services
- **Submodule problems**: Run `git submodule update --init --recursive`

For SonarQube authentication, set the `SONAR_TOKEN` environment variable with a valid user token from http://localhost:9000.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/SpiZeak)

## License

MIT License - see `LICENSE` file for details.
