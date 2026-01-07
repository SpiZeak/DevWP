import { join } from 'node:path';
import { app, ipcMain } from 'electron';

export function registerAppInfoHandlers(): void {
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-log-dir', () => join(app.getPath('userData'), 'logs'));
}
