import { app, ipcMain } from 'electron';

export function registerAppInfoHandlers(): void {
  ipcMain.handle('get-app-version', () => app.getVersion());
}
