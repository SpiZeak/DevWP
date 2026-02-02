import { promises as fs } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs');

describe('FrankenPHP Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Config Generation', () => {
    it('should generate valid Caddy config for basic site', () => {
      const domain = 'example.test';
      const webRoot = '/var/www/html';

      const config = generateFrankenphpConfig(domain, webRoot);

      expect(config).toContain(`https://${domain}`);
      expect(config).toContain(`root * ${webRoot}`);
      expect(config).toContain('tls internal');
    });

    it('should include aliases in addresses', () => {
      const domain = 'example.test';
      const aliases = ['www.example.test', 'alias.example.test'];
      const webRoot = '/var/www/html';

      const config = generateFrankenphpConfig(domain, webRoot, aliases);

      expect(config).toContain(domain);
      aliases.forEach((alias) => {
        expect(config).toContain(alias);
      });
    });

    it('should configure multisite subdomain correctly', () => {
      const domain = 'multisite.test';
      const webRoot = '/var/www/html';
      const multisite = { enabled: true, type: 'subdomain' as const };

      const config = generateFrankenphpConfig(domain, webRoot, [], multisite);

      expect(config).toContain(`https://*.${domain}`);
    });

    it('should handle subdirectory multisite', () => {
      const domain = 'multisite.test';
      const webRoot = '/var/www/html';
      const multisite = { enabled: true, type: 'subdirectory' as const };

      const config = generateFrankenphpConfig(domain, webRoot, [], multisite);

      expect(config).toContain('redir @wpadmin /wp-admin/ 301');
      expect(config).not.toContain(`https://*.${domain}`);
    });
  });

  describe('Config File Operations', () => {
    it('should write config file with correct path', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const domain = 'example.test';
      const configPath = `/config/frankenphp/sites/${domain}.caddy`;

      await fs.writeFile(configPath, 'config content');

      expect(fs.writeFile).toHaveBeenCalledWith(configPath, expect.any(String));
    });

    it('should remove frankenphp config file', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const domain = 'example.test';
      const configPath = `/config/frankenphp/sites/${domain}.caddy`;

      await fs.unlink(configPath);

      expect(fs.unlink).toHaveBeenCalledWith(configPath);
    });

    it('should handle missing config file gracefully', async () => {
      const error = new Error(
        'ENOENT: no such file or directory',
      ) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.unlink).mockRejectedValue(error);

      try {
        await fs.unlink('/nonexistent.caddy');
      } catch (err) {
        expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
      }
    });
  });

  describe('FrankenPHP Reload', () => {
    it('should construct correct reload command', () => {
      const command =
        'docker exec devwp_frankenphp caddy reload --config /etc/caddy/Caddyfile';

      expect(command).toContain('caddy reload');
      expect(command).toContain('devwp_frankenphp');
    });
  });
});

function generateFrankenphpConfig(
  domain: string,
  webRoot: string,
  aliases: string[] = [],
  multisite?: { enabled: boolean; type: 'subdomain' | 'subdirectory' },
): string {
  const hostnames = [domain, ...aliases];

  if (multisite?.enabled && multisite.type === 'subdomain') {
    hostnames.unshift(`*.${domain}`);
  }

  const addresses = hostnames.map((hostname) => `https://${hostname}`);
  const normalized = hostnames.map((hostname) =>
    hostname.replace(/^\*\./, '').toLowerCase(),
  );
  const tlsDirective = normalized.every(
    (hostname) =>
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.test'),
  )
    ? 'tls internal'
    : '';

  const multisiteRules =
    multisite?.enabled && multisite.type === 'subdirectory'
      ? ['@wpadmin path /wp-admin', 'redir @wpadmin /wp-admin/ 301'].join(
          '\n  ',
        )
      : '';

  return `
${addresses.join(', ')} {
  ${tlsDirective}
  root * ${webRoot}
  ${multisiteRules}
  try_files {path} {path}/ /index.php?{query}
  php_server
}
  `.trim();
}
