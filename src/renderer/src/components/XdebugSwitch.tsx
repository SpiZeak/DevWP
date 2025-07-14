import { useState, useEffect, JSX } from 'react'

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
    <div className="flex justify-between items-start bg-gray-700 mb-4 p-4 rounded-md">
      <div className="flex flex-col flex-1 mr-4">
        <div>
          <h3 className="m-0 mb-2 font-medium">{xdebugEnabled ? 'Debug' : 'Performance'}</h3>
          <p className="m-0 text-seasalt text-sm leading-relaxed">
            {xdebugEnabled
              ? 'Debug mode enables Xdebug for step debugging and profiling PHP code.'
              : 'Performance mode disables Xdebug for faster PHP execution and activates JIT (Just-In-Time) compilation.'}
          </p>
        </div>
      </div>
      <label className="inline-block relative flex-shrink-0 w-10 h-5">
        <input
          type="checkbox"
          checked={xdebugEnabled}
          onChange={handleToggle}
          disabled={isLoading || isToggling}
          className="peer opacity-0 w-0 h-0"
        />
        <span className="top-0 right-0 bottom-0 before:bottom-0.5 left-0 before:left-0.5 absolute before:absolute bg-gray-400 before:bg-white peer-checked:bg-yellow-500 peer-disabled:opacity-50 peer-focus:shadow-sm rounded-2xl before:rounded-full before:w-3.5 before:h-3.5 before:content-[''] transition-all before:transition-all peer-checked:before:translate-x-5 duration-400 before:duration-400 cursor-pointer peer-disabled:cursor-not-allowed"></span>
      </label>
    </div>
  )
}

export default XdebugSwitch
