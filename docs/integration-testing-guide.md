# Integration Testing Guide

## Overview

Integration tests verify that different parts of DevWP work together correctly, especially interactions with Docker and databases.

## Running Integration Tests

```bash
# Run integration tests once
bun run test:integration

# Run in watch mode
bun run test:integration:watch

# Run all tests (unit + integration)
bun run test:all
```

## Prerequisites

Integration tests require:

- Docker Desktop running
- MariaDB container available
- Network access for Docker

## What Integration Tests Cover

- **Database Operations**: Real database queries and transactions
- **Docker Commands**: Actual container management
- **File System**: Real file creation and permissions
- **Multi-Service Interactions**: frankenphp + database coordination

## Writing Integration Tests

```typescript
import { describe, it, expect } from "vitest";
import { initializeConfigDatabase, saveSiteConfiguration } from "./database";

describe("Database Integration", () => {
  it("should persist site configuration", async () => {
    await initializeConfigDatabase();

    const site = {
      domain: "test.local",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await saveSiteConfiguration(site);
    const retrieved = await getSiteConfiguration("test.local");

    expect(retrieved).toBeDefined();
    expect(retrieved?.domain).toBe("test.local");
  });
});
```

## Test Isolation

Each integration test:

1. Uses a fresh database state
2. Cleans up after itself
3. Doesn't depend on other tests
4. Uses unique identifiers to avoid conflicts

## Troubleshooting

### Docker Not Available

If Docker isn't running, integration tests are skipped automatically with a warning.

### Database Connection Failures

Check that MariaDB is healthy:

```bash
docker compose ps mariadb
docker compose logs mariadb
```

### Timeout Errors

Integration tests have longer timeouts (30s). If tests still timeout:

```typescript
it("slow test", async () => {
  // test code
}, 60000); // 60 second timeout
```

## CI/CD Integration

Integration tests run in GitHub Actions with:

- Docker Compose setup
- MariaDB health checks
- Automatic cleanup
- Separate job from unit tests

## Best Practices

1. **Use Real Services**: Don't mock Docker or databases in integration tests
2. **Clean Up**: Always clean up test data
3. **Isolated Data**: Use unique names/IDs for test resources
4. **Health Checks**: Wait for services to be ready
5. **Timeouts**: Set appropriate timeouts for slow operations
6. **Environment Variables**: Use test-specific configuration
7. **Parallel Execution**: Ensure tests can run in parallel safely

## Test Structure

```
src/
├── main/
│   └── services/
│       ├── docker.test.ts              # Unit tests
│       ├── docker.integration.test.ts   # Integration tests
│       └── docker.ts                    # Implementation
└── test/
    ├── integration-setup.ts             # Integration test setup
    └── test-utils.tsx                   # Test utilities
```

## Environment Configuration

Integration tests use environment variables:

- `TEST_DATABASE`: Database name for tests
- `TEST_DOCKER_TIMEOUT`: Timeout for Docker operations
- `SKIP_DOCKER_TESTS`: Skip tests requiring Docker

## Continuous Integration

GitHub Actions workflow includes:

```yaml
integration-tests:
  runs-on: ubuntu-latest
  steps:
    - name: Start Docker services
      run: docker compose up -d mariadb

    - name: Wait for MariaDB
      run: timeout 30 bash -c 'until docker exec devwp_mariadb mariadb-admin ping; do sleep 1; done'

    - name: Run integration tests
      run: bun run test:integration
```

## Coverage Goals

- **Services**: 80%+ coverage
- **IPC Handlers**: 75%+ coverage
- **Database Operations**: 85%+ coverage
- **Docker Integration**: 70%+ coverage

## Common Patterns

### Testing Database Operations

```typescript
it("should save configuration", async () => {
  await saveSiteConfiguration(config);
  const result = await getSiteConfiguration(config.domain);
  expect(result).toEqual(expect.objectContaining(config));
});
```

### Testing Docker Commands

```typescript
it("should start container", async () => {
  const result = await startContainer("devwp_frankenphp");
  expect(result.success).toBe(true);

  const status = await getContainerStatus("devwp_frankenphp");
  expect(status).toBe("running");
});
```

### Testing File Operations

```typescript
it("should create frankenphp config", async () => {
  await generateFrankenphpConfig("example.test", config);

  const exists = await fs.access(configPath);
  expect(exists).toBe(true);

  const content = await fs.readFile(configPath, "utf-8");
  expect(content).toContain("server_name example.test");
});
```

## Performance Considerations

- Integration tests are slower than unit tests (expected)
- Use `beforeAll` for expensive setup operations
- Clean up in `afterEach` to avoid state pollution
- Use test.concurrent sparingly (may cause race conditions)

## Debugging Integration Tests

```bash
# Run single integration test
bun run test:integration -t "should persist site configuration"

# Run with verbose logging
DEBUG=* bun run test:integration

# Keep Docker containers after test failure
KEEP_CONTAINERS=1 bun run test:integration
```

## Migration from Unit to Integration Tests

When to use integration tests instead of unit tests:

- Testing actual Docker interactions
- Verifying database schema and queries
- Testing file system permissions
- Multi-service coordination
- End-to-end workflows

When to keep unit tests:

- Business logic validation
- Input sanitization
- Error handling
- Schema validation
- Pure functions
