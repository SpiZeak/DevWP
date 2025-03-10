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
    }
  }
}
