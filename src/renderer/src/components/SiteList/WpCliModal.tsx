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
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 className="modal-title">
          Run WP-CLI Command for <span className="bold-text">{site.name}</span>
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Command</label>
            <input
              type="text"
              className="form-input"
              value={wpCliCommand}
              onChange={(e): void => setWpCliCommand(e.target.value)}
              placeholder="e.g. plugin list"
              disabled={wpCliLoading}
              autoFocus
            />
            <div className="form-help-text">
              Only enter the command after <span className="bold-text">wp</span>, e.g.{' '}
              <code>plugin list</code>
            </div>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              onClick={handleClose}
              className="cancel-button"
              disabled={wpCliLoading}
            >
              {wpCliLoading ? 'Close' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="create-button"
              disabled={!wpCliCommand.trim() || wpCliLoading}
            >
              {wpCliLoading ? 'Running...' : 'Run'}
            </button>
          </div>
        </form>
        {hasOutput && (
          <div className="form-group">
            <label className="form-label">
              Output {wpCliLoading && <span className="loading-indicator">●</span>}
            </label>
            <pre
              ref={outputRef}
              style={{
                background: '#222',
                color: '#fff',
                padding: '10px',
                borderRadius: '4px',
                maxHeight: '300px',
                overflow: 'auto',
                fontSize: '12px',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {wpCliOutput && <span style={{ color: '#90EE90' }}>{wpCliOutput}</span>}
              {wpCliError && <span style={{ color: '#FF6B6B' }}>{wpCliError}</span>}
              {wpCliLoading && <span style={{ color: '#FFD700' }}>▊</span>}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default WpCliModal
