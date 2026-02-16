import { join } from 'node:path';
import { app, ipcMain } from 'electron';
import {
  installDownloadedUpdate,
  isUpdateReadyToInstall,
} from '../services/updates';

export function registerAppInfoHandlers(): void {
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-log-dir', () => join(app.getPath('userData'), 'logs'));
  ipcMain.handle('get-update-ready', () => isUpdateReadyToInstall());
  ipcMain.handle('install-update-now', () => installDownloadedUpdate());
}
