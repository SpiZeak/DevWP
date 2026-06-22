import { openUrl } from '@tauri-apps/plugin-opener';
import { type JSX, lazy, Suspense, useState } from 'react';
import Notifications from './Notifications';
import Services from './Services';
import SiteList from './SiteList';
import Spinner from './ui/Spinner';

// Lazy load the modals
const SettingsModal = lazy(() => import('./Settings/SettingsModal'));
const Versions = lazy(() => import('./Versions'));

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
      <h1 className="sr-only">DevWP</h1>
      <div className="grid grid-cols-[40%_60%] p-6 w-full">
        <Services
          onOpenSettings={handleOpenSettings}
          onOpenVersions={handleOpenVersions}
        />
        <SiteList />
      </div>
      <Suspense
        fallback={
          <div className="z-50 fixed inset-0 flex justify-center items-center bg-warm-charcoal/70">
            <Spinner svgClass="size-8 text-pumpkin" />
          </div>
        }
      >
        <Versions isOpen={isVersionsOpen} onClose={handleCloseVersions} />
      </Suspense>
      <Notifications />
      <Suspense
        fallback={
          <div className="z-50 fixed inset-0 flex justify-center items-center bg-warm-charcoal/70">
            <Spinner svgClass="size-8 text-pumpkin" />
          </div>
        }
      >
        <SettingsModal isOpen={isSettingsOpen} onClose={handleCloseSettings} />
      </Suspense>
      <footer className="mt-auto p-6 text-seasalt text-sm text-center">
        <p className="inline-block opacity-25 hover:opacity-100 m-0 font-medium transition-opacity">
          Crafted by{' '}
          <a
            href="https://github.com/SpiZeak"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1 hover:text-pumpkin transition-colors"
            onClick={(e) => {
              e.preventDefault();
              openUrl(e.currentTarget.href);
            }}
          >
            SpiZeak
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
              ↗
            </span>
          </a>
        </p>
      </footer>
    </>
  );
}

export default App;
