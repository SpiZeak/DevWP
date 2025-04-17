/// <reference types="vite/client" />

import { ElectronAPI } from '@electron-toolkit/preload'
import { Site } from './components/SiteList'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onDockerStatusUpdate: (callback: (data: any) => void) => () => void
    }
    dockerControl: {
      startService: (serviceName: string) => void
      stopService: (serviceName: string) => void
      getStatus: (serviceName?: string) => void
      getSites: () => Promise<Site[]>
      onDockerStatus: (callback: (data: any) => void) => () => void
    }
    electronAPI: {
      getXdebugStatus: () => Promise<boolean>
      toggleXdebug: () => Promise<boolean>
      onXdebugStatus: (
        callback: (data: {
          status: 'restarting' | 'complete' | 'error'
          enabled?: boolean
          message?: string
        }) => void
      ) => () => void
      deleteSite: (siteName: Site) => Promise<void>
      createSite: (site: {
        domain: string
        multisite: {
          enabled: boolean
          type: 'subdomain' | 'subdirectory'
        }
      }) => Promise<void>
      onDockerStatus: (
        callback: (data: {
          status: 'starting' | 'progress' | 'complete' | 'error'
          message: string
        }) => void
      ) => () => void
      getContainerStatus: () => Promise<void>
      onContainerStatus: (callback: (containers: any[]) => void) => () => void
      restartContainer: (containerId: string) => Promise<void>
      getSites: () => Promise<Site[]>
    }
  }
}
