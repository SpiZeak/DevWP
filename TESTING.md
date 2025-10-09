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
```

## Test Files

Tests are located alongside the source code:

- **Main process tests**: `src/main/**/*.test.ts`
- **Renderer tests**: `src/renderer/**/*.test.tsx`
- **Preload tests**: `src/preload/**/*.test.ts`

## Current Test Coverage

✅ **36 tests passing**

- Validation schemas: 19 tests
- Logger utilities: 13 tests
- React components: 4 tests

## Documentation

- **Full guide**: [docs/testing.md](./docs/testing.md)
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

- Pull requests (`.github/workflows/pr.yml`)
- Push to master/develop (`.github/workflows/test.yml`)

## Need Help?

Check the [full testing guide](./docs/testing.md) for detailed examples and troubleshooting.
