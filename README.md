# DevWP

[![Build Status](https://github.com/SpiZeak/DevWP/actions/workflows/release.yml/badge.svg)](https://github.com/SpiZeak/DevWP/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/SpiZeak)

DevWP is a desktop application designed to simplify local WordPress development. It leverages Electron, React, and TypeScript to provide a user-friendly interface for managing WordPress sites within a Docker-powered Nginx and PHP environment.

<img width="1195" height="812" alt="DevWP Screenshot" src="https://github.com/user-attachments/assets/ad1c8b77-ee54-4d7e-b209-d2593af8a14f" />

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
    - [SEO Analysis](#seo-analysis)
    - [Service Versions](#service-versions)
  - [Project Structure](#project-structure)
  - [Troubleshooting](#troubleshooting)
    - [Common Issues](#common-issues)
    - [Container Management](#container-management)
    - [Submodule issues](#submodule-issues)
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
- **SEO Analysis with Seonaut**: Integrated Seonaut for comprehensive SEO auditing and optimization insights
- **Xdebug Support**: Toggle Xdebug on/off for PHP debugging
- **Container Management**: Monitor and restart Docker containers directly from the interface
- **Automatic Placeholder Page**: Generates a default `index.html` for new sites to get you started quickly
- **Cross-Platform**: Built with Electron for compatibility with Windows, macOS, and Linux

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend/Desktop**: Electron, Node.js, TypeScript
- **Environment**: Docker, Docker Compose (Nginx, PHP-FPM, MariaDB, Redis, Mailpit, SonarQube, Seonaut)
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

This project uses Bun for package management and includes the Seonaut submodule for SEO analysis.

```bash
bun install

# Initialize and update the Seonaut submodule
git submodule update --init --recursive
```

### 3. Configure Environment (if necessary)

- Review Docker configurations in `compose.yml` and `config/`.
- **SonarQube Configuration**: Configure the `SONAR_TOKEN` environment variable for SonarQube authentication. See the [SonarQube Configuration](#sonarqube-configuration) section for details.
- The Seonaut submodule provides comprehensive SEO analysis capabilities and will be automatically available after submodule initialization.
- Seonaut configuration can be found in `config/seonaut/` and runs on port 9001 to avoid conflicts with SonarQube.

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

| Service       | Port    | URL                    | Purpose                     |
| ------------- | ------- | ---------------------- | --------------------------- |
| **Nginx**     | 80, 443 | https://your-site.test | Web server with SSL support |
| **PHP-FPM**   | 9000    | -                      | PHP processing              |
| **MariaDB**   | 3306    | -                      | Database server             |
| **Redis**     | 6379    | -                      | Object caching              |
| **Mailpit**   | 8025    | http://localhost:8025  | Email testing interface     |
| **SonarQube** | 9000    | http://localhost:9000  | Code quality analysis       |
| **Seonaut**   | 9001    | http://localhost:9001  | SEO analysis and auditing   |

### Email Testing

- Mailpit automatically captures all emails sent from your WordPress sites
- Access the web interface at `http://localhost:8025`
- No SMTP configuration needed in WordPress

### Code Quality

- SonarQube projects are automatically created for each site
- Access SonarQube at `http://localhost:9000`
- **Authentication**: Configure the `SONAR_TOKEN` environment variable with a valid SonarQube user token (see [SonarQube Configuration](#sonarqube-configuration) below)
- Projects can be scanned directly from the DevWP interface

#### SonarQube Configuration

To use SonarQube features, you need to configure authentication:

1. **Start DevWP and SonarQube**: Run `docker compose up -d` to start the services
2. **Access SonarQube**: Navigate to `http://localhost:9000`
3. **Login with default credentials**: Use `admin` / `admin` for initial setup
4. **Change default password**: SonarQube will prompt you to change the default password
5. **Generate a user token**:
   - Go to Administration > Security > Users
   - Click on "Tokens" for the admin user  
   - Generate a new token with a meaningful name (e.g., "DevWP Integration")
   - Copy the generated token
6. **Configure the environment variable**:
   - Set the `SONAR_TOKEN` environment variable with your token
   - On Linux/macOS: `export SONAR_TOKEN=your_token_here`
   - On Windows: `set SONAR_TOKEN=your_token_here`
   - Alternatively, create a `.env` file in the project root with `SONAR_TOKEN=your_token_here`

**Note**: Without proper token configuration, SonarQube scans will fail with "Not authorized" errors.

### SEO Analysis

- Seonaut is included for comprehensive SEO auditing
- Access Seonaut at `http://localhost:9001`
- Provides insights into on-page optimization, technical SEO issues, and performance metrics
- Integrated seamlessly with your WordPress development workflow
- Analyzes websites for issues that may impact search engine rankings
- Categorizes issues by severity: critical, high, and low impact

### Service Versions

DevWP uses the latest mainline/edge versions of all services to provide cutting-edge features and optimal performance:

- **Nginx**: Built from mainline source with LibreSSL 4.1.0, HTTP/3, and Brotli compression
- **PHP**: Latest FPM Alpine image with all essential extensions (GD, MySQLi, Redis, Xdebug, etc.)
- **MariaDB**: Latest stable release with optimized configuration
- **Redis**: Latest Alpine-based image for high-performance object caching
- **Mailpit**: Latest version for modern email testing capabilities
- **SonarQube**: Latest Community Edition for comprehensive code analysis
- **Seonaut**: Latest version for comprehensive SEO auditing and optimization

This ensures you're always developing with the most current features and security updates available.

## Project Structure

```
DevWP/
├── .github/workflows/     # CI/CD workflows
├── .vscode/              # VSCode specific settings
├── build/                # Icons and platform-specific build resources
├── config/               # Configuration files for Docker services
│   ├── nginx/           # Nginx configuration files
│   ├── php/             # PHP-FPM configuration
│   └── seonaut/         # Seonaut SEO tool configuration
├── resources/            # Static assets for Electron application
├── seonaut/             # Seonaut submodule (SEO analysis tool)
├── src/                 # Application source code
│   ├── main/            # Electron main process (Node.js environment)
│   │   ├── index.ts     # Main entry point for Electron
│   │   └── services/    # Business logic (site creation, management)
│   ├── preload/         # Privileged scripts for Electron
│   └── renderer/        # Electron renderer process (React UI)
│       └── index.html   # Main HTML file for the UI
├── www/                 # WordPress site files storage
│   └── [site-name]/     # Individual site directories
├── compose.yml          # Docker Compose configuration
├── electron.vite.config.ts # Electron Vite configuration
└── package.json         # Project metadata and dependencies
```

## Troubleshooting

### Common Issues

**Stuck loading popup**:

- Try restarting the application by closing and reopening it
- Check the console for any error messages

**Sites not loading**:

- Ensure Docker Desktop is running
- Check that ports 80, 443, 8025, 9000, and 9001 are not in use by other services
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

**Port conflicts**:

- If SonarQube (port 9000) or Seonaut (port 9001) conflict with other services, you can modify the ports in `compose.yml`

### Container Management

Use the container status panel to:

- Monitor container health
- Restart containers if needed
- Toggle Xdebug on/off

### Submodule issues

- If Seonaut features are not working, ensure submodules are properly initialized:
  ```bash
  git submodule update --init --recursive
  ```
- To update Seonaut to the latest version:
  ```bash
  git submodule update --remote seonaut
  ```
- If you encounter issues with the Seonaut submodule, try:
  ```bash
  git submodule deinit seonaut
  git submodule update --init seonaut
  ```

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Support the Project

If you find DevWP useful and would like to support its development, consider buying me a coffee:

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/SpiZeak)

Your support helps maintain and improve DevWP for the WordPress development community!

## License

Distributed under the MIT License. See `LICENSE` file for more information.
