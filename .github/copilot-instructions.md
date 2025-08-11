# DevWP - WordPress Development Environment

DevWP is an Electron-based desktop application for managing local WordPress development sites. It uses React, TypeScript, Docker services (Nginx, PHP-FPM, MariaDB, Redis, Mailpit, SonarQube, Seonaut), and provides a graphical interface for creating and managing WordPress installations.

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Bootstrap and Install Dependencies
**CRITICAL**: Bun is the preferred package manager but fails in network-restricted environments. Use npm as primary with bun as fallback.

```bash
# Primary dependency installation (ALWAYS WORKS)
npm install  # Takes ~12 seconds, shows warnings but completes successfully
# NEVER CANCEL: Wait for completion even with warnings. Set timeout to 5+ minutes.

# Initialize submodules (REQUIRED for Seonaut SEO tool)
git submodule update --init --recursive  # Takes ~30 seconds

# Optional: Try bun if network allows (may fail with GitHub API restrictions)
bun install  # FAILS in restricted environments with "GET https://api.github.com/repos/electron/node-gyp/tarball/06b29aa - 403"
```

### Code Quality and Validation
```bash
# Type checking (FASTEST validation)
npm run typecheck  # Takes ~4 seconds. NEVER CANCEL. Set timeout to 3+ minutes.

# Code formatting
npm run format  # Takes ~13 seconds. NEVER CANCEL. Set timeout to 3+ minutes.
# NOTE: Shows formatting errors in seonaut submodule templates, but processes main codebase correctly

# Linting (SLOWEST - many issues in submodule files)
npm run lint  # Takes several minutes, finds ~3685 issues (mostly in config/seonaut/web/static/echarts.min.js)
# NEVER CANCEL: Lint issues are primarily in 3rd-party seonaut submodule, not main codebase. Set timeout to 15+ minutes.
```

### Build Process
```bash
# Core build (VERY FAST)
npm run build  # Takes ~6.6 seconds. NEVER CANCEL. Set timeout to 10+ minutes.

# Platform-specific builds (NETWORK DEPENDENT)
npm run build:linux   # FAILS in restricted networks due to Electron binary downloads
npm run build:win     # FAILS in restricted networks due to Electron binary downloads  
npm run build:mac     # FAILS in restricted networks due to Electron binary downloads
# NEVER CANCEL: Platform builds may take 30+ minutes if network allows. Set timeout to 60+ minutes.
```

### Development Server
```bash
# Start development server
npm run dev  # Starts Vite dev server on http://localhost:5173/ and attempts to launch Electron
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
npm install && npm run typecheck

# 2. Verify code formatting and basic linting
npm run format
npm run typecheck

# 3. Build the application 
npm run build

# 4. If making UI changes, start dev server to test
npm run dev
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
- **Bun installation FAILS**: Use `npm install` instead
- **Docker builds FAIL**: Services require unrestricted internet for package downloads
- **Platform builds FAIL**: Electron binary downloads blocked in restricted networks
- **Seonaut build FAILS**: Go proxy certificate verification issues

### Known Working Alternatives
```bash
# When bun fails
npm install  # Use this instead of bun install

# When Docker fails  
# Test Electron build only: npm run build
# Manual WordPress setup can be documented without running containers

# When platform builds fail
# Core development: npm run build (works fine)
# Testing: npm run dev (Vite server works even if Electron can't launch)
```

### Lint Configuration Issues
- **3685+ lint errors**: Primarily in `config/seonaut/web/static/echarts.min.js` (3rd-party minified library)
- **TypeScript version warning**: Using TS 5.9.2 vs supported <5.9.0 for eslint (non-blocking)
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
eslint.config.mjs        # Linting rules
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

| Command | Expected Time | Timeout Setting | Can Cancel? |
|---------|---------------|-----------------|-------------|
| `npm install` | ~12 seconds | 5+ minutes | **NEVER CANCEL** |
| `npm run typecheck` | ~4 seconds | 3+ minutes | **NEVER CANCEL** |
| `npm run format` | ~13 seconds | 3+ minutes | **NEVER CANCEL** |
| `npm run build` | ~6.6 seconds | 10+ minutes | **NEVER CANCEL** |
| `npm run lint` | 2-5 minutes | 15+ minutes | **NEVER CANCEL** |
| `npm run dev` | ~10 seconds | 5+ minutes | **NEVER CANCEL** |
| `docker compose up` | 15+ minutes first build | 30+ minutes | **NEVER CANCEL** |
| Platform builds | 20-45 minutes | 60+ minutes | **NEVER CANCEL** |

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
npm run typecheck  # Verify TypeScript
npm run format     # Auto-fix formatting
npm run build      # Ensure builds work

# Optional but recommended
npm run lint       # Check for code issues (ignore seonaut submodule errors)
```

## Service Architecture

### Docker Services (when network allows)
| Service | Port | Purpose | Status |
|---------|------|---------|---------|
| Nginx | 80, 443 | Web server with SSL | ✅ Builds when network allows |
| PHP-FPM | 9000 | PHP processing | ✅ Builds when network allows |
| MariaDB | 3306 | Database | ✅ Standard image, reliable |
| Redis | 6379 | Object caching | ✅ Standard image, reliable |
| Mailpit | 8025 | Email testing | ✅ Standard image, reliable |
| SonarQube | 9000 | Code quality | ✅ Standard image, reliable |
| Seonaut | 9001 | SEO analysis | ❌ Build fails in restricted networks |

### When Docker services are unavailable:
- Focus on Electron application development
- Test UI components and core functionality  
- Use `npm run build` and `npm run dev` for development
- Document WordPress setup steps for manual execution

## Troubleshooting Quick Reference

### Dependency Issues
```bash
# Problem: Bun fails with GitHub API errors
# Solution: Use npm instead
npm install

# Problem: Submodule not found errors  
# Solution: Initialize submodules
git submodule update --init --recursive
```

### Build Issues
```bash
# Problem: TypeScript errors
# Solution: Check and fix types
npm run typecheck

# Problem: Lint errors overwhelming output
# Solution: Focus on src/ directory only
npm run lint -- src/
```

### Development Issues
```bash
# Problem: Electron won't start
# Solution: Check if Vite server runs (it should)
npm run dev
# Look for "Local: http://localhost:5173/" - this indicates success

# Problem: Docker services won't start
# Solution: Work without Docker for Electron development
npm run build && npm run dev
```

Remember: **This project prioritizes working Electron builds over full Docker stack** in restricted environments. Focus on application development when infrastructure dependencies fail.