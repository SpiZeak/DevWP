import { electronApp, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow } from 'electron';
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
  REDUX_DEVTOOLS,
} from 'electron-devtools-installer';
import { registerAppInfoHandlers } from './ipc/appInfo';
import {
  registerContainerHandlers,
  stopContainerMonitoring,
} from './ipc/container';
import { registerSettingsHandlers } from './ipc/settings';
import { registerSiteHandlers } from './ipc/site';
import { initializeConfigDatabase } from './services/database';
import { startMariaDBContainer, stopDockerCompose } from './services/docker';
import { initializeXdebugStatus } from './services/xdebug';
import { createWindow } from './window';

app.commandLine.appendSwitch('gtk-version', '3');

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  installExtension([REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS])
    .then(([redux, react]) =>
      console.log(`Added Extensions:  ${redux.name}, ${react.name}`),
    )
    .catch((err) => console.log('An error occurred: ', err));

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Start MariaDB container first to ensure database is available
  try {
    console.log('Starting MariaDB container...');
    await startMariaDBContainer();
    console.log('MariaDB container started successfully');
  } catch (error) {
    console.error('Failed to start MariaDB container:', error);
    // Continue anyway - the app should still work, but database functionality may be limited
  }

  // Initialize the database after MariaDB is running
  try {
    console.log('Initializing database...');
    await initializeConfigDatabase();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    // Continue anyway - the app should still work without database persistence
  }

  // Register all IPC handlers AFTER database is ready
  console.log('Registering IPC handlers...');
  registerContainerHandlers();
  registerSiteHandlers();
  registerSettingsHandlers();
  registerAppInfoHandlers();
  console.log('IPC handlers registered successfully');

  // Initialize Xdebug status from database after database is ready
  try {
    await initializeXdebugStatus();
    console.log('Xdebug status initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Xdebug status:', error);
    // Continue anyway - Xdebug will fall back to file-based status checking
  }

  // Create window after database initialization and IPC handler registration
  console.log('Creating application window...');
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  console.log('All windows closed, shutting down...');

  // Stop container monitoring
  stopContainerMonitoring();

  stopDockerCompose()
    .catch((error) => {
      console.error('Failed to stop Docker containers:', error);
    })
    .finally(() => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
});
