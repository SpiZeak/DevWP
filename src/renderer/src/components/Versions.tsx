import type { KeyboardEvent, MouseEvent } from 'react';
import { type JSX, useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    let isMounted = true;

    const fetchVersion = async (): Promise<void> => {
      try {
        const version = await window.electronAPI.getAppVersion();
        if (isMounted) {
          setAppVersion(version);
          setVersionError(false);
        }
      } catch (error) {
        console.error('Failed to load DevWP version:', error);
        if (isMounted) {
          setVersionError(true);
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
        className="bg-gunmetal-400 shadow-lg mx-4 p-6 rounded-lg w-full max-w-md"
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
            <span className="text-seasalt-400 text-xs uppercase tracking-wide">
              DevWP
            </span>
            <span className="font-semibold text-seasalt text-sm">
              {devwpVersionLabel}
            </span>
          </li>
          <li className="flex justify-between items-center">
            <span className="text-seasalt-400 text-xs uppercase tracking-wide">
              Electron
            </span>
            <span className="font-semibold text-seasalt text-sm">
              {electronVersionLabel}
            </span>
          </li>
          <li className="flex justify-between items-center">
            <span className="text-seasalt-400 text-xs uppercase tracking-wide">
              Chromium
            </span>
            <span className="font-semibold text-seasalt text-sm">
              {chromiumVersionLabel}
            </span>
          </li>
          <li className="flex justify-between items-center">
            <span className="text-seasalt-400 text-xs uppercase tracking-wide">
              Node
            </span>
            <span className="font-semibold text-seasalt text-sm">
              {nodeVersionLabel}
            </span>
          </li>
          <li className="flex justify-between items-center">
            <span className="text-seasalt-400 text-xs uppercase tracking-wide">
              Developer
            </span>
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
      </div>
    </div>
  );
}

export default Versions;
