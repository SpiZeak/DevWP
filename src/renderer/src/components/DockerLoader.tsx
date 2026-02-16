import { type JSX, useEffect, useState } from 'react';
import { siDocker } from 'simple-icons';
import { BrandLogo } from './BrandLogo';
import Spinner from './ui/Spinner';

function DockerLoader(): JSX.Element | null {
  const [dockerStatus, setDockerStatus] = useState({
    status: 'idle',
    message: '',
  });

  const [isVisible, setIsVisible] = useState(true);
  const [logDir, setLogDir] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.electronAPI
      .getLogDir()
      .then((dir) => setLogDir(dir))
      .catch(() => setLogDir(''));

    const removeListener = window.electronAPI.onDockerStatus((status) => {
      setDockerStatus(status);

      if (status.status === 'complete') {
        // Hide loader after a brief delay to show completion
        setTimeout(() => setIsVisible(false), 1000);
      }
    });

    return removeListener;
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timeout);
  }, [copied]);

  if (!isVisible) return null;

  return (
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-warm-charcoal/90">
      <div className="bg-warm-charcoal-400 shadow-xl p-8 rounded-lg w-[90%] max-w-lg text-seasalt-200 text-center">
        <BrandLogo
          icon={siDocker}
          className="left-1.5 relative mx-auto my-10 w-20 h-20"
        />
        {dockerStatus.status !== 'error' && (
          <Spinner className="mb-4" svgClass="size-10" />
        )}
        <h3>Starting Docker Environment</h3>
        <p className="mt-4 h-15 overflow-y-auto text-seasalt text-sm">
          {dockerStatus.message}
        </p>
        {dockerStatus.status === 'error' && (
          <div className="mt-4 text-crimson-400">
            <div>
              There was an error starting Docker. Check the logs for details.
            </div>
            {logDir && (
              <div className="mt-2 text-seasalt-200">
                <div className="text-sm">Logs:</div>
                <div className="flex justify-center items-center gap-2 mt-1">
                  <code className="bg-warm-charcoal-500 px-2 py-1 rounded text-xs break-all">
                    {logDir}
                  </code>
                  <button
                    type="button"
                    className="bg-warm-charcoal-500 hover:bg-warm-charcoal-600 px-3 py-1 rounded text-xs"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(logDir)
                        .then(() => setCopied(true))
                        .catch(() => setCopied(false));
                    }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DockerLoader;
