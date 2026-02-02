import { exec, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const frankenphpConfigPath = join(process.cwd(), 'config', 'frankenphp');
const sitesEnabledPath = join(frankenphpConfigPath, 'sites-enabled');
const templatePath = join(frankenphpConfigPath, 'template-site.caddy');

export async function generateFrankenphpConfig(
  domain: string,
  webRoot: string,
  aliases?: string,
  multisite?: {
    enabled: boolean;
    type: 'subdomain' | 'subdirectory';
  },
): Promise<void> {
  try {
    const templateContent = await fs.readFile(templatePath, 'utf8');
    await fs.mkdir(sitesEnabledPath, { recursive: true });

    const aliasList = aliases
      ? aliases
          .split(' ')
          .map((alias) => alias.trim())
          .filter(Boolean)
      : [];
    const hostnames = [domain, ...aliasList];

    if (multisite?.enabled && multisite.type === 'subdomain') {
      hostnames.unshift(`*.${domain}`);
    }

    const uniqueHostnames = Array.from(new Set(hostnames)).filter(Boolean);
    const httpAddresses = uniqueHostnames
      .map((hostname) => `http://${hostname}`)
      .join(', ');
    const httpsAddresses = uniqueHostnames
      .map((hostname) => `https://${hostname}`)
      .join(', ');

    const tlsDirective = shouldUseInternalTls(uniqueHostnames)
      ? 'tls internal'
      : '';

    const multisiteRules =
      multisite?.enabled && multisite.type === 'subdirectory'
        ? ['@wpadmin path /wp-admin', 'redir @wpadmin /wp-admin/ 301'].join(
            '\n  ',
          )
        : '';

    const finalConfig = templateContent
      .replace(/{{HTTP_ADDRESSES}}/g, httpAddresses)
      .replace(/{{HTTPS_ADDRESSES}}/g, httpsAddresses)
      .replace(/{{TLS_DIRECTIVE}}/g, tlsDirective)
      .replace(/{{ROOT}}/g, webRoot)
      .replace(/{{MULTISITE_RULES}}/g, multisiteRules);

    const newConfigPath = join(sitesEnabledPath, `${domain}.caddy`);
    await fs.writeFile(newConfigPath, finalConfig, 'utf8');
    console.log(`Generated FrankenPHP config for ${domain}`);
    await reloadFrankenphp();
  } catch (error) {
    console.error(`Failed to generate FrankenPHP config for ${domain}:`, error);
    throw error;
  }
}

function shouldUseInternalTls(hostnames: string[]): boolean {
  const normalized = hostnames.map((hostname) =>
    hostname.replace(/^\*\./, '').toLowerCase(),
  );

  return normalized.every(
    (hostname) =>
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.test'),
  );
}

export async function removeFrankenphpConfig(domain: string): Promise<void> {
  try {
    const configPath = join(sitesEnabledPath, `${domain}.caddy`);
    await fs.unlink(configPath);
    console.log(`Removed FrankenPHP config for ${domain}`);
    await reloadFrankenphp();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      console.log(
        `FrankenPHP config for ${domain} not found, skipping removal.`,
      );
      return;
    }
    console.error(`Failed to remove FrankenPHP config for ${domain}:`, error);
    throw error;
  }
}

async function reloadFrankenphp(): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(
      'docker compose exec frankenphp caddy reload --config /etc/caddy/Caddyfile',
      (error, _, stderr) => {
        if (error) {
          console.error(`Error reloading FrankenPHP: ${stderr}`);
          reject(error);
          return;
        }
        console.log('FrankenPHP reloaded successfully.');
        resolve();
      },
    );
  });
}

export async function reloadFrankenphpConfig(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const reloadProcess = spawn('docker', [
      'compose',
      'exec',
      'frankenphp',
      'caddy',
      'reload',
      '--config',
      '/etc/caddy/Caddyfile',
    ]);

    reloadProcess.on('close', (code) => {
      if (code === 0) {
        console.log('FrankenPHP configuration reloaded successfully');
        resolve();
      } else {
        console.error(
          `Failed to reload FrankenPHP configuration: exited with code ${code}`,
        );
        reject(
          new Error(
            `Failed to reload FrankenPHP configuration: exited with code ${code}`,
          ),
        );
      }
    });
  });
}
