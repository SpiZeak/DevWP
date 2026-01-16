import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';

const DEVWP_START = '# Start DevWP';
const DEVWP_END = '# End DevWP';

function updateDevWPBlock(
  hostsContent: string,
  domain: string,
  action: 'add' | 'remove',
): string {
  const lines = hostsContent.split('\n');
  const startIdx = lines.findIndex((line) => line.trim() === DEVWP_START);
  const endIdx = lines.findIndex((line) => line.trim() === DEVWP_END);
  let before: string[], block: string[], after: string[];

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    before = lines.slice(0, startIdx + 1);
    block = lines.slice(startIdx + 1, endIdx);
    after = lines.slice(endIdx);
  } else {
    // No block found, create new
    before = [...lines, DEVWP_START];
    block = [];
    after = [DEVWP_END];
  }

  const hostsEntry = `127.0.0.1 ${domain}`;

  // Remove any existing entry for this domain in the block
  block = block.filter((line) => !line.includes(domain));

  if (action === 'add') {
    block.push(hostsEntry);
  }
  // Remove empty lines at the end of the block
  while (block.length && !block[block.length - 1].trim()) block.pop();

  // Reconstruct the hosts file
  return [...before, ...block, ...after].join('\n').replace(/\n{3,}/g, '\n\n');
}

export async function modifyHostsFile(
  domain: string,
  action: 'add' | 'remove',
): Promise<void> {
  // Cross-platform hosts file path
  const isWin = platform() === 'win32';
  const isLinux = platform() === 'linux';
  const hostsPath = isWin
    ? join('C:', 'Windows', 'System32', 'drivers', 'etc', 'hosts')
    : '/etc/hosts';

  const execFileAsync = (file: string, args: string[]): Promise<void> =>
    new Promise((resolve, reject) => {
      execFile(file, args, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

  const accessFirst = async (paths: string[]): Promise<string | null> => {
    for (const candidate of paths) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // try next
      }
    }
    return null;
  };

  try {
    const hostsContent = await fs.readFile(hostsPath, 'utf8');
    const updatedContent = updateDevWPBlock(hostsContent, domain, action);

    // Always write updated content to a temp file and then elevate the copy.
    // This avoids fragile shell-escaping (e.g. echo + redirects).
    const tempFile = join(tmpdir(), `devwp_hosts_${randomUUID()}`);
    await writeFile(tempFile, updatedContent, { encoding: 'utf8' });
    try {
      // Windows has issues with direct echo to system files through sudo
      if (isWin) {
        const command = `copy "${tempFile}" "${hostsPath}" /Y`;
        const sudo = (await import('sudo-prompt')).default;
        await new Promise<void>((resolve, reject) => {
          sudo.exec(command, { name: 'DevWP' }, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      } else {
        // Linux: prefer pkexec (Polkit UI) for elevation.
        if (isLinux) {
          try {
            const installPath = await accessFirst([
              '/usr/bin/install',
              '/bin/install',
            ]);
            if (installPath) {
              await execFileAsync('pkexec', [
                installPath,
                '-m',
                '644',
                tempFile,
                hostsPath,
              ]);
            } else {
              const cpPath = await accessFirst(['/usr/bin/cp', '/bin/cp']);
              const chmodPath = await accessFirst([
                '/usr/bin/chmod',
                '/bin/chmod',
              ]);
              if (!cpPath || !chmodPath) {
                throw new Error(
                  'Required system binaries not found (cp/chmod).',
                );
              }
              await execFileAsync('pkexec', [cpPath, tempFile, hostsPath]);
              await execFileAsync('pkexec', [chmodPath, '644', hostsPath]);
            }
          } catch (error) {
            const errno = error as { code?: string };
            if (errno?.code !== 'ENOENT') throw error;

            // pkexec missing: fallback to sudo-prompt.
            const sudo = (await import('sudo-prompt')).default;
            const command = `cp "${tempFile}" "${hostsPath}" && chmod 644 "${hostsPath}"`;
            await new Promise<void>((resolve, reject) => {
              sudo.exec(command, { name: 'DevWP' }, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          }
        } else {
          // macOS/other Unix: use sudo-prompt.
          const sudo = (await import('sudo-prompt')).default;
          const command = `cp "${tempFile}" "${hostsPath}" && chmod 644 "${hostsPath}"`;
          await new Promise<void>((resolve, reject) => {
            sudo.exec(command, { name: 'DevWP' }, (error) => {
              if (error) reject(error);
              else resolve();
            });
          });
        }
      }
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  } catch (error) {
    console.error(`Failed to modify hosts file: ${error}`);
    throw error;
  }
}
