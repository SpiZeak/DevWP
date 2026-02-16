import { app, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

let autoUpdateInitialized = false;
let updateReadyToInstall = false;

type NotificationPayload = {
  type: 'success' | 'error';
  message: string;
};

function sendNotification(
  mainWindow: BrowserWindow,
  payload: NotificationPayload,
): void {
  if (mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('notification', payload);
}

export function initializeAutoUpdates(mainWindow: BrowserWindow): void {
  if (autoUpdateInitialized) {
    return;
  }

  autoUpdateInitialized = true;

  if (!app.isPackaged) {
    return;
  }

  autoUpdater.on('update-available', (updateInfo) => {
    updateReadyToInstall = false;

    sendNotification(mainWindow, {
      type: 'success',
      message: `New version available (v${updateInfo.version}). Downloading now...`,
    });
  });

  autoUpdater.on('update-downloaded', (updateInfo) => {
    updateReadyToInstall = true;

    sendNotification(mainWindow, {
      type: 'success',
      message: `Update v${updateInfo.version} downloaded. Open About DevWP and click Install update now.`,
    });
  });

  autoUpdater.on('update-not-available', () => {
    updateReadyToInstall = false;
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-update check failed:', error);
  });

  autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.error('Failed to check for updates:', error);
  });
}

export function isUpdateReadyToInstall(): boolean {
  return updateReadyToInstall;
}

export function installDownloadedUpdate(): {
  success: boolean;
  message: string;
} {
  if (!app.isPackaged) {
    return {
      success: false,
      message: 'Updates are only available in packaged builds.',
    };
  }

  if (!updateReadyToInstall) {
    return {
      success: false,
      message: 'No downloaded update is ready to install.',
    };
  }

  updateReadyToInstall = false;
  autoUpdater.quitAndInstall();

  return {
    success: true,
    message: 'Installing update and restarting DevWP...',
  };
}
