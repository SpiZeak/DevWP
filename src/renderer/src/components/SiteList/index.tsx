import { useEffect, useState } from 'react'
import './SiteList.scss'

export interface Site {
  name: string
  path: string
  url: string
  status: string
}

const SiteList: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [scanningSite, setScanningSite] = useState<string | null>(null)
  const [newSite, setNewSite] = useState<{
    domain: string
    multisite: {
      enabled: boolean
      type: 'subdomain' | 'subdirectory'
    }
  }>({
    domain: 'example.test',
    multisite: {
      enabled: false,
      type: 'subdirectory'
    }
  })
  const [wpCliModal, setWpCliModal] = useState<{ open: boolean; site: Site | null }>({
    open: false,
    site: null
  })
  const [wpCliCommand, setWpCliCommand] = useState<string>('')
  const [wpCliResult, setWpCliResult] = useState<{ output?: string; error?: string } | null>(null)
  const [wpCliLoading, setWpCliLoading] = useState<boolean>(false)

  const openSiteUrl = (url: string): void => {
    window.electron.ipcRenderer.invoke('open-external', url)
  }

  const handleCreateSite = (): void => {
    setIsModalOpen(true)
  }

  const handleCloseModal = (): void => {
    setIsModalOpen(false)
    setNewSite({ domain: '', multisite: { enabled: false, type: 'subdirectory' } })
  }

  const handleSubmitNewSite = async (): Promise<void> => {
    setSites([
      {
        name: newSite.domain,
        path: `www/${newSite.domain}`,
        url: `https://${newSite.domain}`,
        status: 'provisioning'
      },
      ...sites
    ])

    try {
      window.electronAPI.createSite(newSite).then(fetchSites)
      setIsModalOpen(false)
      setNewSite({ domain: '', multisite: { enabled: false, type: 'subdirectory' } })
    } catch (error) {
      console.error('Failed to create new site:', error)
    }
  }

  const handleDeleteSite = async (site: Site): Promise<void> => {
    if (confirm(`Are you sure you want to delete the site ${site.name}?`)) {
      try {
        await window.electronAPI.deleteSite(site)
        fetchSites()
      } catch (error) {
        console.error('Failed to delete site:', error)
      }
    }
  }

  const handleScanSite = async (site: Site): Promise<void> => {
    if (scanningSite) return
    setScanningSite(site.name)
    try {
      const result = await window.electronAPI.scanSiteWithSonarQube(site.name)
      if (result.success) {
        alert(
          `SonarQube scan initiated successfully for ${site.name}. Check SonarQube UI for progress.`
        )
      } else {
        console.error(`SonarQube scan failed for ${site.name}:`, result.error)
        alert(`SonarQube scan failed for ${site.name}: ${result.error}`)
      }
    } catch (error) {
      console.error(`Failed to trigger SonarQube scan for ${site.name}:`, error)
      alert(`Failed to trigger SonarQube scan for ${site.name}.`)
    } finally {
      setScanningSite(null)
    }
  }

  const handleOpenWpCliModal = (site: Site) => {
    setWpCliModal({ open: true, site })
    setWpCliCommand('')
    setWpCliResult(null)
  }

  const handleCloseWpCliModal = () => {
    setWpCliModal({ open: false, site: null })
    setWpCliCommand('')
    setWpCliResult(null)
  }

  const handleRunWpCli = async () => {
    setWpCliLoading(true)
    setWpCliResult(null)
    try {
      const result = await window.electronAPI.runWpCliCommand(wpCliModal.site, wpCliCommand)
      setWpCliResult(result)
    } catch (e) {
      setWpCliResult({ error: String(e) })
    } finally {
      setWpCliLoading(false)
    }
  }

  const fetchSites = async (): Promise<void> => {
    try {
      setLoading(true)
      const siteList = await window.electronAPI.getSites()
      setSites(siteList)
    } catch (error) {
      console.error('Failed to fetch sites:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDomain = (domain: string): string => {
    // Check if the domain ends with a period followed by at least one character
    if (!/.+\..+$/.test(domain)) {
      return `${domain}.test`
    }

    return domain
  }

  useEffect(() => {
    fetchSites()
  }, [])

  return (
    <div className="SiteList">
      <div className="header">
        <h3>My Sites</h3>
        <button onClick={handleCreateSite} className="new-site-button">
          <span className="icon"></span> New Site
        </button>
      </div>
      <ul className="sites-list">
        {loading ? (
          <li className="site-list-message">Loading sites...</li>
        ) : sites.length === 0 ? (
          <li className="site-list-message">No sites configured</li>
        ) : (
          sites.map((site, index) => (
            <li
              key={site.name}
              className={`site-item ${index < sites.length - 1 ? 'with-border' : ''}`}
            >
              <div className="site-info">
                <div className="site-name-container">
                  {site.name}
                  {site.status === 'provisioning' && (
                    <span className="provisioning-spinner" title="Site is being provisioned" />
                  )}
                </div>
                <div className="site-path">{site.path}</div>
              </div>
              <div className="site-actions">
                <button
                  onClick={() => openSiteUrl(site.url)}
                  className="open-button"
                  title="Open Site"
                >
                  <span className="icon"></span>
                </button>
                <button
                  onClick={() => handleScanSite(site)}
                  className={`scan-button ${scanningSite === site.name ? 'scanning' : ''}`}
                  disabled={scanningSite === site.name} // Disable while scanning this site
                  title={scanningSite === site.name ? 'Scan in progress...' : 'Run SonarQube Scan'}
                >
                  {scanningSite === site.name ? (
                    <span className="provisioning-spinner" title="Site is being provisioned" />
                  ) : (
                    <span className="icon">󱉶</span>
                  )}
                </button>
                <button
                  onClick={() => handleDeleteSite(site)}
                  className="delete-button"
                  title="Delete Site"
                >
                  <span className="icon"></span>
                </button>
                <button
                  onClick={() => handleOpenWpCliModal(site)}
                  className="wpcli-button"
                  title="Run WP-CLI Command"
                >
                  <span className="icon"></span>
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Create New Site</h3>
            <div className="form-group">
              <label className="form-label">Domain</label>
              <div className="input-container">
                <input
                  type="text"
                  onChange={(e) => setNewSite({ ...newSite, domain: formatDomain(e.target.value) })}
                  className="form-input"
                  placeholder="example.test"
                />
              </div>
              <div className="form-help-text">
                This will create a site in www/
                <span className="bold-text">{newSite.domain}</span> accessible at https://
                <span className="bold-text">{newSite.domain}</span>
              </div>
            </div>

            <div className="form-group multisite-group">
              <div className="checkbox-container">
                <label className="switch">
                  <input
                    type="checkbox"
                    id="multisite-enabled"
                    checked={newSite.multisite.enabled}
                    onChange={(e) =>
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
                      onChange={() =>
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
                      onChange={() =>
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
              <button onClick={handleCloseModal} className="cancel-button">
                Cancel
              </button>
              <button
                onClick={handleSubmitNewSite}
                disabled={!newSite.domain.replace('.test', '')}
                className={`create-button ${!newSite.domain ? 'disabled' : ''}`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {wpCliModal.open && wpCliModal.site && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">
              Run WP-CLI Command for <span className="bold-text">{wpCliModal.site.name}</span>
            </h3>
            <div className="form-group">
              <label className="form-label">Command</label>
              <input
                type="text"
                className="form-input"
                value={wpCliCommand}
                onChange={(e) => setWpCliCommand(e.target.value)}
                placeholder="e.g. plugin list"
                disabled={wpCliLoading}
              />
              <div className="form-help-text">
                Only enter the command after <span className="bold-text">wp</span>, e.g.{' '}
                <code>plugin list</code>
              </div>
            </div>
            <div className="modal-actions">
              <button
                onClick={handleCloseWpCliModal}
                className="cancel-button"
                disabled={wpCliLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleRunWpCli}
                className="create-button"
                disabled={!wpCliCommand.trim() || wpCliLoading}
              >
                {wpCliLoading ? 'Running...' : 'Run'}
              </button>
            </div>
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
      )}
    </div>
  )
}

export default SiteList
