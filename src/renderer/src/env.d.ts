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

declare global {
  interface Container {
    id: string;
    name: string;
    state: string;
    version?: string;
  }
}
