import { render, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'

/**
 * Custom render function that wraps components with common providers
 * Extend this as needed when you add context providers, routers, etc.
 */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { ...options })
}

// Re-export everything from testing library
export * from '@testing-library/react'
