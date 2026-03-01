import { getTauriVersion, getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import type { KeyboardEvent, MouseEvent } from 'react';
import { type JSX, useEffect, useState } from 'react';
import { siAboutdotme, siTauri, siWordpress } from 'simple-icons';
import { BrandLogo } from './BrandLogo';
import Icon from './ui/Icon';

interface VersionsProps {
  isOpen: boolean;
  onClose: () => void;
}

function Versions({ isOpen, onClose }: VersionsProps): JSX.Element | null {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [tauriVersion, setTauriVersion] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState<boolean>(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState<boolean>(false);
  const [updateActionMessage, setUpdateActionMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;

    const fetchVersion = async (): Promise<void> => {
      try {
        const version = await getVersion();
        const tauriVer = await getTauriVersion();
        const isUpdateReady = await invoke<boolean>('get_update_ready');

        if (isMounted) {
          setAppVersion(version);
          setTauriVersion(tauriVer);
          setUpdateReady(isUpdateReady);
        }
      } catch (error) {
        console.error('Failed to load DevWP version:', error);
        if (isMounted) {
          setUpdateReady(false);
        }
      }
    };

    if (isOpen) {
      fetchVersion().catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const devwpVersionLabel = appVersion ? `v${appVersion}` : 'Loading...';
  const tauriVersionLabel = tauriVersion ? `v${tauriVersion}` : 'Loading...';

  const handleOverlayClick = (): void => {
    onClose();
  };

  const handleOverlayKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  const handleContentClick = (event: MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
  };

  const handleInstallUpdate = async (): Promise<void> => {
    setIsInstallingUpdate(true);
    setUpdateActionMessage(null);

    try {
      const result = await invoke<{ success: boolean; message: string }>(
        'install_update_now',
      );
      setUpdateActionMessage(result.message);
      if (result.success) {
        setUpdateReady(false);
      }
    } catch (error) {
      console.error('Failed to install update:', error);
      setUpdateActionMessage('Failed to start update installation.');
    } finally {
      setIsInstallingUpdate(false);
    }
  };

  return (
    <div
      className="z-40 fixed inset-0 flex justify-center items-center bg-black bg-opacity-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="versions-modal-title"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
    >
      <div
        className="bg-gunmetal-400 shadow-2xl mx-4 p-6 rounded-lg w-full max-w-md"
        onClick={handleContentClick}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
          event.stopPropagation();
        }}
        role="document"
      >
        <div className="flex justify-between items-center mb-6">
          <h2
            id="versions-modal-title"
            className="font-semibold text-seasalt text-xl"
          >
            About DevWP
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close About modal"
            className="flex justify-center items-center bg-gunmetal-500 hover:bg-gunmetal-600 rounded-full size-8 text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer"
            title="Close About modal"
          >
            <Icon content="✕" className="text-lg" />
          </button>
        </div>
        <ul className="space-y-4">
          <li className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <BrandLogo icon={siWordpress} />
              <span className="text-seasalt-400 text-xs uppercase tracking-wide">
                DevWP
              </span>
            </div>
            <span className="font-semibold text-seasalt text-sm">
              {devwpVersionLabel}
            </span>
          </li>
          <li className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <BrandLogo icon={siTauri} />
              <span className="text-seasalt-400 text-xs uppercase tracking-wide">
                Tauri
              </span>
            </div>
            <span className="font-semibold text-seasalt text-sm">
              {tauriVersionLabel}
            </span>
          </li>
          <li className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <BrandLogo icon={siAboutdotme} />
              <span className="text-seasalt-400 text-xs uppercase tracking-wide">
                Developer
              </span>
            </div>
            <a
              href="https://trewhitt.au"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-pumpkin text-sm hover:underline no-underline"
            >
              Trewhitt
            </a>
          </li>
        </ul>

        {updateReady && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => {
                handleInstallUpdate().catch(() => {});
              }}
              disabled={isInstallingUpdate}
              className="bg-pumpkin hover:bg-pumpkin/90 disabled:opacity-60 px-4 py-2 rounded-md font-semibold text-gunmetal-500 text-sm transition-colors"
            >
              {isInstallingUpdate ? 'Installing update…' : 'Install update now'}
            </button>
          </div>
        )}

        {updateActionMessage && (
          <p className="mt-3 text-seasalt-400 text-xs">{updateActionMessage}</p>
        )}
      </div>
    </div>
  );
}

export default Versions;
