import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import XdebugSwitch from './XdebugSwitch'

describe('XdebugSwitch', () => {
  let mockGetXdebugStatus: ReturnType<typeof vi.fn>
  let mockToggleXdebug: ReturnType<typeof vi.fn>
  let mockOnXdebugStatus: ReturnType<typeof vi.fn>
  let mockRemoveListener: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGetXdebugStatus = vi.fn()
    mockToggleXdebug = vi.fn()
    mockOnXdebugStatus = vi.fn()
    mockRemoveListener = vi.fn()

    window.electronAPI = {
      getXdebugStatus: mockGetXdebugStatus,
      toggleXdebug: mockToggleXdebug,
      onXdebugStatus: mockOnXdebugStatus.mockReturnValue(mockRemoveListener)
    } as unknown as typeof window.electronAPI
  })

  afterEach(() => {
    delete (window as Partial<Window & typeof globalThis>).electronAPI
  })

  it('should fetch initial Xdebug status on mount', () => {
    mockGetXdebugStatus.mockResolvedValue(false)
    renderWithProviders(<XdebugSwitch />)

    expect(mockGetXdebugStatus).toHaveBeenCalled()
  })

  it('should display Performance mode when Xdebug is disabled', async () => {
    mockGetXdebugStatus.mockResolvedValue(false)
    renderWithProviders(<XdebugSwitch />)

    await waitFor(() => {
      expect(screen.getByText('Performance mode')).toBeInTheDocument()
    })
  })

  it('should display Debug mode when Xdebug is enabled', async () => {
    mockGetXdebugStatus.mockResolvedValue(true)
    renderWithProviders(<XdebugSwitch />)

    await waitFor(() => {
      expect(screen.getByText('Debug mode')).toBeInTheDocument()
    })
  })

  it('should display performance mode description when disabled', async () => {
    mockGetXdebugStatus.mockResolvedValue(false)
    renderWithProviders(<XdebugSwitch />)

    await waitFor(() => {
      expect(
        screen.getByText(/Performance mode disables Xdebug for faster PHP execution/)
      ).toBeInTheDocument()
    })
  })

  it('should display debug mode description when enabled', async () => {
    mockGetXdebugStatus.mockResolvedValue(true)
    renderWithProviders(<XdebugSwitch />)

    await waitFor(() => {
      expect(screen.getByText(/Debug mode enables Xdebug for step debugging/)).toBeInTheDocument()
    })
  })

  it('should register status update listener', () => {
    mockGetXdebugStatus.mockResolvedValue(false)
    renderWithProviders(<XdebugSwitch />)

    expect(mockOnXdebugStatus).toHaveBeenCalledWith(expect.any(Function))
  })

  it('should call toggleXdebug when toggle is clicked', async () => {
    mockGetXdebugStatus.mockResolvedValue(false)
    mockToggleXdebug.mockResolvedValue(undefined)

    renderWithProviders(<XdebugSwitch />)

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument()
    })

    const toggle = screen.getByRole('checkbox')
    await userEvent.click(toggle)

    expect(mockToggleXdebug).toHaveBeenCalled()
  })

  it('should disable toggle while toggling', async () => {
    mockGetXdebugStatus.mockResolvedValue(false)
    mockToggleXdebug.mockResolvedValue(undefined)

    renderWithProviders(<XdebugSwitch />)

    const callback = mockOnXdebugStatus.mock.calls[0][0]

    callback({ status: 'restarting' })

    await waitFor(() => {
      const toggle = screen.getByRole('checkbox')
      expect(toggle).toBeDisabled()
    })
  })

  it('should enable toggle after completion', async () => {
    mockGetXdebugStatus.mockResolvedValue(false)

    renderWithProviders(<XdebugSwitch />)

    const callback = mockOnXdebugStatus.mock.calls[0][0]

    callback({ status: 'restarting' })

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeDisabled()
    })

    callback({ status: 'complete', enabled: true })

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).not.toBeDisabled()
    })
  })

  it('should update status after toggle completes', async () => {
    mockGetXdebugStatus.mockResolvedValue(false)

    renderWithProviders(<XdebugSwitch />)

    await waitFor(() => {
      expect(screen.getByText('Performance mode')).toBeInTheDocument()
    })

    const callback = mockOnXdebugStatus.mock.calls[0][0]
    callback({ status: 'complete', enabled: true })

    await waitFor(() => {
      expect(screen.getByText('Debug mode')).toBeInTheDocument()
    })
  })

  it('should handle toggle error gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetXdebugStatus.mockResolvedValue(false)
    mockToggleXdebug.mockRejectedValue(new Error('Toggle failed'))

    renderWithProviders(<XdebugSwitch />)

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument()
    })

    const toggle = screen.getByRole('checkbox')
    await userEvent.click(toggle)

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('Error toggling Xdebug:', expect.any(Error))
    })

    // Toggle should be enabled again after error
    await waitFor(() => {
      expect(toggle).not.toBeDisabled()
    })

    consoleError.mockRestore()
  })

  it('should log error on status error event', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetXdebugStatus.mockResolvedValue(false)

    renderWithProviders(<XdebugSwitch />)

    const callback = mockOnXdebugStatus.mock.calls[0][0]
    callback({ status: 'error', message: 'Docker restart failed' })

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('Xdebug toggle error:', 'Docker restart failed')
    })

    consoleError.mockRestore()
  })

  it('should re-enable toggle on error status', async () => {
    mockGetXdebugStatus.mockResolvedValue(false)

    renderWithProviders(<XdebugSwitch />)

    const callback = mockOnXdebugStatus.mock.calls[0][0]

    callback({ status: 'restarting' })

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeDisabled()
    })

    callback({ status: 'error', message: 'Failed' })

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).not.toBeDisabled()
    })
  })

  it('should handle initial status fetch error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetXdebugStatus.mockRejectedValue(new Error('Failed to get status'))

    renderWithProviders(<XdebugSwitch />)

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('Error getting Xdebug status:', expect.any(Error))
    })

    consoleError.mockRestore()
  })

  it('should cleanup listener on unmount', () => {
    mockGetXdebugStatus.mockResolvedValue(false)
    const { unmount } = renderWithProviders(<XdebugSwitch />)

    unmount()

    expect(mockRemoveListener).toHaveBeenCalled()
  })

  it('should prevent toggle when already toggling', async () => {
    mockGetXdebugStatus.mockResolvedValue(false)
    mockToggleXdebug.mockResolvedValue(undefined)

    renderWithProviders(<XdebugSwitch />)

    const callback = mockOnXdebugStatus.mock.calls[0][0]
    callback({ status: 'restarting' })

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeDisabled()
    })

    const toggle = screen.getByRole('checkbox')
    await userEvent.click(toggle)

    // Should only be called once during initial setup, not from the disabled click
    expect(mockToggleXdebug).not.toHaveBeenCalled()
  })

  it('should display correct toggle title when disabled', async () => {
    mockGetXdebugStatus.mockResolvedValue(false)

    renderWithProviders(<XdebugSwitch />)

    await waitFor(() => {
      const toggle = screen.getByTitle('Switch to Debug Mode')
      expect(toggle).toBeInTheDocument()
    })
  })

  it('should display correct toggle title when enabled', async () => {
    mockGetXdebugStatus.mockResolvedValue(true)

    renderWithProviders(<XdebugSwitch />)

    await waitFor(() => {
      const toggle = screen.getByTitle('Switch to Performance Mode')
      expect(toggle).toBeInTheDocument()
    })
  })
})
