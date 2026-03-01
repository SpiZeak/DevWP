import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Services from './Services';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('./XdebugSwitch', () => ({
  default: () => <div data-testid="xdebug-switch">XdebugSwitch</div>,
}));

describe('Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    (listen as any).mockResolvedValue(vi.fn());

    let component: any;
    await act(async () => {
      component = render(
        <Services onOpenSettings={vi.fn()} onOpenVersions={vi.fn()} />,
      );
    });

    expect(component.getByText('Loading services...')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('get_container_status');
  });

  it('renders containers once loaded', async () => {
    let listenerCallback: any;
    (listen as any).mockImplementation((event: string, callback: any) => {
      listenerCallback = callback;
      return Promise.resolve(vi.fn());
    });

    let component: any;
    await act(async () => {
      component = render(
        <Services onOpenSettings={vi.fn()} onOpenVersions={vi.fn()} />,
      );
    });

    await act(async () => {
      listenerCallback({
        payload: [
          { id: '1', name: 'devwp_nginx', state: 'running', version: '1.2' },
          { id: '2', name: 'devwp_php', state: 'stopped', version: '8.1' },
          { id: '3', name: 'devwp_seonaut', state: 'running' }, // should be excluded
        ],
      });
    });

    expect(
      component.queryByText('Loading services...'),
    ).not.toBeInTheDocument();
    expect(component.getByText('Nginx')).toBeInTheDocument();
    expect(component.getByText('1.2')).toBeInTheDocument();
    expect(component.getByText('PHP')).toBeInTheDocument();
    expect(component.queryByText('devwp_seonaut')).not.toBeInTheDocument();
  });

  it('restarts container when clicked', async () => {
    vi.useFakeTimers();
    let listenerCallback: any;
    (listen as any).mockImplementation((event: string, callback: any) => {
      listenerCallback = callback;
      return Promise.resolve(vi.fn());
    });

    let component: any;
    await act(async () => {
      component = render(
        <Services onOpenSettings={vi.fn()} onOpenVersions={vi.fn()} />,
      );
    });

    await act(async () => {
      listenerCallback({
        payload: [
          { id: '1', name: 'devwp_nginx', state: 'running', version: '1.2' },
        ],
      });
    });

    const restartBtn = component.getByTitle('Restart service');

    await act(async () => {
      fireEvent.click(restartBtn);
    });

    expect(invoke).toHaveBeenCalledWith('restart_container', {
      containerId: '1',
    });
    expect(restartBtn).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(restartBtn).not.toBeDisabled();
    vi.useRealTimers();
  });

  it('calls onOpenSettings and onOpenVersions when buttons clicked', async () => {
    (listen as any).mockResolvedValue(vi.fn());
    const onOpenSettings = vi.fn();
    const onOpenVersions = vi.fn();

    let component: any;
    await act(async () => {
      component = render(
        <Services
          onOpenSettings={onOpenSettings}
          onOpenVersions={onOpenVersions}
        />,
      );
    });

    await act(async () => {
      fireEvent.click(component.getByTitle('Settings'));
    });
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(component.getByTitle('About DevWP'));
    });
    expect(onOpenVersions).toHaveBeenCalledTimes(1);
  });
});
