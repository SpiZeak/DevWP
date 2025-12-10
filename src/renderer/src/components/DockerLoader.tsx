import { type JSX, useEffect, useState } from 'react';
import dockerLogo from '../assets/docker.svg';
import Spinner from './ui/Spinner';

function DockerLoader(): JSX.Element | null {
  const [dockerStatus, setDockerStatus] = useState({
    status: 'idle',
    message: '',
  });

  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const removeListener = window.electronAPI.onDockerStatus((status) => {
      setDockerStatus(status);

      if (status.status === 'complete') {
        // Hide loader after a brief delay to show completion
        setTimeout(() => setIsVisible(false), 1000);
      }
    });

    return removeListener;
  }, []);

  if (!isVisible) return null;

  return (
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-warm-charcoal/90">
      <div className="bg-warm-charcoal-400 shadow-xl p-8 rounded-lg w-[90%] max-w-lg text-seasalt-200 text-center">
        <img
          src={dockerLogo}
          alt="Docker Logo"
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
            There was an error starting Docker. Check the logs for details.
          </div>
        )}
      </div>
    </div>
  );
}

export default DockerLoader;
