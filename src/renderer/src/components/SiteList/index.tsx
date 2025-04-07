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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          marginBottom: '10px'
        }}
      >
        <h3 style={{ margin: 0 }}>My Sites</h3>
        <button
          onClick={handleCreateSite}
          style={{
            backgroundColor: 'var(--ev-c-brand)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--ev-c-brand-dark)')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--ev-c-brand)')}
        >
          <span style={{ fontSize: '16px', lineHeight: '1' }}>+</span> New Site
        </button>
      </div>
      <ul
        style={{
          width: '100%',
          margin: '20px 0',
          padding: '0',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: 'var(--ev-c-gray-3)',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}
      >
        {loading ? (
          <li style={{ padding: '15px', textAlign: 'center' }}>Loading sites...</li>
        ) : sites.length === 0 ? (
          <li style={{ padding: '15px', textAlign: 'center' }}>No sites configured</li>
        ) : (
          sites.map((site, index) => (
            <li
              key={site.name}
              style={{
                padding: '15px',
                borderBottom: index < sites.length - 1 ? '1px solid var(--ev-c-gray-2)' : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ flex: '1' }}>
                <div
                  style={{
                    fontWeight: 'bold',
                    marginBottom: '5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {site.name}
                  {site.status === 'provisioning' && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        borderTopColor: 'var(--ev-c-brand)',
                        animation: 'spin 1s infinite linear'
                      }}
                      title="Site is being provisioned"
                    />
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ev-c-text-2)' }}>{site.path}</div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => openSiteUrl(site.url)}
                  style={{
                    backgroundColor: 'var(--ev-c-gray-2)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    color: 'var(--ev-c-text-1)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'var(--ev-c-gray-1)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--ev-c-gray-2)')}
                >
                  Open
                </button>
                <button
                  onClick={() => handleDeleteSite(site)}
                  style={{
                    backgroundColor: 'var(--ev-c-red)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '12px',
                    transition: 'background-color 0.2s',
                    fontFamily: 'Monaspace Neon, monospace'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'var(--ev-c-red-dark)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--ev-c-red)')}
                >
                  <span className="icon"></span>
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
      {/* Modal Dialog */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--ev-c-gray-3)',
              borderRadius: '8px',
              padding: '20px',
              width: '90%',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Create New Site</h3>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
                Domain
              </label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  value={newSite.domain}
                  onChange={(e) => setNewSite({ ...newSite, domain: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--ev-c-gray-1)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--ev-c-gray-2)',
                    color: '#fff'
                  }}
                  placeholder="example.test"
                />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ev-c-text-2)', marginTop: '5px' }}>
                This will create a site in www/
                <span style={{ fontWeight: 'bold' }}>{newSite.domain}</span> accessible at https://
                <span style={{ fontWeight: 'bold' }}>{newSite.domain}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={handleCloseModal}
                style={{
                  backgroundColor: 'var(--ev-c-gray-2)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  color: 'var(--ev-c-text-1)'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitNewSite}
                disabled={!newSite.domain}
                style={{
                  backgroundColor: newSite.domain ? 'var(--ev-c-gray-1)' : 'var(--ev-c-brand)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  cursor: !newSite.domain ? 'not-allowed' : 'pointer'
                }}
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
