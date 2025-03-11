import { JSX } from 'react'

// Example for React (adjust based on your actual framework)
// filepath: /home/max/Projects/DevWP/src/renderer/src/components/DockerLoader.tsx
import { useState, useEffect } from 'react'
import './DockerLoader.css'

function DockerLoader(): JSX.Element | null {
  const [dockerStatus, setDockerStatus] = useState({
    status: 'idle',
    message: ''
  })

  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const removeListener = window.electronAPI.onDockerStatus((status) => {
      setDockerStatus(status)

      if (status.status === 'complete') {
        // Hide loader after a brief delay to show completion
        setTimeout(() => setIsVisible(false), 1000)
      }
    })

    return removeListener
  }, [])

  if (!isVisible) return null

  return (
    <div className="docker-loader-overlay">
      <div className="docker-loader-container">
        <div className="docker-loader-spinner"></div>
        <h3>Starting Docker Environment</h3>
        <p className="docker-status-message">{dockerStatus.message}</p>
        {dockerStatus.status === 'error' && (
          <div className="docker-error-message">
            There was an error starting Docker. Check the logs for details.
          </div>
        )}
      </div>
    </div>
  )
}

export default DockerLoader
