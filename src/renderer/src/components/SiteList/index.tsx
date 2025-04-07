import { useEffect, useState } from 'react'
import './SiteList.scss'

interface Site {
  name: string
  path: string
  url: string
  status: string
}

const SiteList: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [newSite, setNewSite] = useState<{ domain: string }>({
    domain: ''
  })

  const openSiteUrl = (url: string): void => {
    window.electron.ipcRenderer.invoke('open-external', url)
  }

  const handleCreateSite = (): void => {
    setIsModalOpen(true)
  }

  const handleCloseModal = (): void => {
    setIsModalOpen(false)
    setNewSite({ domain: '' })
  }

  const handleSubmitNewSite = async (): Promise<void> => {
    console.log('Creating new site:', newSite)

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
      setNewSite({ domain: '' })
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

  useEffect(() => {
    fetchSites()
  }, [])

  return (
    <div className="SiteList">
      <div className="header">
        <h3>My Sites</h3>
        <button onClick={handleCreateSite} className="new-site-button">
          <span className="plus-icon">+</span> New Site
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
                <button onClick={() => openSiteUrl(site.url)} className="open-button">
                  Open
                </button>
                <button onClick={() => handleDeleteSite(site)} className="delete-button">
                  <span className="icon"></span>
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
                  value={newSite.domain}
                  onChange={(e) => setNewSite({ ...newSite, domain: e.target.value })}
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

            <div className="modal-actions">
              <button onClick={handleCloseModal} className="cancel-button">
                Cancel
              </button>
              <button
                onClick={handleSubmitNewSite}
                disabled={!newSite.domain}
                className={`create-button ${!newSite.domain ? 'disabled' : ''}`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SiteList
