import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge, ipcRenderer } from 'electron';

// Add to your preload script
contextBridge.exposeInMainWorld('electronAPI', {
  getSites: () => ipcRenderer.invoke('get-sites'),
  onDockerStatus: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('docker-status', listener);

    return (): void => {
      ipcRenderer.removeListener('docker-status', listener);
    };
  },
  createSite: (site) => ipcRenderer.invoke('create-site', site),
  deleteSite: (site) => ipcRenderer.invoke('delete-site', site),
  updateSite: (site, updateData) =>
    ipcRenderer.invoke('update-site', site, updateData),

  // Add these new methods
  getContainerStatus: () => ipcRenderer.invoke('get-container-status'),
  onContainerStatus: (callback) => {
    ipcRenderer.on('container-status', (_event, containers) =>
      callback(containers),
    );
    return () => {
      ipcRenderer.removeAllListeners('container-status');
    };
  },
  restartContainer: (containerId) =>
    ipcRenderer.invoke('restart-container', containerId),

  // Add these new methods
  getXdebugStatus: () => ipcRenderer.invoke('get-xdebug-status'),
  toggleXdebug: () => ipcRenderer.invoke('toggle-xdebug'),
  onXdebugStatus: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('xdebug-status', listener);

    return () => {
      ipcRenderer.removeListener('xdebug-status', listener);
    };
  },
  scanSiteWithSonarQube: (siteDomain: string) =>
    ipcRenderer.invoke('scan-site-sonarqube', siteDomain),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Add WP-CLI streaming support
  onWpCliStream: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('wp-cli-stream', listener);
    return () => {
      ipcRenderer.removeListener('wp-cli-stream', listener);
    };
  },
  // Settings API
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  saveSetting: (key: string, value: string) =>
    ipcRenderer.invoke('save-setting', key, value),
  deleteSetting: (key: string) => ipcRenderer.invoke('delete-setting', key),
  getWebrootPath: () => ipcRenderer.invoke('get-webroot-path'),
  getXdebugEnabledSetting: () =>
    ipcRenderer.invoke('get-xdebug-enabled-setting'),
  pickDirectory: (defaultPath?: string) =>
    ipcRenderer.invoke('pick-directory', defaultPath),
});

// Custom APIs for renderer
const api = {};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI;
  // @ts-expect-error (define in dts)
  window.api = api;
}
