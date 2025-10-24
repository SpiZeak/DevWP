import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders, screen } from '../../test/test-utils'
import userEvent from '@testing-library/user-event'
import SiteItem from './SiteItem'
import { Site } from '@renderer/env'

describe('SiteItem', () => {
  let mockSite: Site
  let mockOnOpenUrl: ReturnType<typeof vi.fn>
  let mockOnScan: ReturnType<typeof vi.fn>
  let mockOnDelete: ReturnType<typeof vi.fn>
  let mockOnOpenWpCli: ReturnType<typeof vi.fn>
  let mockOnEditSite: ReturnType<typeof vi.fn>
  let mockInvoke: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockOnOpenUrl = vi.fn()
    mockOnScan = vi.fn()
    mockOnDelete = vi.fn()
    mockOnOpenWpCli = vi.fn()
    mockOnEditSite = vi.fn()
    mockInvoke = vi.fn()

    mockSite = {
      name: 'example.test',
      path: '/var/www/example.test',
      url: 'https://example.test',
      status: 'active'
    }

    window.electron = {
      ipcRenderer: {
        invoke: mockInvoke
      }
    } as unknown as typeof window.electron
  })

  const renderSiteItem = (props = {}) => {
    return renderWithProviders(
      <SiteItem
        site={mockSite}
        isLast={false}
        onOpenUrl={mockOnOpenUrl}
        onScan={mockOnScan}
        onDelete={mockOnDelete}
        onOpenWpCli={mockOnOpenWpCli}
        onEditSite={mockOnEditSite}
        scanningSite={null}
        {...props}
      />
    )
  }

  describe('Rendering', () => {
    it('should render site name', () => {
      renderSiteItem()
      expect(screen.getByText('example.test')).toBeInTheDocument()
    })

    it('should render site path', () => {
      renderSiteItem()
      expect(screen.getByText('/var/www/example.test')).toBeInTheDocument()
    })

    it('should show active indicator', () => {
      renderSiteItem()
      const indicator = document.querySelector('.bg-emerald')
      expect(indicator).toBeInTheDocument()
    })

    it('should apply correct margin when not last', () => {
      const { container } = renderSiteItem({ isLast: false })
      const listItem = container.querySelector('li')
      expect(listItem).toHaveClass('mb-3')
    })

    it('should apply different margin when last', () => {
      const { container } = renderSiteItem({ isLast: true })
      const listItem = container.querySelector('li')
      expect(listItem).toHaveClass('mb-2')
    })
  })

  describe('Provisioning Status', () => {
    it('should show provisioning badge when status is provisioning', () => {
      mockSite.status = 'provisioning'
      renderSiteItem()
      expect(screen.getByText('Provisioning')).toBeInTheDocument()
    })

    it('should show spinner during provisioning', () => {
      mockSite.status = 'provisioning'
      const { container } = renderSiteItem()
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('should not show provisioning badge when active', () => {
      mockSite.status = 'active'
      renderSiteItem()
      expect(screen.queryByText('Provisioning')).not.toBeInTheDocument()
    })

    it('should disable all action buttons during provisioning', () => {
      mockSite.status = 'provisioning'
      renderSiteItem()

      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        // Directory button is excluded from being disabled
        if (!button.textContent?.includes('/var/www')) {
          expect(button).toBeDisabled()
        }
      })
    })
  })

  describe('Directory Button', () => {
    it('should open directory in file manager when clicked', async () => {
      renderSiteItem()

      const directoryButton = screen.getByTitle('Open folder in file manager')
      await userEvent.click(directoryButton)

      expect(mockInvoke).toHaveBeenCalledWith('open-directory', '/var/www/example.test')
    })

    it('should show hover state', () => {
      renderSiteItem()
      const directoryButton = screen.getByTitle('Open folder in file manager')
      expect(directoryButton).toHaveClass('hover:text-pumpkin')
    })

    it('should work during provisioning', async () => {
      mockSite.status = 'provisioning'
      renderSiteItem()

      const directoryButton = screen.getByTitle('Open folder in file manager')
      await userEvent.click(directoryButton)

      expect(mockInvoke).toHaveBeenCalled()
    })
  })

  describe('Open Site Button', () => {
    it('should call onOpenUrl with site URL', async () => {
      renderSiteItem()

      const openButton = screen.getByTitle('Open Site')
      await userEvent.click(openButton)

      expect(mockOnOpenUrl).toHaveBeenCalledWith('https://example.test')
    })

    it('should be disabled during provisioning', () => {
      mockSite.status = 'provisioning'
      renderSiteItem()

      const openButton = screen.getByTitle('Open Site')
      expect(openButton).toBeDisabled()
    })

    it('should have hover effects when not disabled', () => {
      renderSiteItem()
      const openButton = screen.getByTitle('Open Site')
      expect(openButton).toHaveClass('hover:bg-pumpkin', 'hover:scale-105')
    })
  })

  describe('Scan Button', () => {
    it('should call onScan with site', async () => {
      renderSiteItem()

      const scanButton = screen.getByTitle('Run SonarQube Scan')
      await userEvent.click(scanButton)

      expect(mockOnScan).toHaveBeenCalledWith(mockSite)
    })

    it('should be disabled when scanning this site', () => {
      renderSiteItem({ scanningSite: 'example.test' })

      const scanButton = screen.getByTitle('Scan in progress...')
      expect(scanButton).toBeDisabled()
    })

    it('should show spinner when scanning', () => {
      const { container } = renderSiteItem({ scanningSite: 'example.test' })

      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('should be disabled during provisioning', () => {
      mockSite.status = 'provisioning'
      renderSiteItem()

      const scanButton = screen
        .getAllByTitle('Site is being provisioned')
        .find((el) => el.tagName === 'BUTTON')
      expect(scanButton).toBeDisabled()
    })

    it('should not be disabled when scanning different site', () => {
      renderSiteItem({ scanningSite: 'other.test' })

      const scanButton = screen.getByTitle('Run SonarQube Scan')
      expect(scanButton).not.toBeDisabled()
    })
  })

  describe('Delete Button', () => {
    it('should call onDelete with site', async () => {
      renderSiteItem()

      const deleteButton = screen.getByTitle('Delete Site')
      await userEvent.click(deleteButton)

      expect(mockOnDelete).toHaveBeenCalledWith(mockSite)
    })

    it('should be disabled during provisioning', () => {
      mockSite.status = 'provisioning'
      renderSiteItem()

      const deleteButton = screen.getByTitle('Delete Site')
      expect(deleteButton).toBeDisabled()
    })

    it('should have crimson hover effect', () => {
      renderSiteItem()
      const deleteButton = screen.getByTitle('Delete Site')
      expect(deleteButton).toHaveClass('hover:bg-crimson')
    })
  })

  describe('WP-CLI Button', () => {
    it('should call onOpenWpCli with site', async () => {
      renderSiteItem()

      const wpCliButton = screen.getByTitle('Run WP-CLI Command')
      await userEvent.click(wpCliButton)

      expect(mockOnOpenWpCli).toHaveBeenCalledWith(mockSite)
    })

    it('should be disabled during provisioning', () => {
      mockSite.status = 'provisioning'
      renderSiteItem()

      const wpCliButton = screen.getByTitle('Run WP-CLI Command')
      expect(wpCliButton).toBeDisabled()
    })

    it('should have emerald hover effect', () => {
      renderSiteItem()
      const wpCliButton = screen.getByTitle('Run WP-CLI Command')
      expect(wpCliButton).toHaveClass('hover:bg-emerald')
    })
  })

  describe('Edit Button', () => {
    it('should call onEditSite with site', async () => {
      renderSiteItem()

      const editButton = screen.getByTitle('Edit Site Settings')
      await userEvent.click(editButton)

      expect(mockOnEditSite).toHaveBeenCalledWith(mockSite)
    })

    it('should be disabled during provisioning', () => {
      mockSite.status = 'provisioning'
      renderSiteItem()

      const editButton = screen.getByTitle('Edit Site Settings')
      expect(editButton).toBeDisabled()
    })

    it('should have pumpkin hover effect', () => {
      renderSiteItem()
      const editButton = screen.getByTitle('Edit Site Settings')
      expect(editButton).toHaveClass('hover:bg-pumpkin-500')
    })
  })

  describe('Multiple Sites Interaction', () => {
    it('should handle rapid button clicks', async () => {
      renderSiteItem()

      const openButton = screen.getByTitle('Open Site')

      await userEvent.click(openButton)
      await userEvent.click(openButton)
      await userEvent.click(openButton)

      expect(mockOnOpenUrl).toHaveBeenCalledTimes(3)
    })

    it('should maintain state between different action buttons', async () => {
      renderSiteItem()

      await userEvent.click(screen.getByTitle('Open Site'))
      await userEvent.click(screen.getByTitle('Run WP-CLI Command'))
      await userEvent.click(screen.getByTitle('Edit Site Settings'))

      expect(mockOnOpenUrl).toHaveBeenCalledTimes(1)
      expect(mockOnOpenWpCli).toHaveBeenCalledTimes(1)
      expect(mockOnEditSite).toHaveBeenCalledTimes(1)
    })
  })

  describe('Accessibility', () => {
    it('should have descriptive button titles', () => {
      renderSiteItem()

      expect(screen.getByTitle('Open Site')).toBeInTheDocument()
      expect(screen.getByTitle('Run SonarQube Scan')).toBeInTheDocument()
      expect(screen.getByTitle('Delete Site')).toBeInTheDocument()
      expect(screen.getByTitle('Run WP-CLI Command')).toBeInTheDocument()
      expect(screen.getByTitle('Edit Site Settings')).toBeInTheDocument()
    })

    it('should update titles during provisioning', () => {
      mockSite.status = 'provisioning'
      renderSiteItem()

      expect(screen.getAllByTitle('Site is being provisioned').length).toBeGreaterThan(0)
    })

    it('should show appropriate cursor states', () => {
      const { container } = renderSiteItem()

      const enabledButton = container.querySelector('button[title="Open Site"]')
      expect(enabledButton).toHaveClass('cursor-pointer')
    })

    it('should show disabled cursor during provisioning', () => {
      mockSite.status = 'provisioning'
      const { container } = renderSiteItem()

      const disabledButton = container.querySelector('button[title="Open Site"]')
      expect(disabledButton).toHaveClass('disabled:cursor-not-allowed')
    })
  })

  describe('Visual States', () => {
    it('should apply hover effects to container', () => {
      const { container } = renderSiteItem()
      const listItem = container.querySelector('li')
      expect(listItem).toHaveClass('hover:bg-gunmetal-400')
    })

    it('should show transition effects', () => {
      const { container } = renderSiteItem()
      const listItem = container.querySelector('li')
      expect(listItem).toHaveClass('transition-all', 'duration-200')
    })

    it('should have rounded corners', () => {
      const { container } = renderSiteItem()
      const listItem = container.querySelector('li')
      expect(listItem).toHaveClass('rounded-lg')
    })
  })
})
