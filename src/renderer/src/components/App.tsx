import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { type JSX, lazy, useState } from 'react';
import Notifications from './Notifications';
import Services from './Services';
import SiteList from './SiteList';
import Versions from './Versions';

// Lazy load the settings modal
const SettingsModal = lazy(() => import('./Settings/SettingsModal'));

function App(): JSX.Element {
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isVersionsOpen, setIsVersionsOpen] = useState<boolean>(false);

  const handleOpenSettings = (): void => {
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = (): void => {
    setIsSettingsOpen(false);
  };

  const handleOpenVersions = (): void => {
    setIsVersionsOpen(true);
  };

  const handleCloseVersions = (): void => {
    setIsVersionsOpen(false);
  };

  return (
    <>
      <div className="grid grid-cols-[40%_60%] p-6 w-full">
        <Services
          onOpenSettings={handleOpenSettings}
          onOpenVersions={handleOpenVersions}
        />
        <SiteList />
      </div>
      <Versions isOpen={isVersionsOpen} onClose={handleCloseVersions} />
      <Notifications />
      <SettingsModal isOpen={isSettingsOpen} onClose={handleCloseSettings} />
      <footer className="mt-auto p-6 text-seasalt text-sm text-center">
        <h6 className="inline-block opacity-25 hover:opacity-100 m-0 font-medium transition-opacity">
          Crafted by{' '}
          <a
            href="https://github.com/SpiZeak"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1 hover:text-pumpkin transition-colors"
            onClick={(e) => openUrl(e.currentTarget.href)}
          >
            SpiZeak
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
              ↗
            </span>
          </a>
        </h6>
      </footer>
    </>
  );
}

export default App;
