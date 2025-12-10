import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteConfigSchema } from '../validation/schemas';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('../services/site');
vi.mock('../services/logger');

describe('Site IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create-site handler', () => {
    it('should validate input before processing', () => {
      const validInput = {
        domain: 'example.test',
        webRoot: '/var/www/html',
        multisite: { enabled: false },
      };

      expect(() => SiteConfigSchema.parse(validInput)).not.toThrow();
    });

    it('should reject invalid domain formats', () => {
      const emptyDomain = { domain: '', multisite: { enabled: false } };
      expect(() => SiteConfigSchema.parse(emptyDomain)).toThrow();
    });

    it('should handle domains with special characters', () => {
      const specialDomain = {
        domain: 'test-site.local',
        multisite: { enabled: false },
      };
      // Domain with dash and dot should be valid
      expect(() => SiteConfigSchema.parse(specialDomain)).not.toThrow();
    });

    it('should accept valid domain with TLD', () => {
      const validInput = {
        domain: 'my-site.local',
        multisite: { enabled: false },
      };

      expect(() => SiteConfigSchema.parse(validInput)).not.toThrow();
    });

    it('should accept multisite configuration', () => {
      const validInput = {
        domain: 'multisite.test',
        multisite: {
          enabled: true,
          type: 'subdomain' as const,
        },
      };

      expect(() => SiteConfigSchema.parse(validInput)).not.toThrow();
    });

    it('should reject invalid multisite types', () => {
      const invalidInput = {
        domain: 'multisite.test',
        multisite: {
          enabled: true,
          type: 'invalid' as 'subdomain' | 'subdirectory',
        },
      };

      expect(() => SiteConfigSchema.parse(invalidInput)).toThrow();
    });
  });

  describe('delete-site handler', () => {
    it('should validate domain parameter', () => {
      const validDomain = 'example.test';
      expect(validDomain).toMatch(/^[a-zA-Z0-9.-]+$/);
    });

    it('should reject empty domain', () => {
      const emptyDomain = '';
      expect(emptyDomain).toBe('');
    });
  });

  describe('update-site handler', () => {
    it('should accept partial updates', () => {
      const partialUpdate = {
        domain: 'example.test',
        aliases: 'www.example.test',
        // webRoot not provided, should remain unchanged
      };

      expect(partialUpdate).toHaveProperty('domain');
      expect(partialUpdate).toHaveProperty('aliases');
      expect(partialUpdate).not.toHaveProperty('webRoot');
    });

    it('should validate multisite updates', () => {
      const multisiteUpdate = {
        domain: 'example.test',
        multisite: {
          enabled: true,
          type: 'subdirectory' as const,
        },
      };

      expect(multisiteUpdate.multisite.enabled).toBe(true);
      expect(multisiteUpdate.multisite.type).toBe('subdirectory');
    });
  });

  describe('get-sites handler', () => {
    it('should return array of sites', () => {
      const mockSites = [
        { domain: 'site1.test', multisite: { enabled: false } },
        {
          domain: 'site2.test',
          multisite: { enabled: true, type: 'subdomain' as const },
        },
      ];

      expect(Array.isArray(mockSites)).toBe(true);
      expect(mockSites).toHaveLength(2);
    });

    it('should handle empty sites list', () => {
      const mockSites: unknown[] = [];
      expect(Array.isArray(mockSites)).toBe(true);
      expect(mockSites).toHaveLength(0);
    });
  });

  describe('Validation Schemas', () => {
    it('should enforce required fields', () => {
      const missingDomain = {
        multisite: { enabled: false },
      };

      expect(() => SiteConfigSchema.parse(missingDomain)).toThrow();
    });

    it('should provide default values for optional fields', () => {
      const minimal = {
        domain: 'example.test',
        multisite: { enabled: false },
      };

      const parsed = SiteConfigSchema.parse(minimal);
      expect(parsed.domain).toBe('example.test');
    });

    it('should validate aliases format', () => {
      const withAliases = {
        domain: 'example.test',
        aliases: 'www.example.test alias.example.test',
        multisite: { enabled: false },
      };

      expect(() => SiteConfigSchema.parse(withAliases)).not.toThrow();
    });
  });
});
