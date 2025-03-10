import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Define site interface for TypeScript
interface Site {
  name: string
  path: string
  url: string
  active: boolean
}

contextBridge.exposeInMainWorld('dockerControl', {
  startService: (serviceName) => ipcRenderer.send('start-service', serviceName),
  stopService: (serviceName) => ipcRenderer.send('stop-service', serviceName),
  getStatus: (serviceName) => ipcRenderer.send('get-status', serviceName),
  getSites: () => ipcRenderer.invoke('get-sites')
})

// Custom APIs for renderer
const api = {
  onDockerStatusUpdate: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('docker-status-update', listener)
    return () => {
      ipcRenderer.removeListener('docker-status-update', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
