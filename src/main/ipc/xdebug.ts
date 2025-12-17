import { type BrowserWindow, ipcMain } from 'electron';
import { getXdebugStatus, toggleXdebug } from '../services/xdebug'; // Ensure path is correct

let mainWindowRef: BrowserWindow | null = null; // Use a different name if mainWindow is used elsewhere

export function registerXdebugHandlers(window: BrowserWindow): void {
  mainWindowRef = window; // Store reference if needed by toggleXdebug

  // Remove existing handlers before registering new ones
  ipcMain.removeHandler('get-xdebug-status');
  ipcMain.removeHandler('toggle-xdebug');

  ipcMain.handle('get-xdebug-status', async () => {
    console.log('Handling get-xdebug-status request');
    return getXdebugStatus();
  });

  ipcMain.handle('toggle-xdebug', async () => {
    console.log('Handling toggle-xdebug request');
    // Pass the stored window reference if toggleXdebug needs it
    if (!mainWindowRef) {
      throw new Error('Main window reference is not available');
    }
    return toggleXdebug(mainWindowRef);
  });

  console.log('Xdebug handlers registered');
}
