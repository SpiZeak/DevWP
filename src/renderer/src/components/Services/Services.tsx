import { useState, useEffect } from 'react'
import './Services.css'

const Services = () => {
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(true)
  const [restarting, setRestarting] = useState({})
  const containerMap = containers.filter((container) => container.name !== 'devwp_certs')

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

  const restartContainer = async (containerId, containerName) => {
    // Set restarting state for this container
    setRestarting((prev) => ({ ...prev, [containerId]: true }))

    try {
      await window.electronAPI.restartContainer(containerId)
      console.log(`Container ${containerName} restart requested`)
    } catch (error) {
      console.error(`Error restarting container ${containerName}:`, error)
    } finally {
      // Clear restarting state after a short delay to show feedback
      setTimeout(() => {
        setRestarting((prev) => ({ ...prev, [containerId]: false }))
      }, 1000)
    }
  }

  return (
    <div className="container-bar">
      <h3>Docker Services</h3>
      {loading ? (
        <p>Loading container status...</p>
      ) : (
        <ul>
          {containerMap.length > 0 ? (
            containerMap.map((container) => (
              <li key={container.id} className={`container-item ${container.state}`}>
                <span className="container-name">{container.name}</span>
                <button
                  className={`restart-button ${restarting[container.id] ? 'restarting' : ''}`}
                  onClick={() => restartContainer(container.id, container.name)}
                  disabled={restarting[container.id]}
                  title="Restart container"
                >
                  {restarting[container.id] ? '⟳' : '↻'}
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
