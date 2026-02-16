import type { KeyboardEvent, MouseEvent } from 'react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import {
  siAboutdotme,
  siElectron,
  siGooglechrome,
  siNodedotjs,
  siWordpress,
} from 'simple-icons';
import { BrandLogo } from './BrandLogo';
import Icon from './ui/Icon';

interface VersionsProps {
  isOpen: boolean;
  onClose: () => void;
}

function Versions({ isOpen, onClose }: VersionsProps): JSX.Element | null {
  const systemVersions = useMemo(
    () =>
      window.electron?.process?.versions ??
      ({} as Partial<NodeJS.ProcessVersions>),
    [],
  );
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<boolean>(false);
  const [updateReady, setUpdateReady] = useState<boolean>(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState<boolean>(false);
  const [updateActionMessage, setUpdateActionMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;

    const fetchVersion = async (): Promise<void> => {
      try {
        const version = await window.electronAPI.getAppVersion();
        const isUpdateReady = await window.electronAPI.getUpdateReady();
        if (isMounted) {
          setAppVersion(version);
          setUpdateReady(isUpdateReady);
          setVersionError(false);
        }
      } catch (error) {
        console.error('Failed to load DevWP version:', error);
        if (isMounted) {
          setVersionError(true);
          setUpdateReady(false);
        }
      }
    };

    if (isOpen) {
      setVersionError(false);
      fetchVersion().catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const devwpVersionLabel = versionError
    ? 'Unavailable'
    : appVersion
      ? `v${appVersion}`
      : 'Loading...';

  const electronVersionLabel = systemVersions.electron
    ? `v${systemVersions.electron}`
    : 'Unavailable';
  const chromiumVersionLabel = systemVersions.chrome
    ? `v${systemVersions.chrome}`
    : 'Unavailable';
  const nodeVersionLabel = systemVersions.node
    ? `v${systemVersions.node}`
    : 'Unavailable';

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
      const result = await window.electronAPI.installUpdateNow();
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
            className="flex justify-center items-center bg-gunmetal-500 hover:bg-gunmetal-600 rounded-full size-8 text-seasalt-400 hover:text-seasalt transition-colors"
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
              <BrandLogo icon={siElectron} />
              <span className="text-seasalt-400 text-xs uppercase tracking-wide">
                Electron
              </span>
            </div>
            <span className="font-semibold text-seasalt text-sm">
              {electronVersionLabel}
            </span>
          </li>
          <li className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <BrandLogo icon={siGooglechrome} />
              <span className="text-seasalt-400 text-xs uppercase tracking-wide">
                Chromium
              </span>
            </div>
            <span className="font-semibold text-seasalt text-sm">
              {chromiumVersionLabel}
            </span>
          </li>
          <li className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <BrandLogo icon={siNodedotjs} />
              <span className="text-seasalt-400 text-xs uppercase tracking-wide">
                Node
              </span>
            </div>
            <span className="font-semibold text-seasalt text-sm">
              {nodeVersionLabel}
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
