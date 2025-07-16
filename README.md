# DevWP

[![Build Status](https://github.com/SpiZeak/DevWP/actions/workflows/release.yml/badge.svg)](https://github.com/SpiZeak/DevWP/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/SpiZeak)

DevWP is a desktop application designed to simplify local WordPress development. It leverages Electron, React, and TypeScript to provide a user-friendly interface for managing WordPress sites within a Docker-powered Nginx and PHP environment.

<img width="1195" height="812" alt="Screenshot From 2025-07-16 20-07-53" src="https://github.com/user-attachments/assets/12508299-fa87-43f2-9a2e-579eddfecd58" />

## Table of Contents

- [DevWP](#devwp)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Tech Stack](#tech-stack)
  - [Prerequisites](#prerequisites)
  - [Recommended IDE Setup](#recommended-ide-setup)
  - [Getting Started](#getting-started)
    - [1. Clone the Repository](#1-clone-the-repository)
    - [2. Install Dependencies](#2-install-dependencies)
    - [3. Configure Environment (if necessary)](#3-configure-environment-if-necessary)
  - [Development](#development)
    - [Development Commands](#development-commands)
  - [Building the Application](#building-the-application)
  - [Releases](#releases)
  - [How to Use](#how-to-use)
    - [Creating Your First Site](#creating-your-first-site)
    - [Managing Sites](#managing-sites)
    - [WP-CLI Integration](#wp-cli-integration)
  - [Services \& Tools](#services--tools)
    - [Email Testing](#email-testing)
    - [Code Quality](#code-quality)
  - [Project Structure](#project-structure)
  - [Troubleshooting](#troubleshooting)
    - [Common Issues](#common-issues)
    - [Container Management](#container-management)
  - [Contributing](#contributing)
    - [Support the Project](#support-the-project)
  - [License](#license)

## Features

- **Simplified Site Management**: Easily create, configure, and manage local WordPress development sites
- **Site Aliases**: Assign multiple domains to a single site for flexible development and testing
- **WordPress Multisite Support**: Enable subdomain or subdirectory multisite configurations
- **Custom Web Root**: Specify custom web root directories (e.g., `public`, `dist`) for modern WordPress setups
- **Isolated Environments**: Each site runs in its own Dockerized environment, ensuring no conflicts between projects
- **Integrated Nginx & PHP**: Comes pre-configured with Nginx and PHP-FPM, managed via Docker Compose
- **WP-CLI Integration**: Run WP-CLI commands directly from the interface with real-time output streaming
- **Email Testing with Mailpit**: Built-in email testing and debugging with Mailpit's web interface for capturing and viewing emails sent from your WordPress sites
- **SonarQube Integration**: Includes functionality to create and delete SonarQube projects for code quality analysis of your WordPress themes and plugins
- **Xdebug Support**: Toggle Xdebug on/off for PHP debugging
- **Container Management**: Monitor and restart Docker containers directly from the interface
- **Automatic Placeholder Page**: Generates a default `index.html` for new sites to get you started quickly
- **Cross-Platform**: Built with Electron for compatibility with Windows, macOS, and Linux

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend/Desktop**: Electron, Node.js, TypeScript
- **Environment**: Docker, Docker Compose (Nginx, PHP-FPM, MariaDB, Redis, Mailpit, SonarQube)
- **Package Manager**: Bun
- **Build Tool**: Electron Vite

## Prerequisites

Before you begin, ensure you have the following installed:

- [Bun](https://bun.sh/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine)

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/)
  - [ESLint Extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
  - [Prettier Extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/SpiZeak/DevWP.git
cd DevWP
```

### 2. Install Dependencies

This project uses Bun for package management.

```bash
bun install
```

### 3. Configure Environment (if necessary)

- Review Docker configurations in `compose.yml` and `config/`.
- Ensure SonarQube credentials in `src/main/services/site.ts` (specifically within `createSonarQubeProject` and `deleteSonarQubeProject`) are appropriate for your local SonarQube instance. **Note:** The current implementation uses default credentials which is insecure for non-local or production-like SonarQube setups.

## Development

To run the application in development mode with hot-reloading:

```bash
bun run dev
```

This will start the Electron application. Changes in `src/main` or `src/renderer` will typically trigger a reload.

### Development Commands

```bash
# Start development server
bun run dev

# Lint code
bun run lint

# Format code
bun run format

# Type check
bun run typecheck
```

## Building the Application

You can build the application for different platforms:

```bash
# For Windows
bun run build:win

# For macOS
bun run build:mac

# For Linux
bun run build:linux
```

The built application will be located in the `dist` or a similar output directory specified by `electron-builder.yml`.

## Releases

This project uses GitHub Actions to automatically build and create releases for Windows, macOS, and Linux whenever a new version tag (e.g., `v1.0.0`) is pushed.

You can find the latest releases and download installers on the [**GitHub Releases**](https://github.com/SpiZeak/DevWP/releases) page.

## How to Use

### Creating Your First Site

1. **Launch DevWP**: Start the application after installing dependencies (`bun install`) and running in development (`bun run dev`) or by running a built executable
2. **Create a New Site**:
   - Click the "New Site" button
   - Enter a domain name (e.g., `mysite` - `.test` will be added automatically)
   - Optionally specify aliases (space-separated)
   - Set a custom web root if needed (e.g., `public` for Bedrock)
   - Choose WordPress Multisite settings if required
   - Click "Create"

3. **Site Setup Process**:
   - DevWP creates the directory structure under `www/your-site-domain`
   - Docker containers are configured and started
   - Nginx virtual host is created
   - Database is created
   - WordPress is automatically downloaded and installed
   - Hosts file is updated to point your domain to localhost

### Managing Sites

- **Access Sites**: Click on any site URL to open it in your default browser
- **Delete Sites**: Use the delete button to remove sites (includes cleanup of database, hosts file, and Nginx config)
- **Scan with SonarQube**: Analyze code quality using the integrated SonarQube scanner

### WP-CLI Integration

DevWP includes full WP-CLI integration:

1. Click the terminal icon next to any site
2. Enter WP-CLI commands (without the `wp` prefix)
3. View real-time output as commands execute
4. Examples:
   - `plugin list` - List installed plugins
   - `user create admin admin@example.com --role=administrator` - Create a user
   - `theme activate twentytwentyfour` - Activate a theme

## Services & Tools

DevWP includes several pre-configured services:

| Service       | Port    | Purpose                     |
| ------------- | ------- | --------------------------- |
| **Nginx**     | 80, 443 | Web server with SSL support |
| **PHP-FPM**   | 9000    | PHP processing              |
| **MariaDB**   | 3306    | Database server             |
| **Redis**     | 6379    | Object caching              |
| **Mailpit**   | 8025    | Email testing interface     |
| **SonarQube** | 9000    | Code quality analysis       |

### Email Testing

- Mailpit automatically captures all emails sent from your WordPress sites
- Access the web interface at `http://localhost:8025`
- No SMTP configuration needed in WordPress

### Code Quality

- SonarQube projects are automatically created for each site
- Access SonarQube at `http://localhost:9000`
- Default credentials: `admin` / `newAdminPassword1<`

## Project Structure

- `.github/workflows/`: CI/CD workflows (if any).
- `.vscode/`: VSCode specific settings.
- `build/`: Icons and platform-specific build resources.
- `config/`: Configuration files for services like Nginx and PHP used in Docker.
- `resources/`: Static assets for the Electron application.
- `src/`: Application source code.
  - `main/`: Electron main process code (Node.js environment).
    - `index.ts`: Main entry point for the Electron application.
    - `services/`: Business logic, like site creation (`site.ts`).
  - `preload/`: Scripts that run in a privileged environment before web pages are loaded in Electron.
  - `renderer/`: Electron renderer process code (Chromium browser environment - React UI).
    - `index.html`: Main HTML file for the renderer.
- `www/`: Root directory where individual WordPress site files will be stored (e.g., `www/my-site.test/`).
- `compose.yml`: Docker Compose configuration for managing services (Nginx, PHP, MariaDB, etc.).
- `electron.vite.config.ts`: Configuration for Electron Vite.
- `package.json`: Project metadata and dependencies.

## Troubleshooting

### Common Issues

**Sites not loading**:

- Ensure Docker Desktop is running
- Check that ports 80 and 443 are not in use by other services
- Verify hosts file was modified correctly

**Permission errors**:

- Run DevWP as administrator/root when prompted for hosts file modifications
- Check Docker Desktop permissions

**WordPress installation fails**:

- DevWP will create a basic HTML page instead
- You can manually install WordPress in the site directory

**WP-CLI commands not working**:

- Ensure the PHP container is running
- Check that WordPress is properly installed in the site directory

### Container Management

Use the container status panel to:

- Monitor container health
- Restart containers if needed
- Toggle Xdebug on/off

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

### Support the Project

If you find DevWP useful and would like to support its development, consider buying me a coffee:

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/SpiZeak)

Your support helps maintain and improve DevWP for the WordPress development community!

## License

Distributed under the MIT License. See `LICENSE` file for more information.
