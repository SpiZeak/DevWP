/* biome-ignore-all lint/suspicious/noExplicitAny: test mocks rely on any for flexibility */

import * as child_process from 'node:child_process';
import { EventEmitter } from 'node:events';
import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerWpCliHandlers } from './wpCli';

// Mock modules
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));
vi.mock('child_process');

describe('WP-CLI IPC Handlers', () => {
  let mockEvent: any;
  let mockProcess: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEvent = {
      sender: {
        send: vi.fn(),
      },
    };

    mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    vi.mocked(child_process.spawn).mockReturnValue(mockProcess);
  });

  describe('registerWpCliHandlers', () => {
    it('should remove existing handler before registering', () => {
      registerWpCliHandlers();

      expect(ipcMain.removeHandler).toHaveBeenCalledWith('run-wp-cli');
    });

    it('should register run-wp-cli handler', () => {
      registerWpCliHandlers();

      expect(ipcMain.handle).toHaveBeenCalledWith(
        'run-wp-cli',
        expect.any(Function),
      );
    });
  });

  describe('run-wp-cli handler', () => {
    it('should spawn docker exec command with correct arguments', async () => {
      registerWpCliHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'run-wp-cli')?.[1];

      const site = { name: 'example.test' };
      const command = 'plugin list';

      // Start the promise
      const promise = handler?.(mockEvent, { site, command });

      // Simulate process completion
      mockProcess.emit('close', 0);

      await promise;

      expect(child_process.spawn).toHaveBeenCalledWith('docker', [
        'exec',
        '-w',
        '/src/www/example.test',
        'devwp_frankenphp',
        'php',
        '-d',
        'error_reporting="E_ALL & ~E_DEPRECATED & ~E_WARNING"',
        '/usr/local/bin/wp',
        'plugin',
        'list',
      ]);
    });

    it('should stream stdout data to renderer', async () => {
      registerWpCliHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'run-wp-cli')?.[1];

      const site = { name: 'example.test' };
      const command = 'plugin list';

      // Start the promise
      const promise = handler?.(mockEvent, { site, command });

      // Simulate stdout data
      mockProcess.stdout.emit('data', Buffer.from('Plugin output'));

      // Simulate process completion
      mockProcess.emit('close', 0);

      await promise;

      expect(mockEvent.sender.send).toHaveBeenCalledWith('wp-cli-stream', {
        type: 'stdout',
        data: 'Plugin output',
        siteId: 'example.test',
      });
    });

    it('should stream stderr data to renderer', async () => {
      registerWpCliHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'run-wp-cli')?.[1];

      const site = { name: 'example.test' };
      const command = 'plugin install missing';

      // Start the promise
      const promise = handler?.(mockEvent, { site, command });

      // Simulate stderr data
      mockProcess.stderr.emit('data', Buffer.from('Error: Plugin not found'));

      // Simulate process completion with error code
      mockProcess.emit('close', 1);

      await promise;

      expect(mockEvent.sender.send).toHaveBeenCalledWith('wp-cli-stream', {
        type: 'stderr',
        data: 'Error: Plugin not found',
        siteId: 'example.test',
      });
    });

    it('should send complete event on successful execution', async () => {
      registerWpCliHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'run-wp-cli')?.[1];

      const site = { name: 'example.test' };
      const command = 'core version';

      // Start the promise
      const promise = handler?.(mockEvent, { site, command });

      // Simulate stdout data
      mockProcess.stdout.emit('data', Buffer.from('6.4.2'));

      // Simulate process completion
      mockProcess.emit('close', 0);

      const result = await promise;

      expect(mockEvent.sender.send).toHaveBeenCalledWith('wp-cli-stream', {
        type: 'complete',
        code: 0,
        siteId: 'example.test',
      });
      expect(result).toEqual({
        success: true,
        output: '6.4.2',
        error: '',
      });
    });

    it('should handle command execution errors', async () => {
      registerWpCliHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'run-wp-cli')?.[1];

      const site = { name: 'example.test' };
      const command = 'invalid command';

      // Start the promise
      const promise = handler?.(mockEvent, { site, command });

      // Simulate error event
      mockProcess.emit('error', new Error('Command failed'));

      const result = await promise;

      expect(mockEvent.sender.send).toHaveBeenCalledWith('wp-cli-stream', {
        type: 'error',
        error: 'Command failed',
        siteId: 'example.test',
      });
      expect(result).toEqual({
        success: false,
        error: 'Command failed',
      });
    });

    it('should handle non-zero exit codes', async () => {
      registerWpCliHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'run-wp-cli')?.[1];

      const site = { name: 'example.test' };
      const command = 'plugin install invalid';

      // Start the promise
      const promise = handler?.(mockEvent, { site, command });

      // Simulate stderr
      mockProcess.stderr.emit('data', Buffer.from('Error: Plugin not found'));

      // Simulate process completion with error code
      mockProcess.emit('close', 1);

      const result = await promise;

      expect(result).toEqual({
        success: false,
        error: 'Error: Plugin not found',
        output: '',
      });
    });

    it('should handle exit code with no error message', async () => {
      registerWpCliHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'run-wp-cli')?.[1];

      const site = { name: 'example.test' };
      const command = 'some command';

      // Start the promise
      const promise = handler?.(mockEvent, { site, command });

      // Simulate process completion with error code but no stderr
      mockProcess.emit('close', 127);

      const result = await promise;

      expect(result).toEqual({
        success: false,
        error: 'Process exited with code 127',
        output: '',
      });
    });

    it('should accumulate multiple stdout chunks', async () => {
      registerWpCliHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'run-wp-cli')?.[1];

      const site = { name: 'example.test' };
      const command = 'plugin list';

      // Start the promise
      const promise = handler?.(mockEvent, { site, command });

      // Simulate multiple stdout chunks
      mockProcess.stdout.emit('data', Buffer.from('Chunk 1\n'));
      mockProcess.stdout.emit('data', Buffer.from('Chunk 2\n'));
      mockProcess.stdout.emit('data', Buffer.from('Chunk 3'));

      // Simulate process completion
      mockProcess.emit('close', 0);

      const result = await promise;

      expect(result.output).toBe('Chunk 1\nChunk 2\nChunk 3');
    });

    it('should split command with multiple arguments', async () => {
      registerWpCliHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'run-wp-cli')?.[1];

      const site = { name: 'example.test' };
      const command = 'plugin install akismet --activate';

      // Start the promise
      const promise = handler?.(mockEvent, { site, command });

      // Simulate process completion
      mockProcess.emit('close', 0);

      await promise;

      expect(child_process.spawn).toHaveBeenCalledWith('docker', [
        'exec',
        '-w',
        '/src/www/example.test',
        'devwp_frankenphp',
        'php',
        '-d',
        'error_reporting="E_ALL & ~E_DEPRECATED & ~E_WARNING"',
        '/usr/local/bin/wp',
        'plugin',
        'install',
        'akismet',
        '--activate',
      ]);
    });

    it('should handle both stdout and stderr output', async () => {
      registerWpCliHandlers();

      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === 'run-wp-cli')?.[1];

      const site = { name: 'example.test' };
      const command = 'plugin update all';

      // Start the promise
      const promise = handler?.(mockEvent, { site, command });

      // Simulate both outputs
      mockProcess.stdout.emit('data', Buffer.from('Updating plugins...'));
      mockProcess.stderr.emit('data', Buffer.from('Warning: Some deprecated'));

      // Simulate process completion
      mockProcess.emit('close', 0);

      const result = await promise;

      expect(result).toEqual({
        success: true,
        output: 'Updating plugins...',
        error: 'Warning: Some deprecated',
      });
    });
  });
});
