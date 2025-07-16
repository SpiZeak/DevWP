import { Site } from './index'
import { useState, useEffect, useRef } from 'react'

interface WpCliModalProps {
  isOpen: boolean
  site: Site | null
  onClose: () => void
}

const WpCliModal: React.FC<WpCliModalProps> = ({ isOpen, site, onClose }) => {
  const [wpCliCommand, setWpCliCommand] = useState<string>('')
  const [wpCliOutput, setWpCliOutput] = useState<string>('')
  const [wpCliError, setWpCliError] = useState<string>('')
  const [wpCliLoading, setWpCliLoading] = useState<boolean>(false)
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!isOpen || !site) return

    // Set up streaming listener
    const removeListener = window.electronAPI.onWpCliStream((data) => {
      // Only handle streams for the current site
      if (data.siteId !== site.name) return

      switch (data.type) {
        case 'stdout':
          setWpCliOutput((prev) => prev + data.data)
          break
        case 'stderr':
          setWpCliError((prev) => prev + data.data)
          break
        case 'complete':
          setWpCliLoading(false)
          break
        case 'error':
          setWpCliError((prev) => prev + data.error)
          setWpCliLoading(false)
          break
      }
    })

    return removeListener
  }, [isOpen, site])

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [wpCliOutput, wpCliError])

  if (!isOpen || !site) return null

  const handleRunWpCli = async (): Promise<void> => {
    setWpCliLoading(true)
    setWpCliOutput('')
    setWpCliError('')

    try {
      await window.electron.ipcRenderer.invoke('run-wp-cli', {
        site: site,
        command: wpCliCommand
      })
    } catch (e) {
      setWpCliError(String(e))
      setWpCliLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (!wpCliLoading && wpCliCommand.trim()) {
      handleRunWpCli()
    }
  }

  const handleClose = (): void => {
    setWpCliCommand('')
    setWpCliOutput('')
    setWpCliError('')
    onClose()
  }

  const hasOutput = wpCliOutput || wpCliError

  return (
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-warm-charcoal/70">
      <div className="bg-gunmetal-400 shadow-xl p-5 rounded-lg w-[90%] max-w-lg">
        <h3 className="mt-0 mb-5 text-seasalt">
          Run WP-CLI Command for <span className="font-bold">{site.name}</span>
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label className="block mb-1 text-seasalt text-sm">Command</label>
            <input
              type="text"
              className="bg-gunmetal-500 p-2 border border-gunmetal-600 focus:border-pumpkin-500 rounded focus:outline-none w-full text-seasalt"
              value={wpCliCommand}
              onChange={(e): void => setWpCliCommand(e.target.value)}
              placeholder="e.g. plugin list"
              disabled={wpCliLoading}
              autoFocus
            />
            <div className="mt-1 text-seasalt-400 text-xs">
              Only enter the command after <span className="font-bold">wp</span>, e.g.{' '}
              <code className="bg-gunmetal-500 px-1 rounded">plugin list</code>
            </div>
          </div>
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              className="bg-gunmetal-500 hover:bg-gunmetal-600 px-4 py-2 border-0 rounded text-seasalt-400 hover:text-seasalt transition-colors duration-200 cursor-pointer"
              disabled={wpCliLoading}
            >
              {wpCliLoading ? 'Close' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="bg-pumpkin hover:bg-pumpkin-600 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-warm-charcoal disabled:text-seasalt-400 transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed"
              disabled={!wpCliCommand.trim() || wpCliLoading}
            >
              {wpCliLoading ? 'Running...' : 'Run'}
            </button>
          </div>
        </form>
        {hasOutput && (
          <div className="mb-5">
            <label className="block mb-1 text-seasalt text-sm">
              Output {wpCliLoading && <span className="text-amber">●</span>}
            </label>
            <pre
              ref={outputRef}
              className="bg-warm-charcoal-200 p-2.5 border border-gunmetal-600 rounded max-h-[300px] overflow-auto font-mono text-seasalt text-xs break-words whitespace-pre-wrap"
            >
              {wpCliOutput && <span className="text-emerald">{wpCliOutput}</span>}
              {wpCliError && <span className="text-crimson">{wpCliError}</span>}
              {wpCliLoading && <span className="text-amber">▊</span>}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default WpCliModal
