# DevWP - WordPress Development Environment

DevWP is an Electron-based desktop application for managing local WordPress development sites. It uses React, TypeScript, Docker services (Nginx, PHP-FPM, MariaDB, Redis, Mailpit, SonarQube, Seonaut), and provides a graphical interface for creating and managing WordPress installations.

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Bootstrap and Install Dependencies

**CRITICAL**: Bun is the exclusive package manager for this project.

```bash
# Install dependencies with Bun
bun install  # Takes ~8-12 seconds
# NEVER CANCEL: Wait for completion even with warnings. Set timeout to 5+ minutes.

# Initialize submodules (REQUIRED for Seonaut SEO tool)
git submodule update --init --recursive  # Takes ~30 seconds
```

### Code Quality and Validation

```bash
# Type checking (FASTEST validation)
bun run typecheck  # Takes ~4 seconds. NEVER CANCEL. Set timeout to 3+ minutes.

# Code formatting
bun run format  # Takes ~13 seconds. NEVER CANCEL. Set timeout to 3+ minutes.
# NOTE: Shows formatting errors in seonaut submodule templates, but processes main codebase correctly

# Linting (SLOWEST - many issues in submodule files)
bun run lint  # Takes several minutes, finds ~3685 issues (mostly in config/seonaut/web/static/echarts.min.js)
# NEVER CANCEL: Lint issues are primarily in 3rd-party seonaut submodule, not main codebase. Set timeout to 15+ minutes.
```

### Build Process

```bash
# Core build (VERY FAST)
bun run build  # Takes ~6.6 seconds. NEVER CANCEL. Set timeout to 10+ minutes.

# Platform-specific builds (NETWORK DEPENDENT)
bun run build:linux   # FAILS in restricted networks due to Electron binary downloads
bun run build:win     # FAILS in restricted networks due to Electron binary downloads
bun run build:mac     # FAILS in restricted networks due to Electron binary downloads
# NEVER CANCEL: Platform builds may take 30+ minutes if network allows. Set timeout to 60+ minutes.
```

### Development Server

```bash
# Start development server
bun run dev  # Starts Vite dev server on http://localhost:5173/ and attempts to launch Electron
# NEVER CANCEL: May fail to launch Electron in sandboxed environments but Vite server will work. Set timeout to 5+ minutes.
```

### Docker Services (NETWORK DEPENDENT)

```bash
# Start all services (MAY FAIL in restricted environments)
docker compose up -d  # FAILS due to network restrictions preventing package downloads in firewall-protected environments
# NEVER CANCEL: First build takes 15+ minutes if network allows. Set timeout to 30+ minutes.

# Check Docker availability
docker --version  # Should show Docker version
docker compose --version  # Should show Docker Compose commands
```

## Validation Requirements

### ALWAYS run these validation steps after making changes:

```bash
# 1. Install dependencies and check they work
bun install && bun run typecheck

# 2. Verify code formatting and basic linting
bun run format
bun run typecheck

# 3. Build the application
bun run build

# 4. If making UI changes, start dev server to test
bun run dev
```

### Manual Testing Scenarios (when Docker works)

**CRITICAL**: Always test actual functionality after changes, not just builds.

1. **Site Creation Workflow**:
   - Create new WordPress site through UI
   - Verify domain configuration
   - Test WordPress installation
   - Access site in browser

2. **WP-CLI Integration**:
   - Open terminal for a site
   - Run basic commands like `plugin list`, `user list`
   - Verify real-time output streaming

3. **Service Management**:
   - Check container status in UI
   - Test Xdebug toggle functionality
   - Verify service restart capabilities

## Common Issues and Limitations

### Network Restrictions

- **Docker builds FAIL**: Services require unrestricted internet for package downloads
- **Platform builds FAIL**: Electron binary downloads blocked in restricted networks
- **Seonaut build FAILS**: Go proxy certificate verification issues

### Known Working Alternatives

```bash
# When Docker fails
# Test Electron build only: bun run build
# Manual WordPress setup can be documented without running containers

# When platform builds fail
# Core development: bun run build (works fine)
# Testing: bun run dev (Vite server works even if Electron can't launch)
```

### Lint Configuration Issues

- **3685+ lint errors**: Primarily in `config/seonaut/web/static/echarts.min.js` (3rd-party minified library)
- **Focus on main codebase**: Lint errors in `src/` directory are more relevant than submodule issues

## Project Structure and Navigation

### Key Development Areas

```
src/
├── main/           # Electron main process (Node.js backend)
│   ├── index.ts    # Application entry point
│   ├── ipc/        # Inter-process communication handlers
│   └── services/   # Core business logic (site creation, Docker management)
├── preload/        # Electron preload scripts (security bridge)
└── renderer/       # React frontend (TypeScript + Tailwind CSS)
    └── src/
        ├── components/  # React components
        │   ├── SiteList/    # Site management UI
        │   └── ui/          # Reusable UI components
        └── assets/      # CSS and static assets
```

### Configuration Files

```
package.json              # Scripts and dependencies
electron.vite.config.ts   # Build configuration
biome.json                # Biome formatter/linter config
compose.yml              # Docker services definition
config/                  # Docker service configurations
├── nginx/               # Web server config
├── php/                 # PHP-FPM config
└── seonaut/             # SEO analysis tool (submodule)
```

### Always check these locations after changes:

- **Site creation logic**: `src/main/services/site.ts`
- **Docker integration**: `src/main/services/docker.ts`
- **UI components**: `src/renderer/src/components/SiteList/`
- **IPC handlers**: `src/main/ipc/`

## Timing Expectations and Timeouts

| Command             | Expected Time           | Timeout Setting | Can Cancel?      |
| ------------------- | ----------------------- | --------------- | ---------------- |
| `bun install`       | ~8-12 seconds           | 5+ minutes      | **NEVER CANCEL** |
| `bun run typecheck` | ~4 seconds              | 3+ minutes      | **NEVER CANCEL** |
| `bun run format`    | ~13 seconds             | 3+ minutes      | **NEVER CANCEL** |
| `bun run build`     | ~6.6 seconds            | 10+ minutes     | **NEVER CANCEL** |
| `bun run lint`      | 2-5 minutes             | 15+ minutes     | **NEVER CANCEL** |
| `bun run dev`       | ~10 seconds             | 5+ minutes      | **NEVER CANCEL** |
| `docker compose up` | 15+ minutes first build | 30+ minutes     | **NEVER CANCEL** |
| Platform builds     | 20-45 minutes           | 60+ minutes     | **NEVER CANCEL** |

**CRITICAL**: Set explicit timeouts and NEVER cancel builds or long-running commands. They may appear to hang but are working.

## CI/CD Integration

### GitHub Actions Workflow

- **Release builds**: Triggered on version tags (`v*.*.*`)
- **Multi-platform**: Builds for Windows, macOS, and Linux
- **Artifact uploads**: Distributable files uploaded to GitHub releases
- **Dependencies**: Uses Bun in CI (may need npm fallback for reliability)

### Before Committing Changes

```bash
# ALWAYS run these commands before commits
bun run typecheck  # Verify TypeScript
bun run format     # Auto-fix formatting
bun run build      # Ensure builds work

# Optional but recommended
bun run lint       # Check for code issues (ignore seonaut submodule errors)
```

## Service Architecture

### Docker Services (when network allows)

| Service   | Port    | Purpose             | Status                                |
| --------- | ------- | ------------------- | ------------------------------------- |
| Nginx     | 80, 443 | Web server with SSL | ✅ Builds when network allows         |
| PHP-FPM   | 9000    | PHP processing      | ✅ Builds when network allows         |
| MariaDB   | 3306    | Database            | ✅ Standard image, reliable           |
| Redis     | 6379    | Object caching      | ✅ Standard image, reliable           |
| Mailpit   | 8025    | Email testing       | ✅ Standard image, reliable           |
| SonarQube | 9000    | Code quality        | ✅ Standard image, reliable           |
| Seonaut   | 9001    | SEO analysis        | ❌ Build fails in restricted networks |

### When Docker services are unavailable:

- Focus on Electron application development
- Test UI components and core functionality
- Use `bun run build` and `bun run dev` for development
- Document WordPress setup steps for manual execution

## Troubleshooting Quick Reference

### Dependency Issues

```bash
# Problem: Submodule not found errors
# Solution: Initialize submodules
git submodule update --init --recursive

# Problem: Slow installation
# Solution: Clear Bun cache and retry
bun pm cache rm
bun install
```

### Build Issues

```bash
# Problem: TypeScript errors
# Solution: Check and fix types
bun run typecheck

# Problem: Lint errors overwhelming output
# Solution: Focus on src/ directory only
bun run lint -- src/
```

### Development Issues

```bash
# Problem: Electron won't start
# Solution: Check if Vite server runs (it should)
bun run dev
# Look for "Local: http://localhost:5173/" - this indicates success

# Problem: Docker services won't start
# Solution: Work without Docker for Electron development
bun run build && bun run dev
```

Remember: **This project prioritizes working Electron builds over full Docker stack** in restricted environments. Focus on application development when infrastructure dependencies fail.
