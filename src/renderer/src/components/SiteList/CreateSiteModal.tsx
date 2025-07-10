import { useState } from 'react'

interface CreateSiteModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (siteData: {
    domain: string
    webRoot: string
    aliases: string
    multisite: {
      enabled: boolean
      type: 'subdomain' | 'subdirectory'
    }
  }) => void
}

const formatDomain = (domain: string): string => {
  if (!/.+\..*$/.test(domain)) {
    return `${domain}.test`
  }
  return domain
}

const CreateSiteModal: React.FC<CreateSiteModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [newSite, setNewSite] = useState<{
    domain: string
    webRoot: string
    aliases: string
    multisite: {
      enabled: boolean
      type: 'subdomain' | 'subdirectory'
    }
  }>({
    domain: 'example.test',
    webRoot: '',
    aliases: '',
    multisite: {
      enabled: false,
      type: 'subdirectory'
    }
  })

  if (!isOpen) return null

  const handleSubmit = (): void => {
    const siteNameToCreate = formatDomain(newSite.domain)
    const aliasesToCreate = newSite.aliases.split(' ').filter(Boolean).map(formatDomain)

    const siteDataToSend = {
      ...newSite,
      domain: siteNameToCreate,
      aliases: aliasesToCreate.join(' ')
    }
    onSubmit(siteDataToSend)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 className="modal-title">Create New Site</h3>
        <div className="form-group">
          <label className="form-label">Domain</label>
          <div className="input-container">
            <input
              type="text"
              value={newSite.domain}
              onChange={(e): void => setNewSite({ ...newSite, domain: e.target.value })}
              className="form-input"
              placeholder="example.test"
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Aliases (optional, space-separated)</label>
          <div className="input-container">
            <input
              type="text"
              value={newSite.aliases}
              onChange={(e): void => setNewSite({ ...newSite, aliases: e.target.value })}
              className="form-input"
              placeholder="alias1.test alias2.test"
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">
            Web Root (optional, relative to site directory e.g. &quot;public&quot;,
            &quot;dist&quot;)
          </label>
          <div className="input-container">
            <input
              type="text"
              value={newSite.webRoot}
              onChange={(e): void =>
                setNewSite({
                  ...newSite,
                  webRoot: e.target.value.trim().replace(/^\/+|\/+$/g, '')
                })
              }
              className="form-input"
              placeholder="public (leave blank for site root)"
            />
          </div>
          <div className="form-help-text">
            Site will be created in www/
            <span className="bold-text">{formatDomain(newSite.domain)}</span>.
            {newSite.webRoot ? (
              <>
                {' '}
                Web server will point to www/
                <span className="bold-text">{formatDomain(newSite.domain)}</span>/
                <span className="bold-text">{newSite.webRoot}</span>.
              </>
            ) : (
              ' Web server will point to the site root.'
            )}
            <br />
            Accessible at https://
            <span className="bold-text">{formatDomain(newSite.domain)}</span>
          </div>
        </div>

        <div className="form-group multisite-group">
          <div className="checkbox-container">
            <label className="switch">
              <input
                type="checkbox"
                id="multisite-enabled"
                checked={newSite.multisite.enabled}
                onChange={(e): void =>
                  setNewSite({
                    ...newSite,
                    multisite: {
                      ...newSite.multisite,
                      enabled: e.target.checked
                    }
                  })
                }
              />
              <span className="slider round"></span>
            </label>
            <label
              htmlFor="multisite-enabled"
              className="checkbox-label"
              style={{ marginLeft: 12 }}
            >
              Enable WordPress Multisite
            </label>
          </div>

          {newSite.multisite.enabled && (
            <div className="radio-group">
              <div
                className={`radio-option${newSite.multisite.type === 'subdirectory' ? ' selected' : ''}`}
              >
                <input
                  hidden
                  type="radio"
                  id="multisite-subdirectory"
                  name="multisite-type"
                  value="subdirectory"
                  checked={newSite.multisite.type === 'subdirectory'}
                  onChange={(): void =>
                    setNewSite({
                      ...newSite,
                      multisite: {
                        ...newSite.multisite,
                        type: 'subdirectory'
                      }
                    })
                  }
                  className="form-radio"
                />
                <label htmlFor="multisite-subdirectory">
                  Subdirectory <span className="example">(example.test/site2)</span>
                </label>
              </div>

              <div
                className={`radio-option${newSite.multisite.type === 'subdomain' ? ' selected' : ''}`}
              >
                <input
                  hidden
                  type="radio"
                  id="multisite-subdomain"
                  name="multisite-type"
                  value="subdomain"
                  checked={newSite.multisite.type === 'subdomain'}
                  onChange={(): void =>
                    setNewSite({
                      ...newSite,
                      multisite: {
                        ...newSite.multisite,
                        type: 'subdomain'
                      }
                    })
                  }
                  className="form-radio"
                />
                <label htmlFor="multisite-subdomain">
                  Subdomain <span className="example">(site2.example.test)</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="cancel-button">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!newSite.domain.replace('.test', '')}
            className={`create-button ${!newSite.domain.replace('.test', '') ? 'disabled' : ''}`}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreateSiteModal
