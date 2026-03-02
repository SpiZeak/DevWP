import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./Notifications', () => ({
  default: () => <div data-testid="notifications" />,
}));
vi.mock('./Services', () => ({
  default: ({ onOpenSettings, onOpenVersions }: any) => (
    <div>
      <button type="button" onClick={onOpenSettings}>
        Open Settings
      </button>
      <button type="button" onClick={onOpenVersions}>
        Open Versions
      </button>
    </div>
  ),
}));
vi.mock('./SiteList', () => ({
  default: () => <div data-testid="sitelist" />,
}));
vi.mock('./Versions', () => ({
  default: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="versions-modal">
        <button type="button" onClick={onClose}>
          Close Versions
        </button>
      </div>
    ) : null,
}));

// Mock lazy component
vi.mock('./Settings/SettingsModal', () => ({
  default: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="settings-modal">
        <button type="button" onClick={onClose}>
          Close Settings
        </button>
      </div>
    ) : null,
}));

describe('App', () => {
  const renderApp = async () => {
    let component: any;
    await act(async () => {
      component = render(
        <Suspense fallback={<div>Loading...</div>}>
          <App />
        </Suspense>,
      );
    });

    await waitFor(() => {
      expect(component.queryByText('Loading...')).not.toBeInTheDocument();
    });
    return component;
  };

  it('renders all core components', async () => {
    const component = await renderApp();

    expect(component.getByTestId('docker-loader')).toBeInTheDocument();
    expect(component.getByTestId('notifications')).toBeInTheDocument();
    expect(component.getByTestId('sitelist')).toBeInTheDocument();
    expect(component.queryByTestId('versions-modal')).not.toBeInTheDocument();
    expect(component.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });

  it('opens and closes versions modal', async () => {
    const component = await renderApp();

    await act(async () => {
      fireEvent.click(component.getByText('Open Versions'));
    });
    expect(component.getByTestId('versions-modal')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(component.getByText('Close Versions'));
    });
    expect(component.queryByTestId('versions-modal')).not.toBeInTheDocument();
  });

  it('opens and closes settings modal', async () => {
    const component = await renderApp();

    await act(async () => {
      fireEvent.click(component.getByText('Open Settings'));
    });
    expect(component.getByTestId('settings-modal')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(component.getByText('Close Settings'));
    });
    expect(component.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });
});
