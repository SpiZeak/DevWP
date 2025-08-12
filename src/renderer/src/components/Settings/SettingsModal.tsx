import { useState, useEffect } from 'react'
import Icon from '../ui/Icon'
import Spinner from '../ui/Spinner'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [webrootPath, setWebrootPath] = useState<string>('')
  const [originalWebrootPath, setOriginalWebrootPath] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)
  const [hasChanges, setHasChanges] = useState<boolean>(false)

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  useEffect(() => {
    setHasChanges(webrootPath !== originalWebrootPath)
  }, [webrootPath, originalWebrootPath])

  const loadSettings = async (): Promise<void> => {
    try {
      setLoading(true)
      const path = await window.electronAPI.getWebrootPath()
      setWebrootPath(path)
      setOriginalWebrootPath(path)
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async (): Promise<void> => {
    try {
      setSaving(true)
      const result = await window.electronAPI.saveSetting('webroot_path', webrootPath)

      if (result.success) {
        setOriginalWebrootPath(webrootPath)
        console.log('Settings saved successfully')
      } else {
        console.error('Failed to save settings:', result.error)
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = (): void => {
    if (hasChanges) {
      // Reset to original values
      setWebrootPath(originalWebrootPath)
    }
    onClose()
  }

  const handleSelectDirectory = async (): Promise<void> => {
    try {
      const selectedPath = await window.electronAPI.pickDirectory(webrootPath)
      if (selectedPath) {
        setWebrootPath(selectedPath)
      }
    } catch (error) {
      console.error('Failed to select directory:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-black bg-opacity-50">
      <div className="bg-gunmetal-400 mx-4 p-6 rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-semibold text-seasalt text-xl">Settings</h2>
          <button
            onClick={handleClose}
            className="text-seasalt-400 hover:text-seasalt transition-colors"
            title="Close Settings"
          >
            <Icon content="✕" className="text-lg" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner title="Loading settings..." />
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="block mb-2 font-medium text-seasalt text-sm">Webroot Path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 bg-gunmetal-500 p-3 border border-gunmetal-600 focus:border-pumpkin-500 rounded focus:outline-none text-seasalt"
                  value={webrootPath}
                  onChange={(e): void => setWebrootPath(e.target.value)}
                  placeholder="/path/to/webroot"
                />
                <button
                  onClick={handleSelectDirectory}
                  className="bg-gunmetal-500 hover:bg-gunmetal-600 px-3 py-3 border border-gunmetal-600 rounded text-seasalt-400 hover:text-seasalt transition-colors"
                  title="Browse for directory"
                >
                  <Icon content="📁" className="text-sm" />
                </button>
              </div>
              <div className="mt-1 text-seasalt-400 text-xs">
                Default path where WordPress sites will be created. Default:{' '}
                <code className="bg-gunmetal-500 px-1 rounded">$HOME/www</code>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-gunmetal-600 border-t">
              <button
                onClick={handleClose}
                className="bg-gunmetal-500 hover:bg-gunmetal-600 px-4 py-2 border-0 rounded text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={!hasChanges || saving}
                className="flex items-center gap-2 bg-pumpkin hover:bg-pumpkin-600 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-warm-charcoal disabled:text-seasalt-400 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {saving && <Spinner svgClass="size-4" />}
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SettingsModal
