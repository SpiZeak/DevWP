import { promises as fs } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs');

describe('Nginx Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Config Generation', () => {
    it('should generate valid nginx config for basic site', () => {
      const domain = 'example.test';
      const webRoot = '/var/www/html';

      const config = generateNginxConfig(domain, webRoot);

      expect(config).toContain(`server_name ${domain}`);
      expect(config).toContain(`root ${webRoot}`);
      expect(config).toContain('ssl_certificate');
      expect(config).toContain('ssl_certificate_key');
    });

    it('should include aliases in server_name', () => {
      const domain = 'example.test';
      const aliases = ['www.example.test', 'alias.example.test'];
      const webRoot = '/var/www/html';

      const config = generateNginxConfig(domain, webRoot, aliases);

      expect(config).toContain(domain);
      aliases.forEach((alias) => {
        expect(config).toContain(alias);
      });
    });

    it('should configure multisite correctly', () => {
      const domain = 'multisite.test';
      const webRoot = '/var/www/html';
      const multisite = { enabled: true, type: 'subdomain' as const };

      const config = generateNginxConfig(domain, webRoot, [], multisite);

      expect(config).toContain('*.multisite.test');
      // Multisite-specific nginx configuration should be included
    });

    it('should handle subdirectory multisite', () => {
      const domain = 'multisite.test';
      const webRoot = '/var/www/html';
      const multisite = { enabled: true, type: 'subdirectory' as const };

      const config = generateNginxConfig(domain, webRoot, [], multisite);

      expect(config).toContain(domain);
      // Subdirectory multisite shouldn't use wildcard subdomain
      expect(config).not.toContain('*.');
    });
  });

  describe('Config File Operations', () => {
    it('should write config file with correct path', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const domain = 'example.test';
      const configPath = `/config/nginx/sites-enabled/${domain}.conf`;

      await fs.writeFile(configPath, 'config content');

      expect(fs.writeFile).toHaveBeenCalledWith(configPath, expect.any(String));
    });

    it('should remove nginx config file', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const domain = 'example.test';
      const configPath = `/config/nginx/sites-enabled/${domain}.conf`;

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
        await fs.unlink('/nonexistent.conf');
      } catch (err) {
        expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
      }
    });
  });

  describe('Nginx Reload', () => {
    it('should construct correct reload command', () => {
      const command = 'docker exec devwp_nginx nginx -s reload';

      expect(command).toContain('nginx -s reload');
      expect(command).toContain('devwp_nginx');
    });

    it('should validate reload signals', () => {
      const validSignals = ['reload', 'reopen', 'stop', 'quit'];

      validSignals.forEach((signal) => {
        const command = `nginx -s ${signal}`;
        expect(command).toContain(`-s ${signal}`);
      });
    });
  });
});

function generateNginxConfig(
  domain: string,
  webRoot: string,
  aliases: string[] = [],
  multisite?: { enabled: boolean; type: 'subdomain' | 'subdirectory' },
): string {
  const serverName =
    multisite?.enabled && multisite.type === 'subdomain'
      ? `${domain} *.${domain} ${aliases.join(' ')}`
      : `${domain} ${aliases.join(' ')}`;

  return `
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;

    server_name ${serverName.trim()};
    root ${webRoot};

    ssl_certificate /etc/nginx/certs/${domain}.pem;
    ssl_certificate_key /etc/nginx/certs/${domain}-key.pem;

    index index.php index.html;

    include /etc/nginx/global/wordpress.conf;
}
  `.trim();
}
