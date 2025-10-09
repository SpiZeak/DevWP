# Testing Guide for DevWP

This project uses [Vitest](https://vitest.dev/) as the testing framework for unit and integration tests.

## Installation

First, install the testing dependencies:

```bash
bun install
```

## Running Tests

### Run all tests

```bash
bun run test
```

### Run tests in watch mode (for development)

```bash
bun run test
```

### Run tests once (for CI/CD)

```bash
bun run test:run
```

### Run tests with UI (interactive browser interface)

```bash
bun run test:ui
```

### Run tests with coverage report

```bash
bun run test:coverage
```

## Test Structure

Tests are organized alongside the source code:

```
src/
├── main/
│   ├── validation/
│   │   ├── schemas.ts
│   │   └── schemas.test.ts          # Unit tests for schemas
│   └── services/
│       ├── docker.ts
│       └── docker.test.ts            # Unit tests for services
├── renderer/
│   ├── src/
│   │   └── components/
│   │       ├── Versions.tsx
│   │       └── Versions.test.tsx    # Component tests
│   └── test/
│       ├── setup.ts                  # Test setup
│       └── test-utils.tsx            # Testing utilities
└── preload/
    └── index.test.ts                 # Preload tests
```

## Writing Tests

### Unit Tests (Main Process)

For testing Node.js code in the main process:

```typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from './myModule'

describe('myFunction', () => {
  it('should return expected result', () => {
    const result = myFunction('input')
    expect(result).toBe('expected')
  })
})
```

### Component Tests (Renderer Process)

For testing React components:

```typescript
import { describe, it, expect } from 'vitest'
import { renderWithProviders, screen } from '../../test/test-utils'
import MyComponent from './MyComponent'

describe('MyComponent', () => {
  it('should render correctly', () => {
    renderWithProviders(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

### Testing with User Interactions

```typescript
import { describe, it, expect } from 'vitest'
import { renderWithProviders, screen, userEvent } from '../../test/test-utils'
import Button from './Button'

describe('Button', () => {
  it('should handle click events', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    renderWithProviders(<Button onClick={handleClick}>Click me</Button>)

    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledOnce()
  })
})
```

### Mocking Electron APIs

When testing components that use Electron APIs:

```typescript
import { beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.stubGlobal('window', {
    electron: {
      ipcRenderer: {
        invoke: vi.fn(),
        on: vi.fn()
      }
    }
  })
})
```

## Configuration

### Main Configuration Files

- **`vitest.config.ts`** - Default configuration (for all tests)
- **`vitest.config.main.ts`** - Configuration for main and preload process tests
- **`vitest.config.renderer.ts`** - Configuration for renderer (React) tests

### Test Environment

- **Main Process Tests**: Run in Node.js environment
- **Renderer Tests**: Run in jsdom environment (simulated browser)

## Coverage Reports

After running `bun run test:coverage`, coverage reports are generated in the `coverage/` directory:

- **Text report**: Shown in terminal
- **HTML report**: Open `coverage/index.html` in browser
- **JSON report**: For CI/CD integration

### Coverage Exclusions

The following are excluded from coverage:

- Configuration files (`*.config.ts`)
- Type definition files (`*.d.ts`)
- Node modules
- Build outputs (`out/`, `dist/`)
- Entry point files (`src/main/index.ts`, `src/preload/index.ts`)

## Best Practices

### 1. Test Organization

- Keep tests close to the code they test
- Use descriptive test names that explain the behavior
- Group related tests with `describe` blocks

### 2. Test Independence

- Each test should be independent and not rely on other tests
- Use `beforeEach` to set up test state
- Use `afterEach` to clean up (handled automatically by test-utils)

### 3. What to Test

- ✅ Business logic and utility functions
- ✅ Component rendering and user interactions
- ✅ Validation schemas and error handling
- ✅ IPC handler logic
- ❌ Third-party library internals
- ❌ Simple getter/setter functions

### 4. Mocking

- Mock external dependencies (file system, network, Electron APIs)
- Keep mocks simple and focused
- Use `vi.mock()` for module-level mocks
- Use `vi.fn()` for function mocks

### 5. Assertions

- Use clear, specific assertions
- Prefer `toBeInTheDocument()` over `toBeTruthy()` for DOM elements
- Use `toHaveBeenCalledWith()` for specific argument checks

## Common Testing Patterns

### Testing Async Operations

```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction()
  expect(result).toBe('expected')
})
```

### Testing Error Handling

```typescript
it('should throw error for invalid input', () => {
  expect(() => functionThatThrows()).toThrow('Error message')
})
```

### Testing with Timers

```typescript
import { vi } from 'vitest'

it('should work with timers', () => {
  vi.useFakeTimers()

  const callback = vi.fn()
  setTimeout(callback, 1000)

  vi.advanceTimersByTime(1000)
  expect(callback).toHaveBeenCalled()

  vi.useRealTimers()
})
```

## CI/CD Integration

Add to your CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: bun run test:run

- name: Generate coverage
  run: bun run test:coverage
```

## Troubleshooting

### "Cannot find module 'vitest'" error

Run `bun install` to ensure all dependencies are installed.

### Tests timeout

Increase timeout in test file:

```typescript
import { describe, it } from 'vitest'

describe('slow tests', () => {
  it('should handle slow operation', async () => {
    // Test code
  }, 10000) // 10 second timeout
})
```

### jsdom errors

Ensure you're using the correct Vitest config for renderer tests (`vitest.config.renderer.ts`).

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Testing Library React](https://testing-library.com/docs/react-testing-library/intro/)
- [jest-dom Matchers](https://github.com/testing-library/jest-dom#custom-matchers)
