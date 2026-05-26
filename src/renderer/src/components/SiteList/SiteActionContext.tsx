import type { Site } from '@renderer/env';
import { createContext, useContext } from 'react';

export interface SiteActionContextValue {
  onOpenUrl: (url: string) => void;
  onScan: (site: Site) => void;
  onComposerUpdate: (site: Site) => void;
  onOpenWpCli: (site: Site) => void;
  onEditSite: (site: Site) => void;
  onSelectSite: (site: Site) => void;
  scanningSite: string | null;
}

const SiteActionContext = createContext<SiteActionContextValue | null>(null);

export function useSiteActions(): SiteActionContextValue {
  const ctx = useContext(SiteActionContext);
  if (!ctx) {
    throw new Error(
      'useSiteActions must be used within a SiteActionProvider',
    );
  }
  return ctx;
}

export const SiteActionProvider = SiteActionContext.Provider;
