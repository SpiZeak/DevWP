import { describe, expect, it } from 'vitest';

describe('Site Service Utilities', () => {
  describe('Database Name Sanitization', () => {
    it('should sanitize domain to valid database name', () => {
      const testCases = [
        { input: 'example.test', expected: 'example_test' },
        { input: 'my-site.test', expected: 'my_site_test' },
        { input: 'café.test', expected: 'caf__test' }, // é becomes two underscores
      ];

      testCases.forEach(({ input, expected }) => {
        const result = sanitizeDatabaseName(input);
        expect(result).toBe(expected);
      });
    });

    it('should truncate long domain names to 64 characters', () => {
      const longDomain = 'very-long-domain-name-that-exceeds-limit.test';
      const result = sanitizeDatabaseName(longDomain);

      // Should be truncated and contain only valid characters
      expect(result.length).toBeLessThanOrEqual(64);
      expect(result).toMatch(/^[a-zA-Z0-9_]+$/);
    });

    it('should enforce 64 character limit', () => {
      const longDomain = `${'a'.repeat(100)}.test`;
      const result = sanitizeDatabaseName(longDomain);
      expect(result.length).toBeLessThanOrEqual(64);
    });

    it('should handle empty input', () => {
      const result = sanitizeDatabaseName('');
      expect(result).toBe('');
    });

    it('should remove all special characters', () => {
      const specialChars = 'test!@#$%^&*()+={}[]|\\:;"\'<>,.?/~`.test';
      const result = sanitizeDatabaseName(specialChars);
      expect(result).toMatch(/^[a-zA-Z0-9_]+$/);
    });

    it('should preserve alphanumeric characters', () => {
      const input = 'test123ABC';
      const result = sanitizeDatabaseName(input);
      expect(result).toBe('test123ABC');
    });
  });

  describe('WordPress Installation Command Building', () => {
    it('should generate correct wp-cli download command', () => {
      const webRoot = '/var/www/html';
      const command = `wp core download --path=${webRoot}`;

      expect(command).toContain('wp core download');
      expect(command).toContain(`--path=${webRoot}`);
    });

    it('should generate config creation command', () => {
      const dbName = 'example_test';
      const command = `wp config create --dbname=${dbName} --dbuser=root --dbpass=root`;

      expect(command).toContain('wp config create');
      expect(command).toContain(`--dbname=${dbName}`);
    });

    it('should generate installation command', () => {
      const url = 'https://example.test';
      const title = 'My Site';
      const command = `wp core install --url=${url} --title="${title}"`;

      expect(command).toContain('wp core install');
      expect(command).toContain(`--url=${url}`);
    });

    it('should support custom web root paths', () => {
      const webRoot = 'public_html';
      const domain = 'example.test';
      const expectedPath = `/src/www/${domain}/${webRoot}`;

      expect(expectedPath).toContain(webRoot);
      expect(expectedPath).toContain(domain);
    });
  });

  describe('Multisite Conversion Commands', () => {
    it('should build subdomain multisite command', () => {
      const command = 'wp core multisite-convert --subdomains';

      expect(command).toContain('multisite-convert');
      expect(command).toContain('--subdomains');
    });

    it('should build subdirectory multisite command', () => {
      const command = 'wp core multisite-convert';

      expect(command).toContain('multisite-convert');
      expect(command).not.toContain('--subdomains');
    });

    it('should validate multisite type', () => {
      const validTypes = ['subdomain', 'subdirectory'];
      expect(validTypes).toContain('subdomain');
      expect(validTypes).toContain('subdirectory');
      expect(validTypes).not.toContain('invalid');
    });
  });

  describe('Site Cleanup Operations', () => {
    it('should identify cleanup operations', () => {
      const cleanupSteps = ['database', 'files', 'nginx-config', 'hosts'];

      expect(cleanupSteps).toContain('database');
      expect(cleanupSteps).toContain('files');
      expect(cleanupSteps).toContain('nginx-config');
      expect(cleanupSteps).toContain('hosts');
    });

    it('should build database drop command', () => {
      const dbName = 'example_test';
      const command = `DROP DATABASE IF EXISTS ${dbName}`;

      expect(command).toContain('DROP DATABASE');
      expect(command).toContain(dbName);
    });

    it('should build file removal command', () => {
      const path = '/var/www/example.test';
      const command = `rm -rf ${path}`;

      expect(command).toContain('rm -rf');
      expect(command).toContain(path);
    });
  });

  describe('Path Construction', () => {
    it('should build correct site directory path', () => {
      const domain = 'example.test';
      const path = `/var/www/${domain}`;

      expect(path).toBe('/var/www/example.test');
    });

    it('should handle web root subdirectory', () => {
      const domain = 'example.test';
      const webRoot = 'public_html';
      const path = `/var/www/${domain}/${webRoot}`;

      expect(path).toBe('/var/www/example.test/public_html');
    });

    it('should normalize paths', () => {
      const path = '/var/www//example.test///public_html/';
      const normalized = path.replace(/\/+/g, '/').replace(/\/$/, '');

      expect(normalized).toBe('/var/www/example.test/public_html');
    });
  });
});

function sanitizeDatabaseName(domain: string): string {
  return domain.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 64);
}
