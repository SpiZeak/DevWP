import { useState, useEffect } from 'react'
import './XdebugSwitch.scss'

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
        <span>Xdebug</span>
        {isLoading ? (
          <span className="xdebug-status-loading">Loading...</span>
        ) : (
          <span className={`xdebug-status ${xdebugEnabled ? 'enabled' : 'disabled'}`}>
            {xdebugEnabled ? 'Enabled' : 'Disabled'}
          </span>
        )}
      </div>
      <label className="xdebug-switch">
        <input
          type="checkbox"
          checked={xdebugEnabled}
          onChange={handleToggle}
          disabled={isLoading || isToggling}
        />
        <span className={`xdebug-slider round ${isToggling ? 'toggling' : ''}`}></span>
      </label>
      {isToggling && <span className="xdebug-toggling-message">Restarting PHP container...</span>}
    </div>
  )
}

export default XdebugSwitch
