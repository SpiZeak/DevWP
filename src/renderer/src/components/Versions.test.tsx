import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderWithProviders, screen } from '../test/test-utils'
import Versions from './Versions'

// Mock the window.electron API
const mockVersions = {
  electron: '38.2.2',
  chrome: '128.0.0',
  node: '20.18.1'
}

describe('Versions Component', () => {
  beforeEach(() => {
    // Mock the window.electron.process.versions
    vi.stubGlobal('window', {
      electron: {
        process: {
          versions: mockVersions
        }
      }
    })
  })

  it('should render all version information', () => {
    renderWithProviders(<Versions />)

    // Check that all version labels are present
    expect(screen.getByText('Electron')).toBeInTheDocument()
    expect(screen.getByText('Chromium')).toBeInTheDocument()
    expect(screen.getByText('Node')).toBeInTheDocument()
    expect(screen.getByText('Developer')).toBeInTheDocument()
  })

  it('should display correct version numbers', () => {
    renderWithProviders(<Versions />)

    // Use getAllByText since version numbers might appear multiple times
    expect(screen.getAllByText(`v${mockVersions.electron}`).length).toBeGreaterThan(0)
    expect(screen.getAllByText(`v${mockVersions.chrome}`).length).toBeGreaterThan(0)
    expect(screen.getAllByText(`v${mockVersions.node}`).length).toBeGreaterThan(0)
  })

  it('should render developer link with correct attributes', () => {
    renderWithProviders(<Versions />)

    const links = screen.getAllByRole('link', { name: 'Trewhitt' })
    expect(links.length).toBeGreaterThan(0)

    const link = links[0]
    expect(link).toHaveAttribute('href', 'https://trewhitt.au')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('should render as a list with correct structure', () => {
    const { container } = renderWithProviders(<Versions />)

    const list = container.querySelector('ul')
    expect(list).toBeInTheDocument()

    const listItems = container.querySelectorAll('li')
    expect(listItems.length).toBeGreaterThanOrEqual(4) // Electron, Chromium, Node, Developer
  })
})
