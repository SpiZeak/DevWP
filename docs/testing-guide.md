# DevWP Testing Guide

## Overview

DevWP uses Vitest for both unit and integration testing. The testing ecosystem covers service layer, IPC handlers, React components, and integration with Docker services.

## Quick Start

```bash
# Install dependencies
bun install

# Run all unit tests
bun run test:run

# Run tests in watch mode
bun run test

# Run tests with UI
bun run test:ui

# Generate coverage report
bun run test:coverage

# Run integration tests (requires Docker)
bun run test:integration

# Run all tests (unit + integration)
bun run test:all
```

## Test Structure

```
src/
├── main/
│   ├── ipc/
│   │   └── site-handlers.test.ts    # IPC handler tests
│   ├── services/
│   │   ├── docker.test.ts           # Docker service tests
│   │   ├── nginx.test.ts            # Nginx config tests
│   │   ├── site.test.ts             # Site management tests
│   │   └── hosts.test.ts            # Hosts file tests
│   └── validation/
│       └── schemas.test.ts          # Schema validation tests
├── renderer/
│   └── src/
│       └── components/
│           ├── SiteList/
│           │   └── SiteList.test.tsx  # Component tests
│           └── Versions.test.tsx       # Version display tests
└── test/
    ├── integration-setup.ts           # Integration test setup
    └── test-utils.tsx                 # Test utilities
```

## Test Categories

### Unit Tests

Unit tests verify individual functions and components in isolation using mocks.

**Location**: `*.test.ts` or `*.test.tsx` files
**Config**: `vitest.config.ts`
**Run**: `bun run test:run`

**Example**:

```typescript
import { describe, it, expect } from 'vitest'
import { sanitizeDatabaseName } from './database'

describe('sanitizeDatabaseName', () => {
  it('should replace dots with underscores', () => {
    expect(sanitizeDatabaseName('example.test')).toBe('example_test')
  })
})
```

### Integration Tests

Integration tests verify interactions between services and Docker containers.

**Location**: `*.integration.test.ts` files
**Config**: `vitest.config.integration.ts`
**Run**: `bun run test:integration`
**Requirements**: Docker Desktop running

**Example**:

```typescript
import { describe, it, expect } from 'vitest'
import { saveSiteConfiguration, getSiteConfiguration } from './database'

describe('Database Integration', () => {
  it('should persist site configuration', async () => {
    const site = { domain: 'test.local', createdAt: new Date() }
    await saveSiteConfiguration(site)

    const retrieved = await getSiteConfiguration('test.local')
    expect(retrieved?.domain).toBe('test.local')
  })
})
```

## Test Utilities

### Test Utils (`src/test/test-utils.tsx`)

**`renderWithProviders()`**: Render React components with providers

```typescript
import { renderWithProviders, screen } from '../test/test-utils'

it('should render component', () => {
  renderWithProviders(<MyComponent />)
  expect(screen.getByText('Hello')).toBeInTheDocument()
})
```

**`createMockIpcRenderer()`**: Create mock Electron IPC renderer

```typescript
const mockIpc = createMockIpcRenderer({
  invoke: vi.fn((channel) => {
    if (channel === 'get-sites') return Promise.resolve([])
  })
})
```

## Testing Patterns

### Mocking Child Process

```typescript
import { vi } from 'vitest'
import { exec } from 'child_process'

vi.mock('child_process')

vi.mocked(exec).mockImplementation((cmd, callback) => {
  if (typeof callback === 'function') {
    callback(null, 'output', '')
  }
  return {} as unknown as ReturnType<typeof exec>
})
```

### Mocking File System

```typescript
import { promises as fs } from 'fs'

vi.mock('fs')

vi.mocked(fs.writeFile).mockResolvedValue(undefined)
vi.mocked(fs.readFile).mockResolvedValue('file content')
```

### Testing Async Operations

```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction()
  expect(result).toBe('expected value')
})
```

### Testing Error Handling

```typescript
it('should handle errors gracefully', async () => {
  vi.mocked(someFunction).mockRejectedValue(new Error('Failed'))

  await expect(myFunction()).rejects.toThrow('Failed')
})
```

## Coverage Goals

| Area                         | Target Coverage | Priority |
| ---------------------------- | --------------- | -------- |
| Services (main/services)     | 80%+            | High     |
| Validation (main/validation) | 90%+            | High     |
| IPC Handlers (main/ipc)      | 75%+            | High     |
| Components (renderer)        | 60%+            | Medium   |
| Utilities                    | 85%+            | Medium   |

## CI/CD Integration

Tests run automatically on:

- Push to `master` or `develop` branches
- Pull requests to `master` or `develop`

### GitHub Actions Workflow

```yaml
- name: Run unit tests
  run: bun run test:run
  timeout-minutes: 10

- name: Run integration tests
  run: bun run test:integration
  timeout-minutes: 15
```

## Writing New Tests

### 1. Choose Test Type

- **Unit Test**: Testing pure functions, isolated logic
- **Integration Test**: Testing Docker interactions, database operations

### 2. Create Test File

```bash
# Unit test
touch src/main/services/my-service.test.ts

# Integration test
touch src/main/services/my-service.integration.test.ts
```

### 3. Write Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('MyService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Feature Name', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test'

      // Act
      const result = myFunction(input)

      // Assert
      expect(result).toBe('expected')
    })
  })
})
```

### 4. Run and Validate

```bash
# Run your specific test
bun run test my-service.test.ts

# Run all tests
bun run test:run

# Check coverage
bun run test:coverage
```

## Debugging Tests

### Run Single Test

```bash
bun run test -t "should do something specific"
```

### Run Single File

```bash
bun run test src/main/services/docker.test.ts
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "bun",
  "runtimeArgs": ["test"],
  "console": "integratedTerminal"
}
```

### Verbose Output

```bash
DEBUG=* bun run test
```

## Common Issues

### Docker Not Available

Integration tests will skip automatically if Docker isn't running:

```bash
# Check Docker status
docker --version
docker compose ps
```

### Port Conflicts

If services fail to start, check for port conflicts:

```bash
# Check what's using port 3306
lsof -i :3306

# Stop conflicting services
docker compose down
```

### Timeout Errors

Increase timeout for slow operations:

```typescript
it('slow operation', async () => {
  // test code
}, 60000) // 60 second timeout
```

### Mock Not Working

Ensure mocks are defined before imports:

```typescript
vi.mock('child_process') // Must be at top level

import { exec } from 'child_process'
```

## Best Practices

1. **Arrange-Act-Assert**: Structure tests clearly
2. **One Assertion Per Test**: Keep tests focused
3. **Descriptive Names**: Use clear, specific test names
4. **Clean Up**: Clear mocks in `beforeEach`
5. **Mock External Dependencies**: Don't make real API calls
6. **Test Edge Cases**: Cover error conditions and boundaries
7. **Keep Tests Fast**: Unit tests should run in milliseconds
8. **Isolated Tests**: Each test should be independent

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Documentation](https://testing-library.com/)
- [Integration Testing Guide](./integration-testing-guide.md)
- [Quick Reference](./testing-quick-reference.md)

## Maintenance

### Updating Snapshots

```bash
bun run test -u
```

### Cleaning Test Cache

```bash
rm -rf node_modules/.vitest
```

### Viewing Coverage Report

```bash
bun run test:coverage
open coverage/index.html
```
