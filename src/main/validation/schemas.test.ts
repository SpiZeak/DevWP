import { describe, expect, it } from 'vitest';
import {
  ContainerSchema,
  DatabaseNameSchema,
  SettingsSchema,
  SiteConfigSchema,
  WpCliCommandSchema,
} from './schemas';

describe('SiteConfigSchema', () => {
  it('should validate a valid site configuration', () => {
    const validConfig = {
      domain: 'example.test',
      webRoot: '/var/www/html',
      aliases: 'www.example.test',
      multisite: {
        enabled: false,
      },
    };

    expect(() => SiteConfigSchema.parse(validConfig)).not.toThrow();
  });

  it('should reject empty domain', () => {
    const invalidConfig = {
      domain: '',
    };

    expect(() => SiteConfigSchema.parse(invalidConfig)).toThrow(
      'Domain is required',
    );
  });

  it('should reject invalid domain format', () => {
    const invalidConfig = {
      domain: 'invalid_domain!',
    };

    expect(() => SiteConfigSchema.parse(invalidConfig)).toThrow(
      'Invalid domain format',
    );
  });

  it('should accept domain without webroot', () => {
    const validConfig = {
      domain: 'example.test',
    };

    expect(() => SiteConfigSchema.parse(validConfig)).not.toThrow();
  });

  it('should validate multisite configuration', () => {
    const validConfig = {
      domain: 'example.test',
      multisite: {
        enabled: true,
        type: 'subdomain' as const,
      },
    };

    expect(() => SiteConfigSchema.parse(validConfig)).not.toThrow();
  });
});

describe('SettingsSchema', () => {
  it('should validate valid settings', () => {
    const validSettings = {
      webroot_path: '/var/www',
      xdebug_enabled: 'true' as const,
    };

    expect(() => SettingsSchema.parse(validSettings)).not.toThrow();
  });

  it('should reject empty webroot path', () => {
    const invalidSettings = {
      webroot_path: '',
      xdebug_enabled: 'false' as const,
    };

    expect(() => SettingsSchema.parse(invalidSettings)).toThrow(
      'Webroot path is required',
    );
  });

  it('should only accept "true" or "false" for xdebug_enabled', () => {
    const invalidSettings = {
      webroot_path: '/var/www',
      xdebug_enabled: 'yes',
    };

    expect(() => SettingsSchema.parse(invalidSettings)).toThrow();
  });
});

describe('DatabaseNameSchema', () => {
  it('should validate a valid database name', () => {
    expect(() => DatabaseNameSchema.parse('my_database_123')).not.toThrow();
  });

  it('should reject database name with special characters', () => {
    expect(() => DatabaseNameSchema.parse('my-database!')).toThrow(
      'Database name must contain only letters, numbers, and underscores',
    );
  });

  it('should reject database name with spaces', () => {
    expect(() => DatabaseNameSchema.parse('my database')).toThrow();
  });

  it('should reject database name exceeding 64 characters', () => {
    const longName = 'a'.repeat(65);
    expect(() => DatabaseNameSchema.parse(longName)).toThrow();
  });

  it('should accept database name with 64 characters', () => {
    const exactName = 'a'.repeat(64);
    expect(() => DatabaseNameSchema.parse(exactName)).not.toThrow();
  });
});

describe('ContainerSchema', () => {
  it('should validate a valid container configuration', () => {
    const validContainer = {
      id: 'abc123',
      name: 'nginx',
      state: 'running',
      version: '1.21',
      health: 'healthy' as const,
    };

    expect(() => ContainerSchema.parse(validContainer)).not.toThrow();
  });

  it('should accept container without version', () => {
    const validContainer = {
      id: 'abc123',
      name: 'nginx',
      state: 'running',
    };

    expect(() => ContainerSchema.parse(validContainer)).not.toThrow();
  });

  it('should validate health status enum values', () => {
    const validHealthValues = ['healthy', 'unhealthy', 'starting', 'none'];

    validHealthValues.forEach((health) => {
      const container = {
        id: 'abc123',
        name: 'test',
        state: 'running',
        health,
      };
      expect(() => ContainerSchema.parse(container)).not.toThrow();
    });
  });
});

describe('WpCliCommandSchema', () => {
  it('should validate a valid WP-CLI command', () => {
    const validCommand = {
      site: {
        domain: 'example.test',
        webRoot: '/var/www/html',
      },
      command: 'plugin list',
    };

    expect(() => WpCliCommandSchema.parse(validCommand)).not.toThrow();
  });

  it('should reject empty command', () => {
    const invalidCommand = {
      site: {
        domain: 'example.test',
      },
      command: '',
    };

    expect(() => WpCliCommandSchema.parse(invalidCommand)).toThrow(
      'Command is required',
    );
  });

  it('should accept site without webRoot', () => {
    const validCommand = {
      site: {
        domain: 'example.test',
      },
      command: 'plugin list',
    };

    expect(() => WpCliCommandSchema.parse(validCommand)).not.toThrow();
  });
});
