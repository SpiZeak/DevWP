import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../test/test-utils'
import Versions from './Versions'

const mockVersions = {
  electron: '38.2.2',
  chrome: '128.0.0',
  node: '20.18.1'
}

const mockAppVersion = '1.4.0'

let originalElectron: typeof window.electron | undefined
let originalElectronAPI: typeof window.electronAPI | undefined
let mockGetAppVersion: ReturnType<typeof vi.fn>

describe('Versions Component', () => {
  beforeEach(() => {
    originalElectron = window.electron
    originalElectronAPI = window.electronAPI

    mockGetAppVersion = vi.fn().mockResolvedValue(mockAppVersion)
    ;(window as any).electron = {
      process: {
        versions: mockVersions
      }
    }
    ;(window as any).electronAPI = {
      getAppVersion: mockGetAppVersion
    }
  })

  afterEach(() => {
    if (originalElectron !== undefined) {
      ;(window as any).electron = originalElectron
    } else {
      delete (window as any).electron
    }

    if (originalElectronAPI !== undefined) {
      ;(window as any).electronAPI = originalElectronAPI
    } else {
      delete (window as any).electronAPI
    }

    vi.restoreAllMocks()
  })

  it('renders version details when modal is open', async () => {
    renderWithProviders(<Versions isOpen onClose={() => {}} />)

    expect(screen.getByRole('dialog', { name: 'About DevWP' })).toBeInTheDocument()
    expect(screen.getByText('DevWP')).toBeInTheDocument()
    expect(screen.getByText('Electron')).toBeInTheDocument()
    expect(screen.getByText('Chromium')).toBeInTheDocument()
    expect(screen.getByText('Node')).toBeInTheDocument()
    expect(screen.getByText('Developer')).toBeInTheDocument()

    expect(await screen.findByText(`v${mockAppVersion}`)).toBeInTheDocument()
    expect(screen.getByText(`v${mockVersions.electron}`)).toBeInTheDocument()
    expect(screen.getByText(`v${mockVersions.chrome}`)).toBeInTheDocument()
    expect(screen.getByText(`v${mockVersions.node}`)).toBeInTheDocument()
  })

  it('does not render when modal is closed', () => {
    renderWithProviders(<Versions isOpen={false} onClose={() => {}} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('invokes getAppVersion when opened', async () => {
    renderWithProviders(<Versions isOpen onClose={() => {}} />)

    await screen.findByText(`v${mockAppVersion}`)

    expect(mockGetAppVersion).toHaveBeenCalled()
  })

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    renderWithProviders(<Versions isOpen onClose={onClose} />)

    const closeButton = screen.getByRole('button', { name: 'Close About modal' })
    await user.click(closeButton)

    expect(onClose).toHaveBeenCalled()
  })

  it('renders developer link with correct attributes', async () => {
    renderWithProviders(<Versions isOpen onClose={() => {}} />)

    const link = await screen.findByRole('link', { name: 'Trewhitt' })
    expect(link).toHaveAttribute('href', 'https://trewhitt.au')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
