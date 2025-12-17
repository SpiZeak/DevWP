import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { getSetting, saveSetting } from './database';

let xdebugEnabled = false; // Consider if this global state is truly necessary

// Initialize Xdebug status from database on service startup
export async function initializeXdebugStatus(): Promise<void> {
  try {
    const savedStatus = await getSetting('xdebug_enabled');
    if (savedStatus !== null) {
      xdebugEnabled = savedStatus === 'true';
    } else {
      // If no setting exists, check current file state and save it
      const fileStatus = await getXdebugStatus();
      xdebugEnabled = fileStatus;
    }
  } catch (error) {
    console.warn('Failed to initialize Xdebug status from database:', error);
    // Fallback to checking file status
    try {
      const fileStatus = await getXdebugStatus();
      xdebugEnabled = fileStatus;
    } catch (fileError) {
      console.warn('Failed to initialize Xdebug status from file:', fileError);
      // Default to disabled if both fail
      xdebugEnabled = false;
    }
  }
}

export async function getXdebugStatus(): Promise<boolean> {
  const configPath = join(
    process.cwd(),
    'config',
    'php',
    'conf.d',
    'xdebug.ini',
  );

  try {
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const lines = fileContent.split('\n');
    const modeLineDisable = 'xdebug.mode = off';

    // Check if any uncommented line exactly matches 'xdebug.mode = off'
    const isDisabled = lines.some((line) => {
      const trimmedLine = line.trim();
      // Ensure it's not commented out and matches the disable directive
      return (
        !trimmedLine.startsWith(';') &&
        !trimmedLine.startsWith('#') &&
        trimmedLine === modeLineDisable
      );
    });

    const currentStatus = !isDisabled;
    xdebugEnabled = currentStatus;

    // Save the current status to database for persistence
    try {
      await saveSetting('xdebug_enabled', currentStatus.toString());
    } catch (dbError) {
      console.warn('Failed to save Xdebug status to database:', dbError);
      // Continue operation even if database save fails
    }

    return currentStatus;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === 'ENOENT') {
      // If the file doesn't exist, Xdebug is effectively disabled.
      console.warn(
        `xdebug.ini not found at ${configPath}. Assuming disabled state.`,
      );
      xdebugEnabled = false;

      // Save disabled status to database
      try {
        await saveSetting('xdebug_enabled', 'false');
      } catch (dbError) {
        console.warn('Failed to save Xdebug status to database:', dbError);
      }

      return false;
    } else {
      // For other errors (e.g., permissions), log and handle appropriately
      console.error(
        `Error reading Xdebug config file for status check: ${configPath}`,
        error,
      );

      // Try to get last known state from database
      try {
        const savedStatus = await getSetting('xdebug_enabled');
        if (savedStatus !== null) {
          const dbStatus = savedStatus === 'true';
          console.warn(
            'Using last known Xdebug status from database:',
            dbStatus,
          );
          xdebugEnabled = dbStatus;
          return dbStatus;
        }
      } catch (dbError) {
        console.warn('Failed to get Xdebug status from database:', dbError);
      }

      // Fallback to last known state in memory
      console.warn('Returning last known Xdebug status due to read error.');
      return xdebugEnabled;
    }
  }
}

export async function toggleXdebug(
  mainWindow?: BrowserWindow,
): Promise<boolean> {
  try {
    const configPath = join(
      process.cwd(),
      'config',
      'php',
      'conf.d',
      'xdebug.ini',
    );
    // Use the updated getXdebugStatus which reads the file
    const currentStatus = await getXdebugStatus();
    const targetStatus = !currentStatus;

    // Read the current content of the xdebug.ini file
    let fileContent = '';
    try {
      fileContent = await fs.readFile(configPath, 'utf-8');
    } catch (readError: unknown) {
      // If the file doesn't exist, we might be trying to enable (which is fine, we'll create it)
      // or disable (which means it's already effectively disabled).
      const err = readError as { code?: string };
      if (err.code === 'ENOENT') {
        console.warn(
          `xdebug.ini not found at ${configPath}. Assuming disabled state.`,
        );
        if (!targetStatus) {
          // Trying to disable an already non-existent file, nothing to do for file modification.
          console.log('Xdebug already disabled (file not found).');
          // Proceed to restart to ensure container state is consistent (though likely no change)
        } else {
          // Trying to enable, start with empty content.
          fileContent = '';
        }
      } else {
        console.error(
          `Error reading Xdebug config file: ${configPath}`,
          readError,
        );
        throw readError; // Re-throw other read errors
      }
    }

    const lines = fileContent.split('\n');
    const modeLineEnable = 'xdebug.mode = develop,debug'; // Assumed enabled state line
    const modeLineDisable = 'xdebug.mode = off';
    const modeDirective = 'xdebug.mode';

    // Filter out all existing xdebug.mode lines and empty lines
    const filteredLines = lines.filter(
      (line) => !line.trim().startsWith(modeDirective) && line.trim() !== '',
    );

    if (targetStatus) {
      // Enable: Add the 'develop,debug' line (or remove 'off' if that's the only change)
      filteredLines.push(modeLineEnable);
    } else {
      // Disable: Add the 'off' line
      filteredLines.push(modeLineDisable);
    }

    // Join the lines back, ensuring a final newline
    const newContent = `${filteredLines.join('\n')}\n`;

    // Write the modified content back to the file
    try {
      await fs.writeFile(configPath, newContent, 'utf-8');
      console.log(`Successfully updated ${configPath}`);
    } catch (writeError) {
      console.error(
        `Error writing updated Xdebug config file: ${configPath}`,
        writeError,
      );
      throw writeError; // Re-throw write errors
    }

    // Restart the PHP container to apply changes
    return new Promise<boolean>((resolve, reject) => {
      if (mainWindow) {
        mainWindow.webContents.send('xdebug-status', {
          status: 'restarting',
          enabled: targetStatus, // Send the intended target status
        });
      }

      const projectRoot = process.cwd();
      const restartProcess = spawn('docker', ['compose', 'restart', 'php'], {
        cwd: projectRoot,
        shell: false,
      });

      let restartErrorOutput = '';

      restartProcess.stderr?.on('data', (data) => {
        restartErrorOutput += data.toString();
      });

      restartProcess.on('close', async (code) => {
        if (code === 0) {
          // Verify the status *after* restart using the same file check method
          try {
            // Add a small delay before checking status again, container might need a moment
            await new Promise((res) => setTimeout(res, 1000));
            const finalStatus = await getXdebugStatus(); // Use the updated status check
            xdebugEnabled = finalStatus; // Update global state with verified status

            // Save the final status to database
            try {
              await saveSetting('xdebug_enabled', finalStatus.toString());
            } catch (dbError) {
              console.warn(
                'Failed to save Xdebug status to database after toggle:',
                dbError,
              );
              // Continue operation even if database save fails
            }

            if (mainWindow) {
              mainWindow.webContents.send('xdebug-status', {
                status: 'complete',
                enabled: finalStatus,
              });
            }
            resolve(finalStatus);
          } catch (verifyError) {
            console.error(
              'Error verifying Xdebug status after restart:',
              verifyError,
            );
            if (mainWindow) {
              mainWindow.webContents.send('xdebug-status', {
                status: 'error',
                message: `PHP container restarted, but failed to verify final Xdebug status.`,
              });
            }
            reject(
              new Error(
                `Failed to verify Xdebug status after restart: ${verifyError}`,
              ),
            );
          }
        } else {
          console.error(`Failed to restart PHP container. Exit code: ${code}`);
          if (mainWindow) {
            mainWindow.webContents.send('xdebug-status', {
              status: 'error',
              message: `Failed to restart PHP container. Stderr: ${restartErrorOutput || 'None'}`,
            });
          }
          reject(
            new Error(
              `Failed to restart PHP container (code ${code}). Stderr: ${restartErrorOutput || 'None'}`,
            ),
          );
        }
      });

      restartProcess.on('error', (err) => {
        console.error('Failed to spawn docker restart command:', err);
        if (mainWindow) {
          mainWindow.webContents.send('xdebug-status', {
            status: 'error',
            message: `Failed to execute docker restart command: ${err.message}`,
          });
        }
        reject(
          new Error(`Failed to spawn docker restart command: ${err.message}`),
        );
      });
    });
  } catch (error) {
    console.error('Error toggling Xdebug:', error);
    if (mainWindow) {
      // Send a generic error if one occurs early in the toggle process
      mainWindow.webContents.send('xdebug-status', {
        status: 'error',
        message: `Error toggling Xdebug: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    // Re-throw the error so the caller knows something went wrong
    throw error;
  }
}
