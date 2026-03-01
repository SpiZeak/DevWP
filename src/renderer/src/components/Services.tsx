import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  siDocker,
  siMariadb,
  siNginx,
  siPhp,
  siRedis,
  siSonarqubeserver,
} from 'simple-icons';
import { BrandLogo } from './BrandLogo';
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
  devwp_nginx: 'Nginx',
  devwp_php: 'PHP',
  devwp_mariadb: 'MariaDB',
  devwp_redis: 'Redis',
  devwp_mailpit: 'Mailpit',
  devwp_sonarqube: 'SonarQube',
};

const containerIconMapping: Record<string, React.ReactNode> = {
  devwp_nginx: <BrandLogo icon={siNginx} />,
  devwp_php: <BrandLogo icon={siPhp} />,
  devwp_mariadb: <BrandLogo icon={siMariadb} />,
  devwp_redis: <BrandLogo icon={siRedis} />,
  devwp_mailpit: <BrandLogo icon={siDocker} />,
  devwp_sonarqube: <BrandLogo icon={siSonarqubeserver} />,
};

const Services: React.FC<ServicesProps> = ({
  onOpenSettings,
  onOpenVersions,
}) => {
  const [containers, setContainers] = useState([] as Container[]);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState({} as Record<string, boolean>);
  const excludedContainers = [
    'devwp_seonaut',
    'devwp_sonarqube-scanner',
    'devwp_certs',
  ];
  const containerMap = containers.filter(
    (container) =>
      container.name.includes('devwp_') &&
      !excludedContainers.includes(container.name),
  );

  useEffect(() => {
    // Set up a listener for container status updates
    const unlisten = listen('container-status', (event) => {
      setContainers(event.payload as Container[]);
      setLoading(false);
    });

    // Request initial container status
    invoke('get_container_status');

    // Clean up listener when component unmounts
    return () => {
      unlisten.then((unlisten) => unlisten());
    };
  }, []);

  const restartContainer = async (
    containerId: string,
    containerName: string,
  ): Promise<void> => {
    setRestarting((prev) => ({ ...prev, [containerId]: true }));

    try {
      await invoke('restart_container', { containerId });
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
      <XdebugSwitch />
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <BrandLogo icon={siDocker} />
          <h2 className="font-semibold text-seasalt text-lg">
            Docker Services
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenVersions}
            className="flex justify-center items-center bg-gunmetal-500 hover:bg-gunmetal-600 rounded-full size-8 text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer"
            title="About DevWP"
          >
            <Icon content="ℹ" className="text-lg" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex justify-center items-center bg-gunmetal-500 hover:bg-gunmetal-600 rounded-full size-8 text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer"
            title="Settings"
          >
            <Icon content="⚙" className="text-lg" />
          </button>
        </div>
      </div>
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
