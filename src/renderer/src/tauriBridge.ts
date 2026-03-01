import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

type UnlistenFn = () => void;

async function onEvent<T>(
  event: string,
  callback: (payload: T) => void,
): Promise<UnlistenFn> {
  return listen<T>(event, (eventData) => callback(eventData.payload));
}

function createListener<T>(
  event: string,
  callback: (payload: T) => void,
): UnlistenFn {
  let disposed = false;
  let unlisten: UnlistenFn | undefined;

  const pending = onEvent<T>(event, callback).then((fn) => {
    if (disposed) {
      fn();
      return;
    }

    unlisten = fn;
  });

  return () => {
    disposed = true;

    if (unlisten) {
      unlisten();
      return;
    }

    pending.catch(() => undefined);
  };
}

const channelToCommand: Record<string, string> = {
  'open-directory': 'open_directory',
  'run-wp-cli': 'run_wp_cli',
};

function invokeChannel<T = unknown>(
  channel: string,
  ...args: unknown[]
): Promise<T> {
  const command = channelToCommand[channel] ?? channel.replaceAll('-', '_');

  switch (command) {
    case 'open_directory':
      return invoke<T>(command, { path: args[0] });
    case 'run_wp_cli':
      return invoke<T>(command, { request: args[0] });
    default:
      return invoke<T>(command, { payload: args });
  }
}

export function initializeTauriBridge(): void {
  const electronAPI = {
    getSites: () => invoke('get_sites'),
    getContainerStatus: () => invoke('get_container_status'),
    getXdebugStatus: () => invoke<boolean>('get_xdebug_status'),
    toggleXdebug: () => invoke<boolean>('toggle_xdebug'),
    onXdebugStatus: (
      callback: (data: {
        status: 'restarting' | 'complete' | 'error';
        enabled?: boolean;
        message?: string;
      }) => void,
    ) => createListener('xdebug-status', callback),
    onWpCliStream: (
      callback: (data: {
        type: 'stdout' | 'stderr' | 'complete' | 'error';
        data?: string;
        error?: string;
        siteId?: string;
      }) => void,
    ) => createListener('wp-cli-stream', callback),
    onNotification: (
      callback: (data: { type: 'success' | 'error'; message: string }) => void,
    ) => createListener('notification', callback),
    getSettings: () => invoke<Record<string, string>>('get_settings'),
    getSetting: (key: string) => invoke<string | null>('get_setting', { key }),
    saveSetting: (key: string, value: string) =>
      invoke<{ success: boolean; error?: string }>('save_setting', {
        key,
        value,
      }),
    deleteSetting: (key: string) =>
      invoke<{ success: boolean; error?: string }>('delete_setting', { key }),
    getWebrootPath: () => invoke<string>('get_webroot_path'),
    getXdebugEnabledSetting: () =>
      invoke<boolean>('get_xdebug_enabled_setting'),
    pickDirectory: (defaultPath?: string) =>
      invoke<string | null>('pick_directory', { defaultPath }),
    installUpdateNow: () =>
      invoke<{ success: boolean; message: string }>('install_update_now'),
  };

  Object.assign(window, {
    electronAPI,
    api: {},
    electron: {
      ipcRenderer: {
        invoke: invokeChannel,
      },
    },
    dockerControl: {
      startService: (serviceName: string) =>
        invoke('start_service', { serviceName }),
      stopService: (serviceName: string) =>
        invoke('stop_service', { serviceName }),
      getStatus: (serviceName?: string) =>
        invoke('get_status', { serviceName }),
      getSites: () => invoke('get_sites'),
    },
  });
}
