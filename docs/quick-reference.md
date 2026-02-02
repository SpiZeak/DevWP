# Quick Reference: Using New DevWP Features

## Validation with Zod

### Validating Site Configuration

```typescript
import { SiteConfigSchema } from "../validation/schemas";

// Validate user input
try {
  const validatedData = SiteConfigSchema.parse(userInput);
  // Use validatedData safely
} catch (error) {
  // Handle validation error with user-friendly message
  console.error("Invalid input:", error.errors);
}
```

### Creating Custom Schemas

```typescript
import { z } from "zod";

const MySchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  age: z.number().min(0).max(120),
});

type MyType = z.infer<typeof MySchema>;
```

## Structured Logging

### Basic Logging

```typescript
import { logger } from "../services/logger";

logger.info("Operation completed");
logger.warn("Potential issue detected");
logger.error("Operation failed", { context: "additional data" });
logger.debug("Debug information");
```

### Context-Specific Logging

```typescript
import {
  logSiteOperation,
  logDockerOperation,
  logError,
  logWpCliCommand,
} from "../services/logger";

// Site operations
logSiteOperation("create_start", "example.test", {
  webRoot: "public",
  multisite: true,
});

// Docker operations
logDockerOperation("container_start", "devwp_frankenphp", {
  image: "custom-frankenphp",
  ports: [80, 443],
});

// Error logging with context
try {
  await riskyOperation();
} catch (error) {
  logError("operation_context", error as Error, {
    userId: 123,
    action: "specific_action",
  });
  throw error;
}

// WP-CLI commands
logWpCliCommand("example.test", "plugin list", {
  user: "admin",
  duration: 1234,
});
```

### Log Levels

Use appropriate log levels:

- **error**: Operation failures, exceptions
- **warn**: Potential issues, deprecations
- **info**: Important events, user actions
- **http**: HTTP requests (if applicable)
- **debug**: Detailed information for debugging

## Docker Health Checks

### Checking Service Health

```bash
# View health status of all services
docker compose ps

# View detailed health check logs
docker inspect devwp_frankenphp --format='{{.State.Health.Status}}'

# View last 5 health check results
docker inspect devwp_frankenphp --format='{{json .State.Health}}' | jq
```

### Waiting for Healthy Services

```yaml
# In compose.yml
services:
  my-service:
    depends_on:
      mariadb:
        condition: service_healthy
```

### Custom Health Checks

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

## Environment Configuration

### Setting Up Environment

```bash
# Copy example file
cp .env.example .env

# Edit with your settings
nano .env

# Common settings
LOG_LEVEL=debug          # For development
LOG_LEVEL=info           # For production
NODE_ENV=development     # Enable dev features
```

### Reading Environment Variables

```typescript
// In TypeScript/JavaScript
const logLevel = process.env.LOG_LEVEL || "info";
const sonarToken = process.env.SONAR_TOKEN;

// Type-safe approach (create env service)
export const env = {
  logLevel: process.env.LOG_LEVEL || "info",
  sonarToken: process.env.SONAR_TOKEN || "",
  nodeEnv: process.env.NODE_ENV || "production",
};
```

## GitHub Actions & PR Workflow

### Running Checks Locally

```bash
# Type checking
bun run typecheck

# Formatting
bun run format

# Linting
bun run lint -- src/

# Build
bun run build

# Docker validation
docker compose config
docker compose build frankenphp
```

### Bypassing Checks (Emergency Only)

```bash
# Skip CI checks (not recommended)
git commit --no-verify

# Force merge (requires admin access)
# Only use in emergencies
```

### Viewing Check Results

1. Go to PR page on GitHub
2. Scroll to checks section at bottom
3. Click "Details" next to failed check
4. View logs and error messages

## Common Patterns

### Service Function with Validation and Logging

```typescript
import { z } from "zod";
import { logger, logError } from "../services/logger";

const InputSchema = z.object({
  domain: z.string(),
  port: z.number().min(1).max(65535),
});

export async function myService(input: unknown): Promise<void> {
  try {
    // Validate input
    const validated = InputSchema.parse(input);

    logger.info("Service started", { domain: validated.domain });

    // Perform operation
    await performOperation(validated);

    logger.info("Service completed", { domain: validated.domain });
  } catch (error) {
    logError("my-service", error as Error, { input });
    throw error;
  }
}
```

### IPC Handler with Full Error Handling

```typescript
import { ipcMain } from "electron";
import { MySchema } from "../validation/schemas";
import { logError } from "../services/logger";

ipcMain.handle("my-action", async (_, data) => {
  try {
    // Validate
    const validated = MySchema.parse(data);

    // Process
    const result = await processData(validated);

    return { success: true, data: result };
  } catch (error) {
    logError("my-action", error as Error, { data });
    return { success: false, error: (error as Error).message };
  }
});
```

## Troubleshooting

### Validation Errors

```typescript
// Zod error contains detailed information
try {
  MySchema.parse(data);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log("Validation errors:", error.errors);
    // error.errors is an array of specific issues
  }
}
```

### Viewing Logs

```bash
# Linux
tail -f ~/.config/DevWP/logs/devwp-$(date +%Y-%m-%d).log

# View errors only
tail -f ~/.config/DevWP/logs/devwp-error-$(date +%Y-%m-%d).log

# Search logs
grep "error" ~/.config/DevWP/logs/devwp-*.log
```

### Health Check Issues

```bash
# View failing health checks
docker compose ps | grep unhealthy

# Check specific service logs
docker compose logs mariadb --tail=50

# Restart unhealthy service
docker compose restart mariadb
```

## Best Practices

1. **Always validate external input** - Use Zod schemas for user input, API responses
2. **Use structured logging** - Prefer `logger.info()` over `console.log()`
3. **Include context in logs** - Add relevant data to help debugging
4. **Handle errors gracefully** - Use try-catch and logError()
5. **Test locally before PR** - Run all checks before pushing
6. **Update .env.example** - Document new environment variables
7. **Write meaningful health checks** - Ensure they actually verify service health
8. **Review PR checks** - Don't merge with failing checks

## Performance Tips

1. **Validate once** - Don't re-validate already validated data
2. **Use appropriate log levels** - Debug logs in production slow down app
3. **Batch Docker operations** - Start multiple containers together
4. **Monitor log file sizes** - Ensure rotation is working

## Resources

- [Zod Documentation](https://zod.dev/)
- [Winston Documentation](https://github.com/winstonjs/winston)
- [Docker Health Checks](https://docs.docker.com/compose/compose-file/05-services/#healthcheck)
- [DevWP Full Implementation Docs](./improvements-implementation.md)
