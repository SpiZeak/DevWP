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
}
