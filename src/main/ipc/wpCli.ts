import { spawn } from 'child_process';
import { ipcMain } from 'electron';

export function registerWpCliHandlers(): void {
  // Remove existing handlers before registering new ones
  ipcMain.removeHandler('run-wp-cli');

  ipcMain.handle('run-wp-cli', async (event, { site, command }) => {
    return new Promise((resolve) => {
      const wpCliProcess = spawn('docker', [
        'exec',
        '-w',
        `/src/www/${site.name}`,
        'devwp_php',
        'php',
        '-d',
        'error_reporting="E_ALL & ~E_DEPRECATED & ~E_WARNING"',
        '/usr/local/bin/wp',
        ...command.split(' '),
      ]);

      let output = '';
      let error = '';

      wpCliProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        // Send streaming data to renderer
        event.sender.send('wp-cli-stream', {
          type: 'stdout',
          data: chunk,
          siteId: site.name,
        });
      });

      wpCliProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        error += chunk;
        // Send streaming data to renderer
        event.sender.send('wp-cli-stream', {
          type: 'stderr',
          data: chunk,
          siteId: site.name,
        });
      });

      wpCliProcess.on('close', (code) => {
        // Send final result
        event.sender.send('wp-cli-stream', {
          type: 'complete',
          code,
          siteId: site.name,
        });

        if (code === 0) {
          resolve({ success: true, output, error });
        } else {
          resolve({
            success: false,
            error: error || `Process exited with code ${code}`,
            output,
          });
        }
      });

      wpCliProcess.on('error', (err) => {
        event.sender.send('wp-cli-stream', {
          type: 'error',
          error: err.message,
          siteId: site.name,
        });
        resolve({ success: false, error: err.message });
      });
    });
  });
}
