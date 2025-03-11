import { useEffect, useState } from 'react'

interface Site {
  name: string
  path: string
  url: string
  active: boolean
}

const SiteList: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [newSite, setNewSite] = useState<{ name: string; domain: string }>({
    name: '',
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
    // Reset form data
    setNewSite({ name: '', domain: '' })
  }

  const handleSubmitNewSite = (): void => {
    // TODO: Call API to create the site
    console.log('Creating new site:', newSite)

    // Close modal and reset form
    setIsModalOpen(false)
    setNewSite({ name: '', domain: '' })

    // Refresh the site list
    fetchSites()
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
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          maxWidth: '500px',
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
          maxWidth: '500px',
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
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ev-c-text-2)' }}>{site.path}</div>
              </div>
              <div>
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
              maxWidth: '500px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Create New Site</h3>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
                Site Name
              </label>
              <input
                type="text"
                value={newSite.name}
                onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--ev-c-gray-1)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--ev-c-gray-2)'
                }}
                placeholder="mysite"
              />
            </div>

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
                    backgroundColor: 'var(--ev-c-gray-2)'
                  }}
                  placeholder="example.test"
                />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ev-c-text-2)', marginTop: '5px' }}>
                This will create a site in www/{newSite.domain} accessible at https://
                {newSite.domain}
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
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitNewSite}
                disabled={!newSite.name || !newSite.domain}
                style={{
                  backgroundColor:
                    !newSite.name || !newSite.domain ? 'var(--ev-c-gray-1)' : 'var(--ev-c-brand)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  cursor: !newSite.name || !newSite.domain ? 'not-allowed' : 'pointer'
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default SiteList
