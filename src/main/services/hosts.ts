import { promises as fs } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import sudo from 'sudo-prompt';

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
  const hostsPath = isWin
    ? join('C:', 'Windows', 'System32', 'drivers', 'etc', 'hosts')
    : '/etc/hosts';

  try {
    const hostsContent = await fs.readFile(hostsPath, 'utf8');
    const updatedContent = updateDevWPBlock(hostsContent, domain, action);

    // Windows has issues with direct echo to system files through sudo
    if (isWin) {
      // Create a temp file for the new hosts content
      const tempFile = join(tmpdir(), 'hosts_temp');
      await writeFile(tempFile, updatedContent, 'utf8');

      const command = `copy "${tempFile}" "${hostsPath}" /Y`;

      await new Promise<void>((resolve, reject) => {
        sudo.exec(command, { name: 'DevWP' }, (error) => {
          if (error) {
            console.error(`Failed to modify hosts file: ${error}`);
            reject(error);
          } else {
            resolve();
          }
        });
      });
    } else {
      // Unix approach
      const command = `echo "${updatedContent.replace(/"/g, '\\"')}" > ${hostsPath}`;
      await new Promise<void>((resolve, reject) => {
        sudo.exec(command, { name: 'DevWP' }, (error) => {
          if (error) {
            console.error(`Failed to modify hosts file: ${error}`);
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  } catch (error) {
    console.error(`Failed to modify hosts file: ${error}`);
    throw error;
  }
}
