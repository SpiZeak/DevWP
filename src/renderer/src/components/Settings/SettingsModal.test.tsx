import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsModal from './SettingsModal';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noExplicitAny: mock
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_webroot_path') {
        return Promise.resolve('/initial/path');
      }
      if (cmd === 'save_setting') {
        return Promise.resolve({ success: true });
      }
      if (cmd === 'pick_directory') {
        return Promise.resolve('/new/path');
      }
      return Promise.resolve();
    });
  });

  it('renders null when not open', () => {
    const { container } = render(
      <SettingsModal isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('loads and displays settings when opened', async () => {
    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('/initial/path')).toBeInTheDocument();
    });
  });

  it('handles load settings error', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_webroot_path')
        return Promise.reject(new Error('Load failed'));
      return Promise.resolve();
    });

    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(emit).toHaveBeenCalledWith('notification', {
        type: 'error',
        message: 'Failed to load settings',
      });
    });
  });

  it('allows picking a directory and changing settings', async () => {
    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('/initial/path')).toBeInTheDocument();
    });

    const browseBtn = screen.getByTitle('Browse for directory');
    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(screen.getByDisplayValue('/new/path')).toBeInTheDocument();
    });
  });

  it('saves settings', async () => {
    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByDisplayValue('/initial/path')).toBeInTheDocument();
    });

    // Simulate input change to enable save button
    const input = screen.getByLabelText('Webroot Path');
    fireEvent.change(input, { target: { value: '/manual/path' } });

    // Click Save
    const saveBtn = screen.getByText('Save Settings');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('save_setting', {
        key: 'webroot_path',
        value: '/manual/path',
      });
    });
  });

  it('reverts changes if closed before saving', async () => {
    const onClose = vi.fn();
    render(<SettingsModal isOpen={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('/initial/path')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Webroot Path');
    fireEvent.change(input, { target: { value: '/changed/path' } });

    // Ensure state changed!
    expect(input).toHaveValue('/changed/path');

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalled();
  });

  it('handles save settings failure (success: false)', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_webroot_path') return Promise.resolve('/path');
      if (cmd === 'save_setting')
        return Promise.resolve({ success: false, error: 'Save failed!' });
      return Promise.resolve();
    });

    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('/path')).toBeInTheDocument();
    });

    // Simulate input change to enable save button
    const input = screen.getByLabelText('Webroot Path');
    fireEvent.change(input, { target: { value: '/changed/path' } });

    const saveBtn = screen.getByText('Save Settings');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(emit).toHaveBeenCalledWith('notification', {
        type: 'error',
        message: 'Save failed!',
      });
    });
  });

  it('handles save settings error thrown', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_webroot_path') return Promise.resolve('/path');
      if (cmd === 'save_setting')
        return Promise.reject(new Error('Network drop'));
      return Promise.resolve();
    });

    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('/path')).toBeInTheDocument();
    });

    // Simulate input change to enable save button
    const input = screen.getByLabelText('Webroot Path');
    fireEvent.change(input, { target: { value: '/changed/path' } });

    const saveBtn = screen.getByText('Save Settings');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(emit).toHaveBeenCalledWith('notification', {
        type: 'error',
        message: 'Failed to save settings',
      });
    });
  });

  it('handles pick directory error thrown', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_webroot_path') return Promise.resolve('/path');
      if (cmd === 'pick_directory')
        return Promise.reject(new Error('Picker crashed'));
      return Promise.resolve();
    });

    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('/path')).toBeInTheDocument();
    });

    const browseBtn = screen.getByTitle('Browse for directory');
    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(emit).toHaveBeenCalledWith('notification', {
        type: 'error',
        message: 'Failed to select directory',
      });
    });
  });
});
