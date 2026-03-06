# Tauri Architecture Overview

## Background

DevWP was completely rewritten from a legacy JavaScript desktop stack to Tauri in Rust. This document explains the new architecture, migration benefits, and development approach.

## Why Tauri?

### Key Improvements Over Legacy Architecture

| Aspect                   | Legacy Architecture        | Tauri               |
| ------------------------ | -------------------------- | ------------------- | -------------------------- |
| **Binary Size**          | ~150-300 MB                | ~5-10 MB            | ~96% reduction             |
| **Memory Usage**         | 300-500+ MB                | 50-100 MB           | ~58% reduction             |
| **Startup Time**         | 2-5 seconds                | <1 second           | Faster                     |
| **Runtime Dependencies** | Chromium + Node.js bundled | Native OS libraries | Lighter footprint          |
| **Security Model**       | IPC bridges                | Type-safe Rust APIs | More robust                |
| **OS Integration**       | Limited                    | Native OS features  | Better desktop integration |

### Development Benefits

- **Rust Safety**: Memory safety without garbage collection
- **Type Safety**: TypeScript for UI, Rust for backend
- **Single Binary**: No separate runtime to ship
- **Hot Reload**: Both frontend (React) and backend (Rust) hot reload during development
- **Platform-Native**: Compiles to native executables for each platform

## Architecture

### High-Level Structure

```
DevWP (Single Native Binary)
│
├─ Rust Backend (Tauri + Business Logic)
│  ├── src/tauri/src/main.rs      # Application entry point
│  ├── src/tauri/src/docker.rs    # Docker container management
│  ├── src/tauri/src/site.rs      # WordPress site operations
│  ├── src/tauri/src/wp_cli.rs    # WP-CLI command execution
│  ├── src/tauri/src/settings.rs  # Application settings
│  └── src/tauri/src/...          # Other modules
│
└─ React Frontend (Web UI)
   ├── src/renderer/src/components/  # React components
   ├── src/renderer/src/App.tsx      # Main application
   └── src/renderer/index.html       # HTML entry point
```

### Communication: Tauri Commands

Frontend and backend communicate via **Tauri Commands** (type-safe function calls):

```typescript
// Frontend (src/renderer/src/)
import { invoke } from "@tauri-apps/api/core";

// Call Rust function
const sites = await invoke("get_sites");
const result = await invoke("create_site", { domain: "example.test" });
```

```rust
// Backend (src/tauri/src/)
#[tauri::command]
async fn get_sites() -> Result<Vec<Site>, String> {
    // Rust implementation
    Ok(sites)
}

#[tauri::command]
async fn create_site(domain: String) -> Result<Site, String> {
    // Create site logic
}
```

### State Management

- **Rust Backend**: Manages Docker containers, WordPress database, file system
- **React Frontend**: Manages UI state, user interactions, real-time updates
- **Tauri IPC**: Bridges backend state changes to frontend listeners

## Development Workflow

### Building from Source

```bash
# Install dependencies (Bun is required for development)
bun install

# Start development with hot reload
bun run dev
# Automatically loads:
# - Vite dev server (http://localhost:5173/)
# - Rust backend in debug mode with auto-reload

# Build production binary
bun run build:tauri
# Output: src-tauri/target/release/bundle/
```

### File Organization

**React Frontend** (`src/renderer/`):

- Components: `/src/renderer/src/components/`
- Styles: `/src/renderer/src/assets/`
- Configuration: `vite.config.ts`, `tsconfig.web.json`

**Rust Backend** (`src/tauri/`):

- Implementation: `/src/tauri/src/`
- Dependencies: `/src/tauri/Cargo.toml`
- Configuration: `/src/tauri/tauri.conf.json`

## Key Files and Locations

### Backend (Rust)

| File                        | Purpose                                      |
| --------------------------- | -------------------------------------------- |
| `src/tauri/src/main.rs`     | Tauri app initialization, window setup, menu |
| `src/tauri/src/docker.rs`   | Docker API integration (containers, compose) |
| `src/tauri/src/site.rs`     | WordPress site CRUD operations               |
| `src/tauri/src/wp_cli.rs`   | WP-CLI command execution and streaming       |
| `src/tauri/src/settings.rs` | Application configuration management         |
| `src/tauri/Cargo.toml`      | Rust dependencies and metadata               |

### Frontend (React/TypeScript)

| Directory                               | Purpose                |
| --------------------------------------- | ---------------------- |
| `src/renderer/src/components/SiteList/` | Site management UI     |
| `src/renderer/src/components/ui/`       | Reusable UI components |
| `src/renderer/src/components/Settings/` | Settings interface     |
| `src/renderer/src/assets/`              | CSS and images         |

## Common Development Tasks

### Adding a New Feature

1. **Define Rust Command** (`src/tauri/src/`):

   ```rust
   #[tauri::command]
   async fn my_feature(param: String) -> Result<String, String> {
       // Implementation
   }
   ```

2. **Call from React** (`src/renderer/src/`):

   ```typescript
   const result = await invoke("my_feature", { param: "value" });
   ```

3. **Test**: `bun run dev` with hot reload

### Building/Compilation

```bash
# Type checking (fast, catch TypeScript errors early)
bun run typecheck

# Code formatting
bun run format

# Build for development
bun run dev

# Build production binary
bun run build:tauri
```

## Performance Characteristics

### Startup Time

- **Cold Start**: <500ms (platform-specific, varies by OS)
- **Docker Connection**: 1-2 seconds (Docker Desktop initialization)

### Memory Usage

- **Idle**: 50-100 MB
- **Active Operations**: 100-200 MB

### Build Times

- **Development**: ~10 seconds (hot reload)
- **First Production Build**: 30-60 seconds (Rust compilation)
- **Subsequent Builds**: 15-30 seconds (incremental)

## Deployment

### Distribution Formats

- **Windows**: `.exe` installer executable
- **macOS**: `.dmg` disk image
- **Linux**: `.AppImage` portable binary or package manager

No runtime dependencies required—all is compiled into the single binary.

### Platform-Specific Code

Tauri supports platform-specific code:

```rust
#[cfg(target_os = "windows")]
// Windows-only code

#[cfg(target_os = "macos")]
// macOS-only code

#[cfg(target_os = "linux")]
// Linux-only code
```

## Debugging

### Enable Rust Backtrace

```bash
RUST_BACKTRACE=1 bun run dev
```

### Logging

```rust
use log::{info, debug, error};

info!("Starting operation");
debug!("Detailed info: {:?}", variable);
error!("Error occurred: {}", message);
```

View logs in browser dev tools or terminal output.

### Browser Developer Tools

```bash
# In development mode
Ctrl+Shift+I (Windows/Linux)
Cmd+Option+I (macOS)
```

## Testing

### Unit Tests (Rust)

```bash
# Run Rust tests
cargo test
```

### Integration Tests (React)

```bash
# Run all tests
bun run test

# Watch mode
bun run test:watch

# Coverage
bun run test:coverage
```

## Security Considerations

### Tauri Security Features

- **Command whitelist**: Only explicitly defined commands are callable from frontend
- **Source validation**: Frontend requests validated before Rust execution
- **No eval**: Disabled JavaScript eval for security
- **OS-level permissions**: Respects system permission boundaries

### Best Practices

1. **Validate input** in Rust before processing
2. **Use Tauri's secure APIs** for filesystem/system operations
3. **Keep secrets** in Rust backend, never expose in frontend
4. **Use HTTPS/TLS** for external API calls

## Troubleshooting

### Common Issues

**Rust compilation fails**

```bash
# Update Rust toolchain
rustup update

# Clean build artifacts
cargo clean
```

**Vite dev server won't start**

```bash
# Check port 5173 is available
lsof -i :5173

# Kill process if needed
kill -9 <PID>
```

**Hot reload not working**

```bash
# Restart dev server
bun run dev

# Check file watcher limit (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
```

## Resources

- [Tauri Documentation](https://tauri.app/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [React Documentation](https://react.dev/)
- [DevWP GitHub Repository](https://github.com/SpiZeak/DevWP)
