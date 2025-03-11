import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'
import { JSX, useState, useEffect } from 'react'
import DockerLoader from './components/DockerLoader'

interface Site {
  name: string
  path: string
  url: string
  active: boolean
}

function App(): JSX.Element {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
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

    fetchSites()
  }, [])

  // Handle opening URL in browser
  const openSiteUrl = (url: string): void => {
    window.electron.ipcRenderer.invoke('open-external', url)
  }

  return (
    <>
      <img alt="logo" className="logo" src={electronLogo} />
      <h1>DevWP</h1>
      <div className="creator">Powered by electron-vite</div>
      <DockerLoader />
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
      <Versions></Versions>
    </>
  )
}

export default App
