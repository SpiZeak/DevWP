# Testing Quick Reference

## Installation

```bash
bun install
```

## Commands

| Command                 | Description               | Use Case              |
| ----------------------- | ------------------------- | --------------------- |
| `bun run test`          | Run tests in watch mode   | Development           |
| `bun run test:run`      | Run tests once            | CI/CD                 |
| `bun run test:ui`       | Open Vitest UI in browser | Interactive debugging |
| `bun run test:coverage` | Generate coverage report  | Code quality check    |

## File Naming

- Unit tests: `*.test.ts` or `*.test.tsx`
- Place tests next to the code they test
- Example: `logger.ts` → `logger.test.ts`

## Quick Examples

### Basic Test

```typescript
import { describe, it, expect } from 'vitest'

describe('myFunction', () => {
  it('should return expected result', () => {
    expect(myFunction('input')).toBe('output')
  })
})
```

### Component Test

```typescript
import { describe, it, expect } from 'vitest'
import { renderWithProviders, screen } from '../../test/test-utils'
import MyComponent from './MyComponent'

describe('MyComponent', () => {
  it('should render', () => {
    renderWithProviders(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

### Mock Example

```typescript
import { vi } from 'vitest'

const mockFn = vi.fn()
mockFn('test')
expect(mockFn).toHaveBeenCalledWith('test')
```

## Common Matchers

| Matcher               | Description                 |
| --------------------- | --------------------------- |
| `toBe()`              | Strict equality (===)       |
| `toEqual()`           | Deep equality for objects   |
| `toBeTruthy()`        | Truthy value                |
| `toBeNull()`          | null value                  |
| `toContain()`         | Array/string contains value |
| `toThrow()`           | Function throws error       |
| `toHaveBeenCalled()`  | Mock was called             |
| `toBeInTheDocument()` | DOM element exists          |

## Testing DOM Elements

```typescript
// Get by text
screen.getByText('Submit')

// Get by role
screen.getByRole('button', { name: 'Submit' })

// Get by test ID
screen.getByTestId('submit-button')

// Query (returns null if not found)
screen.queryByText('Not Found')

// Find (async, waits for element)
await screen.findByText('Async Content')
```

## User Interactions

```typescript
import { userEvent } from '../../test/test-utils'

const user = userEvent.setup()

// Click
await user.click(screen.getByRole('button'))

// Type
await user.type(screen.getByRole('textbox'), 'Hello')

// Select
await user.selectOptions(screen.getByRole('combobox'), 'option1')
```

## Coverage Targets

| Metric     | Target | Good | Excellent |
| ---------- | ------ | ---- | --------- |
| Lines      | 70%+   | 80%+ | 90%+      |
| Statements | 70%+   | 80%+ | 90%+      |
| Functions  | 70%+   | 80%+ | 90%+      |
| Branches   | 60%+   | 75%+ | 85%+      |

## Debugging

```typescript
// Print component to console
import { screen, debug } from '@testing-library/react'
debug(screen.getByRole('button'))

// Console log in test
console.log('Debug:', value)
```

## See Also

- Full documentation: `docs/testing.md`
- Vitest docs: https://vitest.dev/
- Testing Library: https://testing-library.com/
