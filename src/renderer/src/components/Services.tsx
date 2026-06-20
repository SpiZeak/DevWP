import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  siDocker,
  siMariadb,
  siNginx,
  siPhp,
  siRedis,
} from 'simple-icons';
import { BrandLogo } from './BrandLogo';
import BuildLog from './BuildLog';
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
  health?: string | undefined;
  version?: string | undefined;
}

// Container name mapping for user-friendly display
const containerNameMapping: Record<string, string> = {
  devwp_nginx: 'Nginx',
  devwp_php: 'PHP',
  devwp_mariadb: 'MariaDB',
  devwp_redis: 'Redis',
  devwp_mailpit: 'Mailpit',
};

const containerIconMapping: Record<string, React.ReactNode> = {
  devwp_nginx: <BrandLogo icon={siNginx} />,
  devwp_php: <BrandLogo icon={siPhp} />,
  devwp_mariadb: <BrandLogo icon={siMariadb} />,
  devwp_redis: <BrandLogo icon={siRedis} />,
  devwp_mailpit: <BrandLogo icon={siDocker} />,
};

// Maps Docker Compose service names → container names for build-status events
const serviceToContainerName: Record<string, string> = {
  nginx: 'devwp_nginx',
  php: 'devwp_php',
  mariadb: 'devwp_mariadb',
  redis: 'devwp_redis',
  mailpit: 'devwp_mailpit',
};

const EXCLUDED_CONTAINERS: string[] = [];

// Ordered list of services to always display
const knownContainerNames = [
  'devwp_nginx',
  'devwp_php',
  'devwp_mariadb',
  'devwp_redis',
  'devwp_mailpit',
];

const Services: React.FC<ServicesProps> = ({
  onOpenSettings,
  onOpenVersions,
}) => {
  const [containers, setContainers] = useState([] as Container[]);
  const [restarting, setRestarting] = useState({} as Record<string, boolean>);
  const [buildingServices, setBuildingServices] = useState<Set<string>>(
    new Set(),
  );
  const containerMap = useMemo(
    () =>
      containers.filter(
        (container) =>
          container.name.includes('devwp_') &&
          !EXCLUDED_CONTAINERS.includes(container.name),
      ),
    [containers],
  );

  // Virtual entries for services currently building but not yet in container-status
  const buildingOnlyItems: Container[] = useMemo(
    () =>
      [...buildingServices]
        .filter((name) => !containerMap.some((c) => c.name === name))
        .map((name) => ({ id: `building_${name}`, name, state: 'building' })),
    [buildingServices, containerMap],
  );

  // Always show all known services; use real data if available, otherwise placeholder
  const allItems: Container[] = useMemo(
    () =>
      knownContainerNames.map((name) => {
        const real = containerMap.find((c) => c.name === name);

        if (real) return real;

        const isBuilding =
          buildingServices.has(name) ||
          buildingOnlyItems.some((b) => b.name === name);

        return {
          id: isBuilding ? `building_${name}` : `placeholder_${name}`,
          name,
          state: isBuilding ? 'building' : 'pending',
        };
      }),
    [containerMap, buildingServices, buildingOnlyItems],
  );

  // Poll container status while any container health check is still initializing
  const hasStartingHealth = containers.some((c) => c.health === 'starting');
  useEffect(() => {
    if (!hasStartingHealth) return;
    const interval = setInterval(() => {
      invoke('get_container_status');
    }, 1000);
    return () => clearInterval(interval);
  }, [hasStartingHealth]);

  useEffect(() => {
    let unlistenContainer: (() => void) | undefined;
    let unlistenBuild: (() => void) | undefined;

    const setup = async () => {
      // Register listeners before invoking to avoid missing events
      unlistenContainer = await listen('container-status', (event) => {
        const newContainers = event.payload as Container[];
        setContainers(newContainers);
        // Clear building state for containers that now have actual status
        setBuildingServices((prev) => {
          if (prev.size === 0) return prev;
          const next = new Set(prev);
          for (const c of newContainers) {
            next.delete(c.name);
          }
          return next.size !== prev.size ? next : prev;
        });
      });

      unlistenBuild = await listen<{ service_name: string; status: string }>(
        'build-status',
        (event) => {
          const containerName =
            serviceToContainerName[event.payload.service_name];
          if (!containerName) return;
          setBuildingServices((prev) => {
            const next = new Set(prev);
            if (event.payload.status === 'building') {
              next.add(containerName);
            } else {
              next.delete(containerName);
            }
            return next;
          });
        },
      );

      // Query current build state to handle race with app startup
      const buildStatus =
        await invoke<Record<string, boolean>>('get_build_status');
      const initialBuilding = new Set<string>();
      for (const [service, isBuilding] of Object.entries(buildStatus)) {
        if (isBuilding) {
          const containerName = serviceToContainerName[service];
          if (containerName) initialBuilding.add(containerName);
        }
      }
      if (initialBuilding.size > 0) {
        setBuildingServices(initialBuilding);
      }

      invoke('get_container_status');
    };

    setup();

    // Clean up listeners when component unmounts
    return () => {
      unlistenContainer?.();
      unlistenBuild?.();
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

  // Helper functions (stable references, no closure dependencies)
  const getDisplayName = useCallback((containerName: string): string => {
    return (
      containerNameMapping[containerName] ||
      containerName.replace(/^devwp_/, '')
    );
  }, []);

  const getBorderClass = useCallback(
    (container: Container, isBuilding: boolean): string => {
      if (isBuilding) return 'border-l-3 border-amber-500';
      if (container.state === 'pending') return '';
      if (container.state === 'running') {
        if (container.health === 'unhealthy')
          return 'border-l-3 border-orange-500';
        return 'border-l-3 border-emerald-500';
      }
      if (container.state === 'exited' || container.state === 'stopped')
        return 'border-l-3 border-crimson-500';
      return '';
    },
    [],
  );

  const getStatusText = useCallback(
    (container: Container, isBuilding: boolean): React.ReactNode => {
      if (isBuilding) {
        return <span className="mt-0.5 text-amber text-xs">Building...</span>;
      }
      if (container.state === 'pending') {
        return (
          <span className="mt-0.5 text-seasalt-400 text-xs">Starting...</span>
        );
      }
      if (container.health === 'starting') {
        return <span className="mt-0.5 text-amber text-xs">Starting...</span>;
      }
      if (container.health === 'unhealthy') {
        return <span className="mt-0.5 text-crimson text-xs">Unhealthy</span>;
      }
      if (container.version) {
        return (
          <span className="mt-0.5 text-seasalt text-xs">{container.version}</span>
        );
      }
      return null;
    },
    [],
  );

  return (
    <div className="mr-6 mb-5 rounded-lg">
      <XdebugSwitch />
      <div className="flex justify-between items-center mb-8">
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
      <ul className="gap-3 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] m-0 p-0 list-none">
        {allItems.map((container, index) => {
          const isBuilding = buildingServices.has(container.name);
          return (
            <li
              key={container.id}
              className={`animate-fade-in-up flex justify-between items-center px-3 py-1.5 bg-gunmetal-500 rounded-md transition-colors hover:bg-gunmetal-500 ${getBorderClass(container, isBuilding)}`}
              style={{ animationDelay: `${index * 55}ms` }}
            >
              <div className="flex items-center gap-2.5">
                {isBuilding ? (
                  <span className="text-xl leading-none">🔧</span>
                ) : (
                  containerIconMapping[container.name] || (
                    <span className="text-xl leading-none">🔧</span>
                  )
                )}
                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="overflow-hidden font-medium text-sm text-ellipsis whitespace-nowrap">
                      {getDisplayName(container.name)}
                    </span>
                  </div>
                  {getStatusText(container, isBuilding)}
                </div>
              </div>
              <button
                type="button"
                className={`flex shrink-0 justify-center items-center bg-gunmetal-500 disabled:opacity-50 rounded-full size-7 text-2xl text-seasalt hover:text-warm-charcoal transition-all duration-200 cursor-pointer disabled:cursor-not-allowed icon ${restarting[container.id] || isBuilding ? '' : 'hover:rotate-30 hover:bg-pumpkin hover:text-warm-charcoal hover:scale-110'}`}
                onClick={() => restartContainer(container.id, container.name)}
                disabled={restarting[container.id] || isBuilding}
                title="Restart service"
              >
                {restarting[container.id] ||
                isBuilding ||
                container.state === 'pending' ||
                container.health === 'starting' ? (
                  <Spinner svgClass="size-6" />
                ) : (
                  <span>↻</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <BuildLog isBuilding={buildingServices.size > 0} />
    </div>
  );
};

export default Services;
