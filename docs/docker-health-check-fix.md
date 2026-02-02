# Docker Health Check and Compose Command Fix

> Note: This document describes the legacy Nginx + PHP-FPM setup. DevWP now uses FrankenPHP.

## Issues

### 1. Container Version Detection on Non-Running Containers

Error getting Nginx version for container that is not running:

```
Error: Command failed: docker exec 4409f3e0e0e4 nginx -v
Error response from daemon: container 4409f3e0e0e47360a121c8407eddadc3843bbd6d4e9e3eb1ecd3d95791d5d8fb is not running
```

### 2. Docker Compose Exit Code 1

```
Docker compose failed: Error: Docker compose exited with code 1
    at ChildProcess.<anonymous> (/home/max/Projects/DevWP/out/main/index.js:109:16)
```

### 3. SonarQube Health Check Timeout

```
curl: (7) Failed to connect to localhost port 9000 after 0 ms: Couldn't connect to server
```

This error occurs because SonarQube takes 60-90 seconds to fully start, but containers depending on it were timing out.

### 4. PHP Health Check Failing

```
/bin/sh: php-fpm-healthcheck: not found
```

The PHP container health check was using `php-fpm-healthcheck` command which doesn't exist in the `php:fpm-alpine` base image, causing the container to remain in "unhealthy" state indefinitely.

## Root Causes

### Issue 1: Container State Checking

After implementing Docker health checks in `compose.yml`, containers can be in various states:

- **running** - Container is fully operational
- **starting** - Container is starting up but not yet healthy
- **unhealthy** - Container is running but health check is failing
- **exited** - Container has stopped

The `getContainerVersion()` function was attempting to execute commands (like `nginx -v`) inside containers regardless of their state, causing errors when containers were not in a "running" state.

### Issue 2: Deprecated Docker Compose Command

The application was using the deprecated `docker-compose` command (with hyphen) instead of the modern `docker compose` command (without hyphen). This caused failures on systems where:

1. Only the new Docker CLI plugin is installed
2. The standalone `docker-compose` binary is not available
3. Docker Desktop is configured to use the new syntax only

### Issue 3: SonarQube Blocking Nginx Startup

SonarQube was configured as a required healthy dependency for Nginx (`condition: service_healthy`). Since SonarQube takes 60-90 seconds to start and isn't critical for serving WordPress sites, this unnecessarily blocked the entire application startup.

### Issue 4: PHP Health Check Command Missing

The health check was using `php-fpm-healthcheck` which is not a standard command in the `php:fpm-alpine` Docker image. This command needs to be installed separately (usually via composer package `renatomefi/php-fpm-healthcheck`) or replaced with a simpler check.

## Solutions

### Fix 1: Container State Checking (Version Detection)

Modified `src/main/services/docker.ts` to check container state before attempting to get version information:

**Updated `getDockerContainers()`** - Only fetch versions for running containers:

```typescript
// Fetch version information only for running containers
try {
  for (const container of containers) {
    // Only get version if container is running
    if (container.state === "running") {
      const version = await getContainerVersion(container.id, container.name);
      container.version = version;
    }
  }
} catch (versionError) {
  console.error("Error fetching container versions:", versionError);
}
```

**Refactored `getContainerVersion()`** - Accept container name as optional parameter:

```typescript
function getContainerVersion(
  containerId: string,
  containerName?: string,
): Promise<string | undefined>;
```

**Created `getVersionForContainer()`** - Separate helper function to handle version detection logic:

```typescript
function getVersionForContainer(
  containerId: string,
  containerName: string,
  resolve: (value: string | undefined) => void,
): void;
```

### Fix 2: Modern Docker Compose Command

Updated all Docker Compose commands to use the modern `docker compose` syntax:

**Before:**

```typescript
const command = isWin ? "docker-compose.exe" : "docker-compose";
const dockerProcess = spawn(command, ["up", "-d", "--build", "nginx"]);
```

**After:**

```typescript
const command = isWin ? "docker.exe" : "docker";
const args = ["compose", "up", "-d", "--build", "nginx"];
const dockerProcess = spawn(command, args);
```

**Changes Applied To:**

1. `startDockerCompose()` - Main container startup function
2. `startMariaDBContainer()` - Database initialization
3. `stopDockerCompose()` - Container shutdown function

**Additional Improvements:**

- Added error event handler to catch spawn failures
- Improved error messages for better debugging
- Better success/failure status messages sent to UI

### Fix 3: SonarQube Dependency Optimization

**Removed SonarQube as blocking dependency for Nginx:**

- Removed SonarQube from Nginx's `depends_on` list
- SonarQube is optional for code quality scanning, not required for serving sites
- Nginx can now start immediately once core services (PHP, MariaDB, Redis) are healthy

**Increased SonarQube health check tolerances:**

```yaml
healthcheck:
  interval: 30s
  timeout: 10s
  retries: 10 # Increased from 5
  start_period: 120s # Increased from 60s
```

**Made Seonaut dependency flexible:**

```yaml
depends_on:
  sonarqube:
    condition: service_started # Changed from service_healthy
```

This allows Seonaut to start once SonarQube container is running, without waiting for it to be fully healthy.

### Fix 4: PHP Health Check Command

**Changed from non-existent command to simple process check:**

```yaml
# Before (BROKEN)
healthcheck:
  test: ['CMD-SHELL', 'php-fpm-healthcheck || exit 1']

# After (WORKING)
healthcheck:
  test: ['CMD-SHELL', 'pidof php-fpm || exit 1']
```

The `pidof php-fpm` command is available in Alpine Linux and simply checks if the php-fpm process is running. This is a lightweight and reliable health check that doesn't require additional packages.

**Alternative health checks considered:**

1. `nc -z 127.0.0.1 9000` - Checks if PHP-FPM is listening on port 9000 (also works)
2. Installing `renatomefi/php-fpm-healthcheck` - Requires adding to Dockerfile
3. `cgi-fcgi -bind -connect 127.0.0.1:9000` - Requires fcgi package installation

The `pidof` approach was chosen for simplicity and reliability.

## Benefits

### From Container State Fix:

1. **No More Errors** - Commands are only executed on running containers
2. **Faster Performance** - Skips version detection for non-running containers
3. **Better UX** - UI doesn't show error messages for containers that are starting up
4. **Health Check Compatible** - Works seamlessly with health check dependencies

### From Modern Command Fix:

1. **Future Proof** - Uses current Docker CLI syntax
2. **Better Compatibility** - Works with Docker Desktop and standalone Docker
3. **Improved Error Handling** - Catches command spawn failures
4. **Clearer Messages** - Better user feedback on success/failure

### From Dependency Optimization:

1. **Faster Startup** - Nginx no longer waits for SonarQube to be healthy
2. **More Resilient** - Application works even if SonarQube fails to start
3. **Better UX** - Sites are accessible sooner (within ~30 seconds instead of ~90 seconds)
4. **Realistic Expectations** - Health checks allow adequate time for SonarQube initialization

### From PHP Health Check Fix:

1. **Container Becomes Healthy** - PHP container now properly reports healthy status
2. **No External Dependencies** - Uses built-in `pidof` command
3. **Fast and Lightweight** - Process check is instant with minimal overhead
4. **Nginx Can Start** - Dependent services can now properly wait for PHP to be ready

## Testing

```bash
# Check container states
docker compose ps

# All containers should show healthy status:
# - php: (healthy)
# - mariadb: (healthy)
# - redis: (healthy)
# - nginx: (healthy)
# - mailpit: (healthy)
# - sonarqube: (healthy) - takes 60-90 seconds
# - seonaut: (healthy)

# Test PHP health check manually
docker exec devwp_php pidof php-fpm
# Should return process IDs like: 8 7 1

# Verify modern command works
docker compose version
```

## Expected Startup Behavior

After these fixes:

1. **MariaDB** starts first (~10-15 seconds to healthy)
2. **PHP, Redis, Mailpit** start in parallel (~5-10 seconds to healthy)
3. **Nginx** starts once core services are healthy (~30 seconds total)
4. **Sites are accessible** at this point
5. **SonarQube** continues starting in background (~60-90 seconds to healthy)
6. **Seonaut** starts once SonarQube container is running

## Related Files

- `src/main/services/docker.ts` - Fixed version detection and updated commands
- `compose.yml` - Health checks configuration and dependency optimization

## Migration Notes

Systems using the old `docker-compose` standalone binary will automatically switch to using `docker compose` (Docker CLI plugin). No action required unless:

- System has neither `docker-compose` binary nor Docker CLI plugin
- Docker version is very old (< 20.10)

In those cases, users should:

1. Update Docker to latest version (recommended)
2. Or install Docker Compose V2 plugin

## Status

✅ **Fixed** - Version detection now respects container state
✅ **Fixed** - Docker Compose commands use modern syntax
✅ **Fixed** - SonarQube no longer blocks Nginx startup
✅ **Fixed** - PHP health check uses `pidof` instead of missing command
✅ **Tested** - Build and type checking pass successfully
✅ **Validated** - Docker Compose configuration is valid
✅ **Verified** - PHP container reports healthy status within 5 seconds
