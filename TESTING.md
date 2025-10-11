# Testing with Vitest

This project uses [Vitest](https://vitest.dev/) for unit testing.

## Quick Start

```bash
# Install dependencies (if not already done)
bun install

# Run tests in watch mode
bun run test

# Run tests once (for CI/CD)
bun run test:run

# Open interactive test UI
bun run test:ui

# Generate coverage report
bun run test:coverage

# Run integration tests (requires Docker)
bun run test:integration

# Run all tests (unit + integration)
bun run test:all
```

## Test Files

Tests are located alongside the source code:

- **Main process tests**: `src/main/**/*.test.ts`
- **Renderer tests**: `src/renderer/**/*.test.tsx`
- **Preload tests**: `src/preload/**/*.test.ts`

## Current Test Coverage

✅ **107 tests passing** (~1.1 seconds)

### Main Process

- **Docker service**: 10 tests - Container management, status parsing
- **Site service**: 19 tests - Database ops, WordPress setup, multisite
- **Nginx service**: 9 tests - Config generation, reload commands
- **Hosts service**: 13 tests - Hosts file management, cross-platform
- **Logger utilities**: 13 tests - Logging operations
- **Validation schemas**: 19 tests - Input validation, schema parsing
- **IPC handlers**: 15 tests - Request validation, error handling

### Renderer

- **SiteList component**: 5 tests - Data structure validation
- **Versions component**: 4 tests - Version display

## Documentation

- **Full testing guide**: [docs/testing-guide.md](./docs/testing-guide.md)
- **Integration testing**: [docs/integration-testing-guide.md](./docs/integration-testing-guide.md)
- **Quick reference**: [docs/testing-quick-reference.md](./docs/testing-quick-reference.md)
- **Setup summary**: [docs/vitest-setup-summary.md](./docs/vitest-setup-summary.md)

## Writing Tests

### Main Process (Node.js)

```typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from './myModule'

describe('myFunction', () => {
  it('should return expected result', () => {
    expect(myFunction('input')).toBe('expected')
  })
})
```

### Renderer (React Components)

```typescript
import { describe, it, expect } from 'vitest'
import { renderWithProviders, screen } from '../test/test-utils'
import MyComponent from './MyComponent'

describe('MyComponent', () => {
  it('should render correctly', () => {
    renderWithProviders(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

## CI/CD

Tests run automatically on:

- Pull requests to master/develop
- Push to master/develop
- Separate jobs for unit tests and integration tests

See [`.github/workflows/tests.yml`](./.github/workflows/tests.yml) for configuration.

## Integration Tests

Integration tests verify interactions with Docker and databases:

```bash
# Requires Docker Desktop running
docker --version

# Run integration tests
bun run test:integration

# Watch mode
bun run test:integration:watch
```

Integration tests automatically:

- Start required Docker services (MariaDB)
- Wait for services to be ready
- Run tests against real databases
- Clean up after completion
- Skip if Docker is unavailable

## Need Help?

Check the [full testing guide](./docs/testing-guide.md) for detailed examples, best practices, and troubleshooting.

For integration testing, see the [integration testing guide](./docs/integration-testing-guide.md).
