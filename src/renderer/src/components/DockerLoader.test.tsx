import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, screen, waitFor } from '../test/test-utils'
import DockerLoader from './DockerLoader'

describe('DockerLoader', () => {
  let mockOnDockerStatus: ReturnType<typeof vi.fn>
  let mockRemoveListener: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockOnDockerStatus = vi.fn()
    mockRemoveListener = vi.fn()

    window.electronAPI = {
      onDockerStatus: mockOnDockerStatus.mockReturnValue(mockRemoveListener)
    } as unknown as typeof window.electronAPI

    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as Partial<Window & typeof globalThis>).electronAPI
  })

  it('should render loading state initially', () => {
    renderWithProviders(<DockerLoader />)

    expect(screen.getByText('Starting Docker Environment')).toBeInTheDocument()
    expect(screen.getByAltText('Docker Logo')).toBeInTheDocument()
  })

  it('should register docker status listener on mount', () => {
    renderWithProviders(<DockerLoader />)

    expect(mockOnDockerStatus).toHaveBeenCalledWith(expect.any(Function))
  })

  it('should display status message', async () => {
    vi.useRealTimers() // Use real timers to avoid waitFor conflicts
    renderWithProviders(<DockerLoader />)

    const callback = mockOnDockerStatus.mock.calls[0][0]
    callback({ status: 'loading', message: 'Starting containers...' })

    await waitFor(() => {
      expect(screen.getByText('Starting containers...')).toBeInTheDocument()
    })

    vi.useFakeTimers() // Restore fake timers
  })

  it('should show spinner when not in error state', () => {
    renderWithProviders(<DockerLoader />)

    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('should hide spinner on error', async () => {
    vi.useRealTimers() // Use real timers to avoid waitFor conflicts
    renderWithProviders(<DockerLoader />)

    const callback = mockOnDockerStatus.mock.calls[0][0]
    callback({ status: 'error', message: 'Docker failed' })

    await waitFor(() => {
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).not.toBeInTheDocument()
    })

    vi.useFakeTimers() // Restore fake timers
  })

  it('should display error message when status is error', async () => {
    vi.useRealTimers() // Use real timers to avoid waitFor conflicts
    renderWithProviders(<DockerLoader />)

    const callback = mockOnDockerStatus.mock.calls[0][0]
    callback({ status: 'error', message: 'Connection failed' })

    await waitFor(() => {
      expect(
        screen.getByText('There was an error starting Docker. Check the logs for details.')
      ).toBeInTheDocument()
    })

    vi.useFakeTimers() // Restore fake timers
  })

  it('should hide after completion with delay', async () => {
    // Use real timers for this test since we need the actual setTimeout behavior
    vi.useRealTimers()
    const { container } = renderWithProviders(<DockerLoader />)

    expect(container.firstChild).toBeInTheDocument()

    const callback = mockOnDockerStatus.mock.calls[0][0]
    callback({ status: 'complete', message: 'Docker ready' })

    // Should still be visible immediately after complete
    expect(container.firstChild).toBeInTheDocument()

    // Wait for the 1 second delay
    await waitFor(
      () => {
        expect(container.firstChild).not.toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    vi.useFakeTimers() // Restore fake timers
  })

  it('should not hide on loading status', () => {
    const { container } = renderWithProviders(<DockerLoader />)

    const callback = mockOnDockerStatus.mock.calls[0][0]
    callback({ status: 'loading', message: 'Starting...' })

    vi.advanceTimersByTime(2000)

    expect(container.firstChild).toBeInTheDocument()
  })

  it('should not hide on error status', () => {
    const { container } = renderWithProviders(<DockerLoader />)

    const callback = mockOnDockerStatus.mock.calls[0][0]
    callback({ status: 'error', message: 'Failed' })

    vi.advanceTimersByTime(2000)

    expect(container.firstChild).toBeInTheDocument()
  })

  it('should cleanup listener on unmount', () => {
    const { unmount } = renderWithProviders(<DockerLoader />)

    unmount()

    expect(mockRemoveListener).toHaveBeenCalled()
  })

  it('should update message multiple times', async () => {
    vi.useRealTimers() // Use real timers to avoid waitFor conflicts
    renderWithProviders(<DockerLoader />)

    const callback = mockOnDockerStatus.mock.calls[0][0]

    callback({ status: 'loading', message: 'Step 1' })
    await waitFor(() => expect(screen.getByText('Step 1')).toBeInTheDocument())

    callback({ status: 'loading', message: 'Step 2' })
    await waitFor(() => expect(screen.getByText('Step 2')).toBeInTheDocument())

    callback({ status: 'loading', message: 'Step 3' })
    await waitFor(() => expect(screen.getByText('Step 3')).toBeInTheDocument())

    vi.useFakeTimers() // Restore fake timers
  })

  it('should handle empty message', async () => {
    vi.useRealTimers() // Use real timers to avoid waitFor conflicts
    renderWithProviders(<DockerLoader />)

    const callback = mockOnDockerStatus.mock.calls[0][0]
    callback({ status: 'loading', message: '' })

    await waitFor(() => {
      const messageElement = document.querySelector('.overflow-y-auto')
      expect(messageElement).toBeInTheDocument()
      expect(messageElement?.textContent).toBe('')
    })

    vi.useFakeTimers() // Restore fake timers
  })

  it('should return null after hiding', async () => {
    vi.useRealTimers() // Use real timers for setTimeout
    const { container } = renderWithProviders(<DockerLoader />)

    const callback = mockOnDockerStatus.mock.calls[0][0]
    callback({ status: 'complete', message: 'Done' })

    await waitFor(
      () => {
        expect(container.firstChild).toBeNull()
      },
      { timeout: 2000 }
    )

    vi.useFakeTimers() // Restore fake timers
  })
})
