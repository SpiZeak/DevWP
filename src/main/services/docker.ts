import { exec, spawn } from 'node:child_process';
import { platform } from 'node:os';
import type { BrowserWindow } from 'electron';
import { isVerboseMode } from '../runtimeFlags';
import logger from './logger';

const verboseMode = isVerboseMode();
const composeEnv: NodeJS.ProcessEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: 'devwp',
};

// Function to start Docker Compose
export function startDockerCompose(mainWindow?: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWin = platform() === 'win32';
    const command = isWin ? 'docker.exe' : 'docker';
    const args = ['compose', 'up', '-d', '--build', 'nginx'];
    if (verboseMode) {
      logger.debug(
        `Launching Docker compose command: ${command} ${args.join(' ')}`,
      );
    }
    const dockerProcess = spawn(command, args, { env: composeEnv });

    // Send initial status if window exists
    if (mainWindow) {
      mainWindow.webContents.send('docker-status', {
        status: 'starting',
        message: 'Starting Docker containers...',
      });
    }

    dockerProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (verboseMode && output) {
        logger.debug(`[docker compose stdout] ${output}`);
      }
      if (mainWindow) {
        mainWindow.webContents.send('docker-status', {
          status: 'progress',
          message: output,
        });
      }
    });

    dockerProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (verboseMode && output) {
        logger.debug(`[docker compose stderr] ${output}`);
      }

      // Define progress keywords
      const progressKeywords = [
        'Pulling from',
        'Pulling fs layer',
        'Download complete',
        'Pull complete',
        'Digest:',
        'Status:',
        'Started',
        'Starting',
        'Running',
        'Built',
        'Creating',
        'Created',
        'Extracting',
        'Verifying Checksum',
        'Downloading',
        'Unpacking',
        'Waiting',
        'Removing',
        'Healthy',
      ];

      // Check if the output contains any of the progress keywords
      if (progressKeywords.some((keyword) => output.includes(keyword))) {
        if (mainWindow) {
          mainWindow.webContents.send('docker-status', {
            status: 'progress',
            message: output,
          });
        }
      } else {
        if (mainWindow) {
          mainWindow.webContents.send('docker-status', {
            status: 'error',
            message: output,
          });
        }
      }
    });

    dockerProcess.on('close', (code) => {
      if (verboseMode) {
        logger.debug(`Docker compose process exited with code ${code}`);
      }
      if (mainWindow) {
        mainWindow.webContents.send('docker-status', {
          status: code === 0 ? 'complete' : 'error',
          message:
            code === 0
              ? 'Docker containers started successfully'
              : `Process exited with code ${code}`,
        });
      }

      // Exit code 0 means success
      // With health checks, containers may still be starting, but the compose command succeeded
      if (code === 0) {
        resolve();
      } else {
        console.error(`Docker compose exited with code ${code}`);
        reject(new Error(`Docker compose exited with code ${code}`));
      }
    });

    dockerProcess.on('error', (error) => {
      if (verboseMode) {
        logger.debug(`Docker compose process error: ${error.message}`);
      }
      console.error('Failed to start Docker compose:', error);
      if (mainWindow) {
        mainWindow.webContents.send('docker-status', {
          status: 'error',
          message: `Failed to start Docker: ${error.message}`,
        });
      }
      reject(error);
    });
  });
}

// Function to start MariaDB container specifically during app initialization
export function startMariaDBContainer(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Starting MariaDB container...');
    const isWin = platform() === 'win32';
    const command = isWin ? 'docker.exe' : 'docker';
    const args = ['compose', 'up', '-d', '--build', 'mariadb'];
    if (verboseMode) {
      logger.debug(
        `Launching Docker compose command for MariaDB: ${command} ${args.join(' ')}`,
      );
    }
    const dockerProcess = spawn(command, args, { env: composeEnv });
    let errorOutput = '';

    dockerProcess.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (verboseMode && text) {
        logger.debug(`[mariadb stdout] ${text}`);
      }
      console.log('MariaDB startup stdout:', text);
    });

    dockerProcess.stderr.on('data', (data) => {
      const text = data.toString().trim();
      errorOutput += `${text}\n`;
      if (verboseMode && text) {
        logger.debug(`[mariadb stderr] ${text}`);
      }
      console.log('MariaDB startup stderr:', text);
    });

    dockerProcess.on('close', (code) => {
      console.log(`MariaDB container startup completed with code ${code}`);
      if (verboseMode) {
        logger.debug(`MariaDB compose process exited with code ${code}`);
      }
      if (code === 0) {
        console.log('MariaDB container started successfully');
        resolve();
      } else {
        console.error('MariaDB container failed to start:', errorOutput);
        reject(
          new Error(
            `MariaDB container startup failed with code ${code}: ${errorOutput}`,
          ),
        );
      }
    });

    dockerProcess.on('error', (error) => {
      console.error('Error starting MariaDB container:', error);
      if (verboseMode) {
        logger.debug(`MariaDB compose process error: ${error.message}`);
      }
      reject(error);
    });
  });
}

// Function to stop Docker Compose
export function stopDockerCompose(): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWin = platform() === 'win32';
    const command = isWin ? 'docker.exe' : 'docker';
    const args = ['compose', 'down'];
    if (verboseMode) {
      logger.debug(
        `Launching Docker compose down command: ${command} ${args.join(' ')}`,
      );
    }
    const dockerProcess = spawn(command, args, { env: composeEnv });

    dockerProcess.on('close', (code) => {
      if (verboseMode) {
        logger.debug(`Docker compose down process exited with code ${code}`);
      }
      if (code === 0) {
        console.log('Docker containers stopped');
        resolve();
      } else {
        const errorMsg = `Docker compose down exited with code ${code}`;
        console.error(errorMsg);
        reject(new Error(errorMsg));
      }
    });
  });
}

interface Container {
  id: string;
  name: string;
  state: string;
  version?: string | undefined;
}

export function getDockerContainers(): Promise<Container[]> {
  return new Promise((resolve, reject) => {
    exec(
      'docker compose ps --format "{{.ID}}|{{.Names}}|{{.State}}" -a',
      { env: composeEnv },
      async (error, stdout) => {
        if (error) {
          console.error('Error getting container status:', error);
          if (verboseMode) {
            logger.debug(`docker compose ps error: ${error.message}`);
          }
          reject(error);
          return;
        }

        if (verboseMode) {
          logger.debug(`[docker compose ps output]\n${stdout}`);
        }
        const containers = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [id, name, state] = line.split('|');
            return { id, name, state: state.toLowerCase(), version: undefined };
          })
          .filter(
            (container) => container.name !== 'devwp_certs',
          ) as Container[];

        // Fetch version information only for running containers
        try {
          for (const container of containers) {
            // Only get version if container is running
            if (container.state === 'running') {
              const version = await getContainerVersion(
                container.id,
                container.name,
              );
              container.version = version;
            }
          }
        } catch (versionError) {
          console.error('Error fetching container versions:', versionError);
        }
        resolve(containers);
      },
    );
  });
}

// Helper function to get container version
function getContainerVersion(
  containerId: string,
  containerName?: string,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    // If container name is provided, use it directly; otherwise, fetch it
    if (containerName) {
      getVersionForContainer(containerId, containerName, resolve);
    } else {
      exec(
        `docker inspect --format="{{.Name}}" ${containerId}`,
        (nameError, nameStdout) => {
          if (nameError) {
            console.error(
              `Error getting container name for ${containerId}:`,
              nameError,
            );
            resolve(undefined);
            return;
          }
          const name = nameStdout.trim().replace(/^\//, '');
          getVersionForContainer(containerId, name, resolve);
        },
      );
    }
  });
}

// Helper function to get version based on container name
function getVersionForContainer(
  containerId: string,
  containerName: string,
  resolve: (value: string | undefined) => void,
): void {
  switch (containerName) {
    case 'devwp_nginx':
      // Nginx outputs version to stderr
      exec(
        `docker exec ${containerId} nginx -v`,
        (nginxError, _stdout, nginxStderr) => {
          if (nginxError) {
            console.error(
              `Error getting Nginx version for container ${containerId}:`,
              nginxError,
            );
            resolve(undefined);
            return;
          }
          const output = nginxStderr;
          const versionMatch = output.match(/nginx\/(\d+\.\d+\.\d+)/);
          resolve(versionMatch ? versionMatch[1] : undefined);
        },
      );
      break;

    case 'devwp_php':
      // PHP outputs version to stdout, extract only the version number
      exec(
        `docker exec ${containerId} php --version`,
        (phpError, phpStdout) => {
          if (phpError) {
            console.error(
              `Error getting PHP version for container ${containerId}:`,
              phpError,
            );
            resolve(undefined);
            return;
          }
          // Extract version number from the first line, e.g. "PHP 8.1.2 (cli) ..."
          const match = phpStdout.match(/PHP\s+(\d+\.\d+\.\d+)/);
          resolve(match ? match[1] : undefined);
        },
      );
      break;

    case 'devwp_mariadb':
      // MariaDB outputs version to stdout, extract only the version number
      exec(
        `docker exec ${containerId} mariadb --version`,
        (mariaDbError, mariaDbStdout) => {
          if (mariaDbError) {
            console.error(
              `Error getting MariaDB version for container ${containerId}:`,
              mariaDbError,
            );
            resolve(undefined);
            return;
          }
          // Example output: "mariadb  Ver 15.1 Distrib 11.3.2-MariaDB, for debian-linux-gnu (x86_64) using  EditLine wrapper"
          const match = mariaDbStdout.match(/\s+([\d.]+)-MariaDB/);
          resolve(match ? match[1] : undefined);
        },
      );
      break;

    case 'devwp_redis':
      // Redis outputs version to stdout, extract only the version number
      exec(
        `docker exec ${containerId} redis-server --version`,
        (redisError, redisStdout) => {
          if (redisError) {
            console.error(
              `Error getting Redis version for container ${containerId}:`,
              redisError,
            );
            resolve(undefined);
            return;
          }
          // Example output: "Redis server v=7.0.5 sha=... ..."
          const match = redisStdout.match(/v=([\d.]+)/);
          resolve(match ? match[1] : undefined);
        },
      );
      break;

    case 'devwp_sonarqube':
      // SonarQube outputs version to stdout with 'sonar-scanner --version'
      exec(
        `docker exec ${containerId} curl http://localhost:9000/api/server/version`,
        (sonarError, sonarStdout) => {
          if (sonarError) {
            console.error(
              `Error getting SonarQube version for container ${containerId}:`,
              sonarError,
            );
            resolve(undefined);
            return;
          }
          resolve(sonarStdout);
        },
      );
      break;

    default:
      // For other containers, use the image tag
      exec(
        `docker inspect --format="{{index .Config.Image}}" ${containerId}`,
        (error, stdout) => {
          if (error) {
            console.error(
              `Error getting version for container ${containerId}:`,
              error,
            );
            if (verboseMode) {
              logger.debug(
                `docker inspect error for ${containerId}: ${error.message}`,
              );
            }
            resolve(undefined);
            return;
          }
          const image = stdout.trim();
          const versionMatch = image.match(/:([^:]+)$/);
          resolve(versionMatch ? versionMatch[1] : 'latest');
        },
      );
      break;
  }
}

// Function to restart a Docker container
export function restartContainer(containerId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec(`docker restart ${containerId}`, (error, stdout) => {
      if (error) {
        console.error('Error restarting container:', error);
        if (verboseMode) {
          logger.debug(
            `docker restart error for ${containerId}: ${error.message}`,
          );
        }
        reject(error);
        return;
      }
      console.log('Container restart output:', stdout);
      if (verboseMode) {
        logger.debug(`[docker restart stdout] ${stdout.trim()}`);
      }
      resolve(true);
    });
  });
}
