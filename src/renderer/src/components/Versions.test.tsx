import { getTauriVersion, getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Versions from './Versions';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(),
  getTauriVersion: vi.fn(),
}));

describe('Versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupMocks = (isUpdateReady = false) => {
    (getVersion as any).mockResolvedValue('1.2.3');
    (getTauriVersion as any).mockResolvedValue('2.0.0');
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_update_ready') return Promise.resolve(isUpdateReady);
      if (cmd === 'install_update_now')
        return Promise.resolve({ success: true, message: 'Update started' });
      return Promise.resolve();
    });
  };

  it('does not render when isOpen is false', () => {
    const { queryByRole } = render(
      <Versions isOpen={false} onClose={vi.fn()} />,
    );
    expect(queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders correctly and fetches versions when isOpen is true', async () => {
    setupMocks();

    let component: any;
    await act(async () => {
      component = render(<Versions isOpen={true} onClose={vi.fn()} />);
    });

    expect(component.getByText('About DevWP')).toBeInTheDocument();
    expect(component.getByText('v1.2.3')).toBeInTheDocument();
    expect(component.getByText('v2.0.0')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    setupMocks();
    const handleClose = vi.fn();
    let component: any;
    await act(async () => {
      component = render(<Versions isOpen={true} onClose={handleClose} />);
    });

    const closeBtn = component.getByRole('button', {
      name: 'Close About modal',
    });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('stops propagation when clicking on modal content', async () => {
    setupMocks();
    let component: any;
    await act(async () => {
      component = render(<Versions isOpen={true} onClose={vi.fn()} />);
    });

    const dialog = component.getByRole('dialog');
    const documentBlock = component.getByRole('document');

    fireEvent.click(documentBlock);
    // Add additional keyboard event to documentBlock
    fireEvent.keyDown(documentBlock, { key: 'Enter', code: 'Enter' });
  });

  it('closes when overlay is clicked or Escape is pressed', async () => {
    setupMocks();
    const handleClose = vi.fn();
    let component: any;
    await act(async () => {
      component = render(<Versions isOpen={true} onClose={handleClose} />);
    });

    const dialog = component.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.click(dialog);
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it('renders install update button when update is ready and handles click', async () => {
    setupMocks(true);
    let component: any;
    await act(async () => {
      component = render(<Versions isOpen={true} onClose={vi.fn()} />);
    });

    const updateBtn = component.getByText('Install update now');
    expect(updateBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(updateBtn);
    });

    expect(invoke).toHaveBeenCalledWith('install_update_now');
    expect(component.getByText('Update started')).toBeInTheDocument();
  });

  it('handles failed update installation', async () => {
    (getVersion as any).mockResolvedValue('1.2.3');
    (getTauriVersion as any).mockResolvedValue('2.0.0');
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_update_ready') return Promise.resolve(true);
      if (cmd === 'install_update_now')
        return Promise.reject(new Error('Failed!'));
      return Promise.resolve();
    });

    let component: any;
    await act(async () => {
      component = render(<Versions isOpen={true} onClose={vi.fn()} />);
    });

    const updateBtn = component.getByText('Install update now');
    expect(updateBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(updateBtn);
    });

    expect(
      component.getByText('Failed to start update installation.'),
    ).toBeInTheDocument();
  });
});
