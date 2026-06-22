/// <reference types="vite/client" />

export interface Site {
  name: string;
  path: string;
  url: string;
  status:
    | 'active'
    | 'provisioning'
    | 'building'
    | 'exited'
    | 'stopped'
    | 'pending';
  aliases?: string;
  webRoot?: string;
  multisite?: {
    enabled: boolean;
    type: 'subdomain' | 'subdirectory';
  };
}
