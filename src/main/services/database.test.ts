/* eslint-disable @typescript-eslint/no-explicit-any */

import { exec } from 'child_process';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import * as database from './database';

// Mock modules
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));
vi.mock('os', () => ({
  homedir: () => '/home/testuser',
  default: {
    homedir: () => '/home/testuser',
  },
}));
vi.mock('node:os', () => ({
  homedir: () => '/home/testuser',
  default: {
    homedir: () => '/home/testuser',
  },
}));
vi.mock('path', () => {
  const join = (...args: string[]) => args.join('/');
  return {
    join,
    resolve: join,
    default: {
      join,
      resolve: join,
    },
  };
});
vi.mock('node:path', () => {
  const join = (...args: string[]) => args.join('/');
  return {
    join,
    resolve: join,
    default: {
      join,
      resolve: join,
    },
  };
});

describe('Database Service', () => {
  const mockExec = exec as unknown as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('waitForDatabase', () => {
    it('should successfully connect on first attempt', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(null, 'success', '');
        return {} as any;
      });

      await expect(database.waitForDatabase(5, 100)).resolves.toBeUndefined();
      expect(mockExec).toHaveBeenCalledTimes(1);
    });

    it('should retry on connection failures and eventually succeed', async () => {
      let callCount = 0;
      mockExec.mockImplementation((_cmd, callback: any) => {
        callCount++;
        if (callCount < 3) {
          callback(new Error('Connection failed'), '', 'Connection refused');
        } else {
          callback(null, 'success', '');
        }
        return {} as any;
      });

      await expect(database.waitForDatabase(5, 50)).resolves.toBeUndefined();
      expect(mockExec.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should throw error after max retries exceeded', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(new Error('Connection failed'), '', 'Connection refused');
        return {} as any;
      });

      await expect(database.waitForDatabase(3, 10)).rejects.toThrow(
        'Failed to connect to database after 3 attempts',
      );
    });
  });

  describe('initializeConfigDatabase', () => {
    it('should initialize database and tables successfully', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(null, 'success', '');
        return {} as any;
      });

      await expect(
        database.initializeConfigDatabase(),
      ).resolves.toBeUndefined();
      // Should call: waitForDatabase, create database, create sites table, create settings table
      expect(mockExec.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle database creation errors', async () => {
      let callCount = 0;
      mockExec.mockImplementation((_cmd, callback: any) => {
        callCount++;
        if (callCount === 2) {
          // Fail on database creation
          callback(new Error('DB creation failed'), '', 'Permission denied');
        } else {
          callback(null, 'success', '');
        }
        return {} as any;
      });

      await expect(database.initializeConfigDatabase()).rejects.toThrow();
    });

    it('should continue if default settings initialization fails', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        if (_cmd.includes('SELECT value_text')) {
          callback(new Error('Read failed'), '', '');
        } else {
          callback(null, 'success', '');
        }
        return {} as any;
      });

      // Should not throw even if settings initialization fails
      await expect(
        database.initializeConfigDatabase(),
      ).resolves.toBeUndefined();
    });
  });

  describe('saveSiteConfiguration', () => {
    it('should save basic site configuration', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        expect(_cmd).toContain('INSERT INTO sites');
        expect(_cmd).toContain('example.test');
        callback(null, 'success', '');
        return {} as any;
      });

      const site: database.SiteConfiguration = {
        domain: 'example.test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(
        database.saveSiteConfiguration(site),
      ).resolves.toBeUndefined();
      expect(mockExec).toHaveBeenCalledTimes(1);
    });

    it('should save site with aliases and webRoot', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        expect(_cmd).toContain('www.example.test');
        expect(_cmd).toContain('/var/www/example');
        callback(null, 'success', '');
        return {} as any;
      });

      const site: database.SiteConfiguration = {
        domain: 'example.test',
        aliases: 'www.example.test',
        webRoot: '/var/www/example',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(
        database.saveSiteConfiguration(site),
      ).resolves.toBeUndefined();
    });

    it('should save site with multisite configuration', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        expect(_cmd).toContain('multisite_enabled');
        expect(_cmd).toContain('subdomain');
        callback(null, 'success', '');
        return {} as any;
      });

      const site: database.SiteConfiguration = {
        domain: 'example.test',
        multisite: {
          enabled: true,
          type: 'subdomain',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(
        database.saveSiteConfiguration(site),
      ).resolves.toBeUndefined();
    });

    it('should handle SQL injection attempts', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        // Check that single quotes are escaped
        expect(_cmd).toContain("''");
        callback(null, 'success', '');
        return {} as any;
      });

      const site: database.SiteConfiguration = {
        domain: "test'; DROP TABLE sites; --",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(
        database.saveSiteConfiguration(site),
      ).resolves.toBeUndefined();
    });

    it('should reject on database error', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(new Error('Insert failed'), '', 'Constraint violation');
        return {} as any;
      });

      const site: database.SiteConfiguration = {
        domain: 'example.test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(database.saveSiteConfiguration(site)).rejects.toThrow();
    });
  });

  describe('getAllSiteConfigurations', () => {
    it('should return empty array when no sites exist', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(null, '', '');
        return {} as any;
      });

      const sites = await database.getAllSiteConfigurations();
      expect(sites).toEqual([]);
    });

    it('should parse and return multiple sites', async () => {
      const mockOutput = `domain\taliases\tweb_root\tmultisite_enabled\tmultisite_type\tcreated_at\tupdated_at
example.test\t\t\t0\tNULL\t2023-01-01 00:00:00\t2023-01-01 00:00:00
another.test\twww.another.test\t/var/www\t1\tsubdomain\t2023-01-02 00:00:00\t2023-01-02 00:00:00`;

      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(null, mockOutput, '');
        return {} as any;
      });

      const sites = await database.getAllSiteConfigurations();
      expect(sites).toHaveLength(2);
      expect(sites[0].domain).toBe('example.test');
      expect(sites[0].multisite).toBeUndefined();
      expect(sites[1].domain).toBe('another.test');
      expect(sites[1].aliases).toBe('www.another.test');
      expect(sites[1].multisite?.enabled).toBe(true);
    });

    it('should handle parse errors gracefully', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(null, undefined as unknown as string, '');
        return {} as any;
      });

      await expect(database.getAllSiteConfigurations()).rejects.toThrow();
    });

    it('should reject on database error', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(new Error('Query failed'), '', 'Connection lost');
        return {} as any;
      });

      await expect(database.getAllSiteConfigurations()).rejects.toThrow();
    });
  });

  describe('getSiteConfiguration', () => {
    it('should return site configuration when found', async () => {
      const mockOutput = `domain\taliases\tweb_root\tmultisite_enabled\tmultisite_type\tcreated_at\tupdated_at
example.test\t\t\t0\tNULL\t2023-01-01 00:00:00\t2023-01-01 00:00:00`;

      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(null, mockOutput, '');
        return {} as any;
      });

      const site = await database.getSiteConfiguration('example.test');
      expect(site).not.toBeNull();
      expect(site?.domain).toBe('example.test');
    });

    it('should return null when site not found', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(null, '', '');
        return {} as any;
      });

      const site = await database.getSiteConfiguration('nonexistent.test');
      expect(site).toBeNull();
    });

    it('should handle SQL injection in domain parameter', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        expect(_cmd).toContain("''");
        callback(null, '', '');
        return {} as any;
      });

      await database.getSiteConfiguration("test'; DROP TABLE sites; --");
      expect(mockExec).toHaveBeenCalled();
    });

    it('should reject on database error', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(new Error('Query failed'), '', '');
        return {} as any;
      });

      await expect(
        database.getSiteConfiguration('example.test'),
      ).rejects.toThrow();
    });
  });

  describe('deleteSiteConfiguration', () => {
    it('should delete site configuration successfully', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        expect(_cmd).toContain('DELETE FROM sites');
        expect(_cmd).toContain('example.test');
        callback(null, 'success', '');
        return {} as any;
      });

      await expect(
        database.deleteSiteConfiguration('example.test'),
      ).resolves.toBeUndefined();
      expect(mockExec).toHaveBeenCalledTimes(1);
    });

    it('should handle SQL injection in domain parameter', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        expect(_cmd).toContain("''");
        callback(null, 'success', '');
        return {} as any;
      });

      await database.deleteSiteConfiguration("test'; DROP TABLE sites; --");
      expect(mockExec).toHaveBeenCalled();
    });

    it('should reject on database error', async () => {
      mockExec.mockImplementation((_cmd, callback: any) => {
        callback(new Error('Delete failed'), '', '');
        return {} as any;
      });

      await expect(
        database.deleteSiteConfiguration('example.test'),
      ).rejects.toThrow();
    });
  });

  describe('Settings functions', () => {
    describe('saveSetting', () => {
      it('should save setting successfully', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          expect(_cmd).toContain('INSERT INTO settings');
          expect(_cmd).toContain('test_key');
          expect(_cmd).toContain('test_value');
          callback(null, 'success', '');
          return {} as any;
        });

        await expect(
          database.saveSetting('test_key', 'test_value'),
        ).resolves.toBeUndefined();
      });

      it('should handle SQL injection in key and value', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          expect(_cmd).toContain("''");
          callback(null, 'success', '');
          return {} as any;
        });

        await database.saveSetting("key'test", "value'test");
        expect(mockExec).toHaveBeenCalled();
      });
    });

    describe('getSetting', () => {
      it('should return setting value when found', async () => {
        const mockOutput = `value_text
test_value`;

        mockExec.mockImplementation((_cmd, callback: any) => {
          callback(null, mockOutput, '');
          return {} as any;
        });

        const value = await database.getSetting('test_key');
        expect(value).toBe('test_value');
      });

      it('should return null when setting not found', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          callback(null, '', '');
          return {} as any;
        });

        const value = await database.getSetting('nonexistent_key');
        expect(value).toBeNull();
      });
    });

    describe('getAllSettings', () => {
      it('should return all settings as object', async () => {
        const mockOutput = `key_name\tvalue_text
setting1\tvalue1
setting2\tvalue2`;

        mockExec.mockImplementation((_cmd, callback: any) => {
          callback(null, mockOutput, '');
          return {} as any;
        });

        const settings = await database.getAllSettings();
        expect(settings).toEqual({
          setting1: 'value1',
          setting2: 'value2',
        });
      });

      it('should return empty object when no settings exist', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          callback(null, '', '');
          return {} as any;
        });

        const settings = await database.getAllSettings();
        expect(settings).toEqual({});
      });
    });

    describe('deleteSetting', () => {
      it('should delete setting successfully', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          expect(_cmd).toContain('DELETE FROM settings');
          callback(null, 'success', '');
          return {} as any;
        });

        await expect(
          database.deleteSetting('test_key'),
        ).resolves.toBeUndefined();
      });
    });

    describe('getWebrootPath', () => {
      it('should return saved webroot path', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          callback(null, 'value_text\n/custom/path', '');
          return {} as any;
        });

        const path = await database.getWebrootPath();
        expect(path).toBe('/custom/path');
      });

      it('should return default path when not found', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          callback(null, '', '');
          return {} as any;
        });

        const path = await database.getWebrootPath();
        expect(path).toBe('/home/testuser/www');
      });

      it('should return default path on error', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          callback(new Error('Query failed'), '', '');
          return {} as any;
        });

        const path = await database.getWebrootPath();
        expect(path).toBe('/home/testuser/www');
      });
    });

    describe('getXdebugEnabledSetting', () => {
      it('should return true when setting is "true"', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          callback(null, 'value_text\ntrue', '');
          return {} as any;
        });

        const enabled = await database.getXdebugEnabledSetting();
        expect(enabled).toBe(true);
      });

      it('should return false when setting is "false"', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          callback(null, 'value_text\nfalse', '');
          return {} as any;
        });

        const enabled = await database.getXdebugEnabledSetting();
        expect(enabled).toBe(false);
      });

      it('should return false as default when not found', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          callback(null, '', '');
          return {} as any;
        });

        const enabled = await database.getXdebugEnabledSetting();
        expect(enabled).toBe(false);
      });

      it('should return false on error', async () => {
        mockExec.mockImplementation((_cmd, callback: any) => {
          callback(new Error('Query failed'), '', '');
          return {} as any;
        });

        const enabled = await database.getXdebugEnabledSetting();
        expect(enabled).toBe(false);
      });
    });
  });

  describe('migrateExistingSites', () => {
    it('should skip migration if www directory does not exist', async () => {
      const mockFs = await import('fs');
      vi.spyOn(mockFs.promises, 'readdir').mockRejectedValue(
        new Error('ENOENT'),
      );

      await expect(database.migrateExistingSites()).rejects.toThrow();
    });
  });
});
