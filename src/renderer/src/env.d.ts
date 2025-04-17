/// <reference types="vite/client" />

import { ElectronAPI } from '@electron-toolkit/preload'

interface Site {
  name: string
  path: string
  url: string
  active: boolean
}

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
      // ...existing getSites, createSite, deleteSite, getContainerStatus, onContainerStatus, restartContainer...
      // Add the type for the Docker startup status listener
      onDockerStatus: (
        callback: (data: {
          status: 'starting' | 'progress' | 'complete' | 'error'
          message: string
        }) => void
      ) => () => void
    }
  }
}
