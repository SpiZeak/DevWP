/// <reference types="vite/client" />

export interface Site {
  name: string;
  path: string;
  url: string;
  status: string;
  aliases?: string;
  webRoot?: string;
  multisite?: {
    enabled: boolean;
    type: 'subdomain' | 'subdirectory';
  };
  createdAt?: Date;
  updatedAt?: Date;
}

type DockerStatus = 'starting' | 'progress' | 'complete' | 'error';

type RemoveListener = () => void;

type ElectronIpcRendererLike = {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
};

declare global {
  interface Window {
    electron: {
      ipcRenderer: ElectronIpcRendererLike;
      process?: {
        versions?: NodeJS.ProcessVersions;
      };
    };
    dockerControl: {
      startService: (serviceName: string) => void;
      stopService: (serviceName: string) => void;
      getStatus: (serviceName?: string) => void;
      getSites: () => Promise<Site[]>;
    };
    electronAPI: {
      getLogDir: () => Promise<string>;
      getXdebugStatus: () => Promise<boolean>;
      toggleXdebug: () => Promise<boolean>;
      onXdebugStatus: (
        callback: (data: {
          status: 'restarting' | 'complete' | 'error';
          enabled?: boolean;
          message?: string;
        }) => void,
      ) => RemoveListener;
      deleteSite: (siteName: Site) => Promise<void>;
      updateSite: (
        site: Site,
        data: { aliases?: string; webRoot?: string },
      ) => Promise<void>;
      createSite: (site: {
        domain: string;
        webRoot?: string;
        aliases?: string;
        multisite: {
          enabled: boolean;
          type: 'subdomain' | 'subdirectory';
        };
      }) => Promise<void>;
      getContainerStatus: () => Promise<void>;
      restartContainer: (containerId: string) => Promise<void>;
      getSites: () => Promise<Site[]>;
      onWpCliStream: (
        callback: (data: {
          type: 'stdout' | 'stderr' | 'complete' | 'error';
          data?: string;
          error?: string;
          siteId?: string;
        }) => void,
      ) => RemoveListener;
      onNotification: (
        callback: (data: {
          type: 'success' | 'error';
          message: string;
        }) => void,
      ) => RemoveListener;
      getSettings: () => Promise<Record<string, string>>;
      getSetting: (key: string) => Promise<string | null>;
      saveSetting: (
        key: string,
        value: string,
      ) => Promise<{ success: boolean; error?: string }>;
      deleteSetting: (
        key: string,
      ) => Promise<{ success: boolean; error?: string }>;
      getWebrootPath: () => Promise<string>;
      getXdebugEnabledSetting: () => Promise<boolean>;
      pickDirectory: (defaultPath?: string) => Promise<string | null>;
      getAppVersion: () => Promise<string>;
      getUpdateReady: () => Promise<boolean>;
      installUpdateNow: () => Promise<{ success: boolean; message: string }>;
    };
  }

  interface Container {
    id: string;
    name: string;
    state: string;
    version?: string;
  }
}
