import { Site } from '@renderer/env'
import { useState } from 'react'

interface WpCliModalProps {
  isOpen: boolean
  site: Site | null
  onClose: () => void
}

const WpCliModal: React.FC<WpCliModalProps> = ({ isOpen, site, onClose }) => {
  const [wpCliCommand, setWpCliCommand] = useState<string>('')
  const [wpCliResult, setWpCliResult] = useState<{ output?: string; error?: string } | null>(null)
  const [wpCliLoading, setWpCliLoading] = useState<boolean>(false)

  if (!isOpen || !site) return null

  const handleRunWpCli = async (): Promise<void> => {
    setWpCliLoading(true)
    setWpCliResult(null)
    try {
      const result = await window.electron.ipcRenderer.invoke('run-wp-cli', {
        site: site,
        command: wpCliCommand
      })
      setWpCliResult(result)
    } catch (e) {
      setWpCliResult({ error: String(e) })
    } finally {
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
    setWpCliResult(null)
    onClose()
  }

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
              Cancel
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
        {wpCliResult && (
          <div className="form-group">
            <label className="form-label">Result</label>
            <pre
              style={{
                background: '#222',
                color: '#fff',
                padding: '10px',
                borderRadius: '4px',
                maxHeight: '200px',
                overflow: 'auto'
              }}
            >
              {wpCliResult.output || wpCliResult.error}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default WpCliModal
