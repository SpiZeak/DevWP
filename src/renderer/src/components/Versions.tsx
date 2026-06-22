import { getTauriVersion, getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { type JSX, useEffect, useState } from 'react';
import { siAboutdotme, siTauri, siWordpress } from 'simple-icons';
import { BrandLogo } from './BrandLogo';
import ModalBase from './ui/ModalBase';

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
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="About DevWP"
      maxWidthClass="max-w-md"
      overlayClass="bg-black bg-opacity-50"
    >
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
    </ModalBase>
  );
}

export default Versions;
