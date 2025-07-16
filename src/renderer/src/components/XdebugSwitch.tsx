import { useState, useEffect, JSX } from 'react'
import Toggle from './ui/Toggle'

function XdebugSwitch(): JSX.Element {
  const [xdebugEnabled, setXdebugEnabled] = useState<boolean>(false)
  const [isToggling, setIsToggling] = useState<boolean>(false)

  useEffect(() => {
    // Get initial Xdebug status
    window.electronAPI
      .getXdebugStatus()
      .then((status) => {
        setXdebugEnabled(status)
      })
      .catch((err) => {
        console.error('Error getting Xdebug status:', err)
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

  const handleToggle = async (): Promise<void> => {
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
    <div className="flex justify-between items-start mb-6 rounded-md">
      <div className="flex flex-col flex-1 mr-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="m-0 mb-2 font-medium">{xdebugEnabled ? 'Debug' : 'Performance'} mode</h3>
          <Toggle
            checked={xdebugEnabled}
            onChange={handleToggle}
            disabled={isToggling}
            title={xdebugEnabled ? 'Switch to Performance Mode' : 'Switch to Debug Mode'}
          />
        </div>
        <p className="m-0 text-seasalt text-sm leading-relaxed">
          {xdebugEnabled
            ? 'Debug mode enables Xdebug for step debugging and profiling PHP code.'
            : 'Performance mode disables Xdebug for faster PHP execution and activates JIT (Just-In-Time) compilation.'}
        </p>
      </div>
    </div>
  )
}

export default XdebugSwitch
