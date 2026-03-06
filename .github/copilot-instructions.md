# DevWP - Tauri-Based WordPress Development Environment

DevWP is a **Tauri desktop application** (written in Rust) for managing local WordPress development sites. It features a React/TypeScript UI and integrates with Docker services (Nginx, PHP-FPM, MariaDB, Redis, Mailpit, SonarQube, Seonaut) for isolated WordPress environments.

**Key Architecture**: Rust backend + React TypeScript frontend (Tauri framework)

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Quick Reference: Is Bun/Node Required for Built Apps?

**NO** — Bun is **ONLY needed for development** (building from source). The distributed app is a native compiled binary with no runtime dependencies beyond Docker Desktop.

| Task                                      | Bun Required? | Notes                              |
| ----------------------------------------- | ------------- | ---------------------------------- |
| Use pre-built app (.exe, .dmg, .AppImage) | ❌ No         | Docker Desktop only                |
| Download from releases or AUR             | ❌ No         | Native binary, no runtime          |
| Develop/modify source code                | ✅ Yes        | Dependency for build process       |
| Build from source                         | ✅ Yes        | Required for `bun run build:tauri` |

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
# Web frontend build (VERY FAST)
bun run build:web  # Takes ~6.6 seconds. Compiles React/TypeScript to dist/

# Full Tauri app build (INCLUDES native binary compilation)
bun run build:tauri  # First build: 30-60 seconds, subsequent: 15-30 seconds
# Output: src-tauri/target/release/bundle/ (native executables for current platform)
# No separate platform builds needed - Rust handles native compilation
```

### Development Server

```bash
# Start development with hot reload (Tauri + Vite)
bun run dev  # Starts Tauri in dev mode with Vite dev server on http://localhost:5173/
# Hot reload enabled for frontend code changes
# Will auto-recompile Rust backend changes
# NEVER CANCEL: Set timeout to 5+ minutes.
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
- **Rust compilation FAILS**: In very restricted networks, Rust toolchain may need mirror configuration
- **Seonaut build FAILS**: Go proxy certificate verification issues

### Known Working Alternatives

```bash
# When Docker fails
# Test web build only: bun run build:web
# Manual WordPress setup can be documented without running containers

# When Tauri build fails
# Web frontend: bun run build:web (works fine)
# Development: bun run dev (Tauri dev mode with hot reload)
```

### Lint Configuration Issues

- **3685+ lint errors**: Primarily in `config/seonaut/web/static/echarts.min.js` (3rd-party minified library)
- **Focus on main codebase**: Lint errors in `src/` directory are more relevant than submodule issues

## Project Structure and Navigation

### Key Development Areas

```
src/
├── renderer/       # React frontend (TypeScript + Tailwind CSS)
│   ├── index.html
│   └── src/
│       ├── components/  # React components
│       │   ├── SiteList/    # Site management UI
│       │   └── ui/          # Reusable UI components
│       └── assets/      # CSS and static assets
└── tauri/          # Rust backend (Tauri framework)
    ├── src/        # Rust source code
    ├── Cargo.toml  # Rust dependencies
    └── tauri.conf.json  # Tauri configuration
```

### Configuration Files

```
package.json            # Scripts and dependencies
vite.config.ts          # Vite build configuration
biome.json              # Biome formatter/linter config
src/tauri/Cargo.toml    # Rust dependencies and metadata
src/tauri/tauri.conf.json  # Tauri app configuration
compose.yml             # Docker services definition
config/                 # Docker service configurations
├── nginx/              # Web server config
├── php/                # PHP-FPM config
├── mariadb/            # Database config
└── seonaut/            # SEO analysis tool (submodule)
```

### Always check these locations after changes:

- **Site creation logic**: `src/tauri/src/site.rs`
- **Docker integration**: `src/tauri/src/docker.rs`
- **WP-CLI commands**: `src/tauri/src/wp_cli.rs`
- **UI components**: `src/renderer/src/components/SiteList/`

## Timing Expectations and Timeouts

| Command               | Expected Time                    | Timeout Setting | Can Cancel?      |
| --------------------- | -------------------------------- | --------------- | ---------------- |
| `bun install`         | ~8-12 seconds                    | 5+ minutes      | **NEVER CANCEL** |
| `bun run typecheck`   | ~4 seconds                       | 3+ minutes      | **NEVER CANCEL** |
| `bun run format`      | ~13 seconds                      | 3+ minutes      | **NEVER CANCEL** |
| `bun run build`       | ~6.6 seconds                     | 10+ minutes     | **NEVER CANCEL** |
| `bun run lint`        | 2-5 minutes                      | 15+ minutes     | **NEVER CANCEL** |
| `bun run dev`         | ~10 seconds                      | 5+ minutes      | **NEVER CANCEL** |
| `docker compose up`   | 15+ minutes first build          | 30+ minutes     | **NEVER CANCEL** |
| `bun run build:tauri` | 30-60 sec (first), 15-30 (after) | 60+ minutes     | **NEVER CANCEL** |

**CRITICAL**: Set explicit timeouts and NEVER cancel builds or long-running commands. They may appear to hang but are working.

## CI/CD Integration

### GitHub Actions Workflow

- **Release builds**: Triggered on version tags (`v*.*.*`)
- **Multi-platform**: Builds for Windows, macOS, and Linux
- **Artifact uploads**: Distributable files uploaded to GitHub releases
- **Dependencies**: Uses Bun in CI (may need npm fallback for reliability)

### Before Committing Changes

```bash
# ALWAYS run these validation steps after making changes:

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

- Focus on Tauri application development
- Test UI components and core functionality
- Use `bun run build:web` and `bun run dev` for development
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
# Problem: Tauri window won't open
# Solution: Check if Vite server runs (it should)
bun run dev
# Look for "Local: http://localhost:5173/" - this indicates success

# Problem: Docker services won't start
# Solution: Work without Docker for Tauri development
bun run build && bun run dev
```

Remember: **This project prioritizes working Tauri builds over full Docker stack** in restricted environments. Focus on application development when infrastructure dependencies fail.
