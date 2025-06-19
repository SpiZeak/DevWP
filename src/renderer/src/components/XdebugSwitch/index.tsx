import { useState, useEffect, JSX } from 'react'
import './XdebugSwitch.scss'
import xdebugIcon from '../../assets/xdebug.svg'

function XdebugSwitch(): JSX.Element {
  const [xdebugEnabled, setXdebugEnabled] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isToggling, setIsToggling] = useState<boolean>(false)

  useEffect(() => {
    // Get initial Xdebug status
    window.electronAPI
      .getXdebugStatus()
      .then((status) => {
        setXdebugEnabled(status)
        setIsLoading(false)
      })
      .catch((err) => {
        console.error('Error getting Xdebug status:', err)
        setIsLoading(false)
      })

    // Set up listener for status updates
    const removeListener = window.electronAPI.onXdebugStatus((data) => {
      if (data.status === 'restarting') {
        setIsToggling(true)
      } else if (data.status === 'complete') {
        setXdebugEnabled(data.enabled || false)
        setIsToggling(false)
      } else if (data.status === 'error') {
        console.error('Xdebug toggle error:', data.message)
        setIsToggling(false)
      }
    })

    return removeListener
  }, [])

  const handleToggle = async () => {
    if (isToggling) return

    setIsToggling(true)
    try {
      await window.electronAPI.toggleXdebug()
    } catch (err) {
      console.error('Error toggling Xdebug:', err)
      setIsToggling(false)
    }
  }

  return (
    <div className="xdebug-switch-container">
      <div className="xdebug-switch-label">
        <h3>{xdebugEnabled ? 'Debug' : 'Performance'}</h3>
      </div>
      <label className="xdebug-switch">
        <input
          type="checkbox"
          checked={xdebugEnabled}
          onChange={handleToggle}
          disabled={isLoading || isToggling}
        />
        <span className="xdebug-slider round"></span>
      </label>
    </div>
  )
}

export default XdebugSwitch
