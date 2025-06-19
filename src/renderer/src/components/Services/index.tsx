import React, { useState, useEffect } from 'react'
import './Services.scss'
import XdebugSwitch from '../XdebugSwitch'
import phpIcon from '../../assets/icons/php.svg'
import mailpitIcon from '../../assets/icons/mailpit.svg'
import mariaDBIcon from '../../assets/icons/mariadb.svg'
import redisIcon from '../../assets/icons/redis.svg'
import sonarCubeIcon from '../../assets/icons/sonarqube.svg'
import nginxIcon from '../../assets/icons/nginx.svg'

interface Container {
  id: string
  name: string
  state: string
  version?: string | undefined
}

// Container name mapping for user-friendly display
const containerNameMapping: Record<string, string> = {
  devwp_web: 'Nginx',
  devwp_php: 'PHP',
  devwp_mariadb: 'MariaDB',
  devwp_redis: 'Redis',
  devwp_mailpit: 'Mailpit',
  devwp_certs: 'Certificates',
  devwp_sonarqube: 'SonarQube'
}

const containerIconMapping: Record<string, React.ReactNode> = {
  devwp_web: <img className="service-icon" src={nginxIcon} alt="Nginx" />,
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
    <div className="services-container">
      <XdebugSwitch />
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading services...</p>
        </div>
      ) : (
        <ul className="services-list">
          {containerMap.length > 0 ? (
            containerMap.map((container) => (
              <li key={container.id} className={`service-item ${container.state}`}>
                <div className="service-info">
                  {containerIconMapping[container.name] || '🔧'}
                  <div className="service-details">
                    <span className="service-name">{getDisplayName(container.name)}</span>
                    {container.version && (
                      <span className="service-version">{container.version}</span>
                    )}
                  </div>
                </div>
                <button
                  className={`restart-button ${restarting[container.id] ? 'restarting' : ''}`}
                  onClick={() => restartContainer(container.id, container.name)}
                  disabled={restarting[container.id]}
                  title="Restart service"
                >
                  {restarting[container.id] ? (
                    <span className="restart-spinner"></span>
                  ) : (
                    <span className="restart-icon">↻</span>
                  )}
                </button>
              </li>
            ))
          ) : (
            <li className="no-containers">No containers running</li>
          )}
        </ul>
      )}
    </div>
  )
}

export default Services
