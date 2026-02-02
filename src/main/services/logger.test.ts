import { describe, expect, it, vi } from 'vitest';
import {
  logDatabaseOperation,
  logDockerOperation,
  logError,
  logFrankenphpOperation,
  logSiteOperation,
  logWpCliCommand,
} from './logger';

// Mock winston logger
vi.mock('winston', () => ({
  default: {
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
    format: {
      combine: vi.fn(),
      timestamp: vi.fn(),
      errors: vi.fn(),
      splat: vi.fn(),
      json: vi.fn(),
      colorize: vi.fn(),
      printf: vi.fn(),
    },
    transports: {
      Console: vi.fn(),
    },
    addColors: vi.fn(),
  },
}));

vi.mock('winston-daily-rotate-file', () => ({
  default: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/fake/path'),
  },
}));

describe('Logger Utility Functions', () => {
  describe('logSiteOperation', () => {
    it('should log site operation with domain', () => {
      logSiteOperation('create', 'example.test');
      // Since logger is mocked, we just verify it doesn't throw
      expect(() => logSiteOperation('create', 'example.test')).not.toThrow();
    });

    it('should log site operation with additional details', () => {
      const details = { webRoot: '/var/www/html', multisite: false };
      expect(() =>
        logSiteOperation('create', 'example.test', details),
      ).not.toThrow();
    });
  });

  describe('logDockerOperation', () => {
    it('should log docker operation', () => {
      expect(() => logDockerOperation('start', 'frankenphp')).not.toThrow();
    });

    it('should log docker operation with details', () => {
      const details = { status: 'running', health: 'healthy' };
      expect(() =>
        logDockerOperation('start', 'frankenphp', details),
      ).not.toThrow();
    });
  });

  describe('logError', () => {
    it('should log error with context', () => {
      const error = new Error('Test error');
      expect(() => logError('test-context', error)).not.toThrow();
    });

    it('should log error with additional details', () => {
      const error = new Error('Test error');
      const details = { domain: 'example.test', operation: 'create' };
      expect(() => logError('test-context', error, details)).not.toThrow();
    });

    it('should handle error with stack trace', () => {
      const error = new Error('Test error with stack');
      error.stack = 'Error: Test error with stack\n    at Object.<anonymous>';
      expect(() => logError('test-context', error)).not.toThrow();
    });
  });

  describe('logDatabaseOperation', () => {
    it('should log database operation', () => {
      expect(() => logDatabaseOperation('create')).not.toThrow();
    });

    it('should log database operation with details', () => {
      const details = { dbName: 'test_db', user: 'test_user' };
      expect(() => logDatabaseOperation('create', details)).not.toThrow();
    });
  });

  describe('logFrankenphpOperation', () => {
    it('should log frankenphp operation', () => {
      expect(() => logFrankenphpOperation('reload')).not.toThrow();
    });

    it('should log frankenphp operation with details', () => {
      const details = { configPath: '/etc/caddy/Caddyfile' };
      expect(() => logFrankenphpOperation('reload', details)).not.toThrow();
    });
  });

  describe('logWpCliCommand', () => {
    it('should log WP-CLI command', () => {
      expect(() =>
        logWpCliCommand('example.test', 'plugin list'),
      ).not.toThrow();
    });

    it('should log WP-CLI command with details', () => {
      const details = { exitCode: 0, duration: 123 };
      expect(() =>
        logWpCliCommand('example.test', 'plugin list', details),
      ).not.toThrow();
    });
  });
});
