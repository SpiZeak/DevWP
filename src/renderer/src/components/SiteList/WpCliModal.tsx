import { Site } from '@renderer/env'
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
  const [isComplete, setIsComplete] = useState<boolean>(false)
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
          setIsComplete(true)
          break
        case 'error':
          setWpCliError((prev) => prev + data.error)
          setWpCliLoading(false)
          setIsComplete(true)
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
    setIsComplete(false)

    try {
      await window.electron.ipcRenderer.invoke('run-wp-cli', {
        site: site,
        command: wpCliCommand
      })
    } catch (e) {
      setWpCliError(String(e))
      setWpCliLoading(false)
      setIsComplete(true)
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
    setIsComplete(false)
    onClose()
  }

  const hasOutput = wpCliOutput || wpCliError

  return (
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-black/70">
      <div className="bg-rich-black-700 shadow-xl p-5 rounded-lg w-[90%] max-w-lg">
        <h3 className="mt-0 mb-5">
          Run WP-CLI Command for <span className="font-bold">{site.name}</span>
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label className="block mb-1 text-sm">Command</label>
            <input
              type="text"
              className="bg-rich-black-600 p-2 border border-rich-black-500 rounded w-full text-seasalt"
              value={wpCliCommand}
              onChange={(e): void => setWpCliCommand(e.target.value)}
              placeholder="e.g. plugin list"
              disabled={wpCliLoading}
              autoFocus
            />
            <div className="mt-1 text-seasalt text-xs">
              Only enter the command after <span className="font-bold">wp</span>, e.g.{' '}
              <code className="bg-rich-black-600 px-1 rounded">plugin list</code>
            </div>
          </div>
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              className="bg-rich-black-600 px-4 py-2 border-0 rounded text-seasalt-400 cursor-pointer"
              disabled={wpCliLoading}
            >
              {wpCliLoading ? 'Close' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="bg-pumpkin-500 disabled:bg-rich-black-500 px-4 py-2 border-0 rounded text-rich-black disabled:text-seasalt cursor-pointer disabled:cursor-not-allowed"
              disabled={!wpCliCommand.trim() || wpCliLoading}
            >
              {wpCliLoading ? 'Running...' : 'Run'}
            </button>
          </div>
        </form>
        {hasOutput && (
          <div className="mb-5">
            <label className="block mb-1 text-sm">
              Output {wpCliLoading && <span className="text-info-400">●</span>}
            </label>
            <pre
              ref={outputRef}
              className="bg-rich-black-900 p-2.5 rounded max-h-[300px] overflow-auto font-mono text-seasalt text-xs break-words whitespace-pre-wrap"
            >
              {wpCliOutput && <span className="text-success-400">{wpCliOutput}</span>}
              {wpCliError && <span className="text-danger-400">{wpCliError}</span>}
              {wpCliLoading && <span className="text-info-400">▊</span>}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default WpCliModal
