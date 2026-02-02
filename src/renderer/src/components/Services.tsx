import type React from 'react';
import { useEffect, useState } from 'react';
import frankenphpIcon from '../assets/icons/frankenphp.svg';
import mailpitIcon from '../assets/icons/mailpit.svg';
import mariaDBIcon from '../assets/icons/mariadb.svg';
import redisIcon from '../assets/icons/redis.svg';
import sonarCubeIcon from '../assets/icons/sonarqube.svg';
import Icon from './ui/Icon';
import Spinner from './ui/Spinner';
import XdebugSwitch from './XdebugSwitch';

interface ServicesProps {
  onOpenSettings: () => void;
  onOpenVersions: () => void;
}

interface Container {
  id: string;
  name: string;
  state: string;
  version?: string | undefined;
}

// Container name mapping for user-friendly display
const containerNameMapping: Record<string, string> = {
  devwp_frankenphp: 'FrankenPHP',
  devwp_mariadb: 'MariaDB',
  devwp_redis: 'Redis',
  devwp_mailpit: 'Mailpit',
  devwp_sonarqube: 'SonarQube',
};

const containerIconMapping: Record<string, React.ReactNode> = {
  devwp_frankenphp: (
    <img className="w-10 h-8 object-contain" src={frankenphpIcon} alt="FrankenPHP" />
  ),
  devwp_mariadb: (
    <img className="w-10 h-8 object-contain" src={mariaDBIcon} alt="MariaDB" />
  ),
  devwp_redis: (
    <img className="w-10 h-8 object-contain" src={redisIcon} alt="Redis" />
  ),
  devwp_mailpit: (
    <img className="w-10 h-8 object-contain" src={mailpitIcon} alt="Mailpit" />
  ),
  devwp_sonarqube: (
    <img
      className="w-10 h-8 object-contain"
      src={sonarCubeIcon}
      alt="SonarQube"
    />
  ),
};

const Services: React.FC<ServicesProps> = ({
  onOpenSettings,
  onOpenVersions,
}) => {
  const [containers, setContainers] = useState([] as Container[]);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState({});
  const excludedContainers = ['devwp_seonaut', 'devwp_sonarqube-scanner'];
  const containerMap = containers.filter(
    (container) =>
      container.name.includes('devwp_') &&
      !excludedContainers.includes(container.name),
  );

  useEffect(() => {
    // Set up a listener for container status updates
    const removeListener = window.electronAPI.onContainerStatus(
      (containers) => {
        setContainers(containers);
        setLoading(false);
      },
    );

    // Request initial container status
    window.electronAPI.getContainerStatus();

    // Clean up listener when component unmounts
    return removeListener;
  }, []);

  const restartContainer = async (
    containerId: string,
    containerName: string,
  ): Promise<void> => {
    setRestarting((prev) => ({ ...prev, [containerId]: true }));

    try {
      await window.electronAPI.restartContainer(containerId);
    } catch (error) {
      console.error(`Error restarting container ${containerName}:`, error);
    } finally {
      // Clear restarting state after a short delay to show feedback
      setTimeout(() => {
        setRestarting((prev) => ({ ...prev, [containerId]: false }));
      }, 1000);
    }
  };

  // Helper function to get display name for a container
  const getDisplayName = (containerName: string): string => {
    return (
      containerNameMapping[containerName] ||
      containerName.replace(/^devwp_/, '')
    );
  };

  return (
    <div className="mr-6 mb-5 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-seasalt text-lg">Services</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenVersions}
            className="flex justify-center items-center bg-gunmetal-500 hover:bg-gunmetal-600 rounded-full size-8 text-seasalt-400 hover:text-seasalt transition-colors"
            title="About DevWP"
          >
            <Icon content="ℹ" className="text-lg" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex justify-center items-center bg-gunmetal-500 hover:bg-gunmetal-600 rounded-full size-8 text-seasalt-400 hover:text-seasalt transition-colors"
            title="Settings"
          >
            <Icon content="⚙" className="text-lg" />
          </button>
        </div>
      </div>
      <XdebugSwitch />
      {loading ? (
        <div className="flex flex-col items-center">
          <Spinner className="p-4" />
          <p>Loading services...</p>
        </div>
      ) : (
        <ul className="gap-3 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] m-0 p-0 list-none">
          {containerMap.length > 0 ? (
            containerMap.map((container) => (
              <li
                key={container.id}
                className={`flex justify-between items-center px-3 py-1.5 bg-gunmetal-500 rounded-md transition-colors hover:bg-gunmetal-500 ${container.state === 'running' ? 'border-l-3 border-emerald-500' : container.state === 'exited' || container.state === 'stopped' ? 'border-l-3 border-crimson-500' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  {containerIconMapping[container.name] || '🔧'}
                  <div className="flex flex-col text-left">
                    <span className="overflow-hidden font-medium text-sm text-ellipsis whitespace-nowrap">
                      {getDisplayName(container.name)}
                    </span>
                    {container.version && (
                      <span className="mt-0.5 text-seasalt text-xs">
                        {container.version}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className={`flex shrink-0 justify-center items-center bg-gunmetal-500 disabled:opacity-50 rounded-full size-7 text-2xl text-seasalt hover:text-warm-charcoal transition-all duration-200 cursor-pointer disabled:cursor-not-allowed icon ${restarting[container.id] ? '' : 'hover:rotate-30 hover:bg-pumpkin hover:text-warm-charcoal hover:scale-110'}`}
                  onClick={() => restartContainer(container.id, container.name)}
                  disabled={restarting[container.id]}
                  title="Restart service"
                >
                  {restarting[container.id] ? (
                    <Spinner svgClass="size-6" />
                  ) : (
                    <span>↻</span>
                  )}
                </button>
              </li>
            ))
          ) : (
            <li className="col-span-full py-6">
              <div className="flex flex-col items-center text-seasalt">
                <div className="mb-2 text-2xl">🔧</div>
                <span>No containers running</span>
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default Services;
