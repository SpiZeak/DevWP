import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

contextBridge.exposeInMainWorld('electronAPI', {
  getSites: () => ipcRenderer.invoke('get-sites'),
  onDockerStatus: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('docker-status', listener)

    return (): void => {
      ipcRenderer.removeListener('docker-status', listener)
    }
  },
  createSite: (site) => ipcRenderer.invoke('create-site', site),
  deleteSite: (site) => ipcRenderer.invoke('delete-site', site)
})

// Custom APIs for renderer
const api = {}

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
