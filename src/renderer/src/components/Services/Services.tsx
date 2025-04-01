import { useState, useEffect } from 'react'
import './Services.css'

const Services = () => {
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(true)
  const containerMap = containers.filter((container) => container.name !== 'sites_certs')

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
