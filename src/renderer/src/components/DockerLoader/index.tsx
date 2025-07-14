import { JSX } from 'react'
import dockerLogo from '../../assets/docker.svg'
import { useState, useEffect } from 'react'

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
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-black/85">
      <div className="bg-gray-800 shadow-xl p-8 rounded-lg w-[90%] max-w-lg text-rich-black-200 text-center">
        <img src={dockerLogo} alt="Docker Logo" className="mx-auto my-10 ml-4 w-20 h-20" />
        {dockerStatus.status !== 'error' && (
          <div className="mx-auto mb-4 border-4 border-gray-600 border-t-blue-400 rounded-full w-10 h-10 animate-spin"></div>
        )}
        <h3>Starting Docker Environment</h3>
        <p className="mt-4 h-15 overflow-y-auto text-rich-black-400 text-sm">
          {dockerStatus.message}
        </p>
        {dockerStatus.status === 'error' && (
          <div className="mt-4 text-red-400">
            There was an error starting Docker. Check the logs for details.
          </div>
        )}
      </div>
    </div>
  )
}

export default DockerLoader
