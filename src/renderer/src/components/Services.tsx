import React, { useState, useEffect } from 'react'
import XdebugSwitch from './XdebugSwitch'
import phpIcon from '../assets/icons/php.svg'
import mailpitIcon from '../assets/icons/mailpit.svg'
import mariaDBIcon from '../assets/icons/mariadb.svg'
import redisIcon from '../assets/icons/redis.svg'
import sonarCubeIcon from '../assets/icons/sonarqube.svg'
import nginxIcon from '../assets/icons/nginx.svg'

interface Container {
  id: string
  name: string
  state: string
  version?: string | undefined
}

// Container name mapping for user-friendly display
const containerNameMapping: Record<string, string> = {
  devwp_nginx: 'Nginx',
  devwp_php: 'PHP',
  devwp_mariadb: 'MariaDB',
  devwp_redis: 'Redis',
  devwp_mailpit: 'Mailpit',
  devwp_certs: 'Certificates',
  devwp_sonarqube: 'SonarQube'
}

const containerIconMapping: Record<string, React.ReactNode> = {
  devwp_nginx: <img className="service-icon" src={nginxIcon} alt="Nginx" />,
  devwp_php: <img className="service-icon" src={phpIcon} alt="PHP" />,
  devwp_mariadb: <img className="service-icon" src={mariaDBIcon} alt="MariaDB" />,
  devwp_redis: <img className="service-icon" src={redisIcon} alt="Redis" />,
  devwp_mailpit: <img className="service-icon" src={mailpitIcon} alt="Mailpit" />,
  devwp_certs: '🔒',
  devwp_sonarqube: <img className="service-icon" src={sonarCubeIcon} alt="SonarQube" />
}

const Services: React.FC = () => {
  const [containers, setContainers] = useState([] as Container[])
  const [loading, setLoading] = useState(true)
  const [restarting, setRestarting] = useState({})
  const containerMap = containers.filter((container) => container.name.includes('devwp_'))

  useEffect(() => {
    // Set up a listener for container status updates
    const removeListener = window.electronAPI.onContainerStatus((containers) => {
      setContainers(containers)
      setLoading(false)
    })

    // Request initial container status
    window.electronAPI.getContainerStatus()

    // Clean up listener when component unmounts
    return removeListener
  }, [])

  const restartContainer = async (containerId: string, containerName: string): Promise<void> => {
    setRestarting((prev) => ({ ...prev, [containerId]: true }))

    try {
      await window.electronAPI.restartContainer(containerId)
    } catch (error) {
      console.error(`Error restarting container ${containerName}:`, error)
    } finally {
      // Clear restarting state after a short delay to show feedback
      setTimeout(() => {
        setRestarting((prev) => ({ ...prev, [containerId]: false }))
      }, 1000)
    }
  }

  // Helper function to get display name for a container
  const getDisplayName = (containerName: string): string => {
    return containerNameMapping[containerName] || containerName.replace(/^devwp_/, '')
  }

  return (
    <div className="bg-gray-700 shadow-lg mr-6 mb-5 p-4 rounded-lg">
      <XdebugSwitch />
      {loading ? (
        <div className="flex flex-col items-center py-5">
          <div className="mb-3 border-3 border-gray-600 border-t-blue-500 rounded-full w-6 h-6 animate-spin"></div>
          <p>Loading services...</p>
        </div>
      ) : (
        <ul className="gap-3 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] m-0 p-0 list-none">
          {containerMap.length > 0 ? (
            containerMap.map((container) => (
              <li
                key={container.id}
                className={`flex justify-between items-center px-3 py-1.5 bg-gray-600 rounded-md transition-colors hover:bg-gray-500 ${container.state === 'running' ? 'border-l-3 border-green-500' : container.state === 'exited' || container.state === 'stopped' ? 'border-l-3 border-red-500' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  {containerIconMapping[container.name] || '🔧'}
                  <div className="flex flex-col text-left">
                    <span className="overflow-hidden font-medium text-sm text-ellipsis whitespace-nowrap">
                      {getDisplayName(container.name)}
                    </span>
                    {container.version && (
                      <span className="mt-0.5 text-rich-black-400 text-xs">
                        {container.version}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className={`flex items-center justify-center min-w-7 h-7 rounded-full border-0 bg-gray-500 text-rich-black-100 cursor-pointer text-base transition-all duration-200 flex-shrink-0 hover:bg-green-400 hover:text-black hover:scale-110 hover:rotate-30 disabled:opacity-50 disabled:cursor-not-allowed ${restarting[container.id] ? 'bg-blue-400 text-white' : ''}`}
                  onClick={() => restartContainer(container.id, container.name)}
                  disabled={restarting[container.id]}
                  title="Restart service"
                >
                  {restarting[container.id] ? (
                    <span className="inline-block border-2 border-white/30 border-t-white rounded-full w-3.5 h-3.5 animate-spin"></span>
                  ) : (
                    <span>↻</span>
                  )}
                </button>
              </li>
            ))
          ) : (
            <li className="col-span-full py-6">
              <div className="flex flex-col items-center text-rich-black-400">
                <div className="mb-2 text-2xl">🔧</div>
                <span>No containers running</span>
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default Services
