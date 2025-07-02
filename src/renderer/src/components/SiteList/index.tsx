import { useEffect, useState, useRef } from 'react'
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
  const [wpCliModal, setWpCliModal] = useState<{ open: boolean; site: Site | null }>({
    open: false,
    site: null
  })
  const [wpCliCommand, setWpCliCommand] = useState<string>('')
  const [wpCliResult, setWpCliResult] = useState<{ output?: string; error?: string } | null>(null)
  const [wpCliLoading, setWpCliLoading] = useState<boolean>(false)
  const sitesListRef = useRef<HTMLUListElement>(null)
  const [scrollBar, setScrollBar] = useState({
    top: 0,
    height: 0,
    visible: false
  })
  const barTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [barEverShown, setBarEverShown] = useState(false)
  const [isScrolling, setIsScrolling] = useState(false)
  const SCROLLBAR_MARGIN = 16

  const openSiteUrl = (url: string): void => {
    window.electron.ipcRenderer.invoke('open-external', url)
  }

  const handleCreateSite = (): void => {
    setIsModalOpen(true)
  }

  const handleCloseModal = (): void => {
    setIsModalOpen(false)
    setNewSite({
      domain: '',
      webRoot: '',
      aliases: '',
      multisite: { enabled: false, type: 'subdirectory' }
    })
  }

  const handleSubmitNewSite = async (): Promise<void> => {
    const siteNameToCreate = formatDomain(newSite.domain)
    const aliasesToCreate = newSite.aliases.split(' ').filter(Boolean).map(formatDomain)

    setSites([
      {
        name: siteNameToCreate,
        path: `www/${siteNameToCreate}`, // Base path remains the same for display
        url: `https://${siteNameToCreate}`,
        status: 'provisioning'
      },
      ...sites
    ])

    try {
      // Ensure domain in newSite object being sent is formatted
      const siteDataToSend = {
        ...newSite,
        domain: siteNameToCreate,
        aliases: aliasesToCreate.join(' ')
      }
      window.electronAPI.createSite(siteDataToSend).then(fetchSites)
      setIsModalOpen(false)
      setNewSite({
        domain: '',
        webRoot: '',
        aliases: '',
        multisite: { enabled: false, type: 'subdirectory' }
      })
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
      const result = await window.electron.ipcRenderer.invoke('scanSiteWithSonarQube', site.name)
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

  const handleOpenWpCliModal = (site: Site): void => {
    setWpCliModal({ open: true, site })
    setWpCliCommand('')
    setWpCliResult(null)
  }

  const handleCloseWpCliModal = (): void => {
    setWpCliModal({ open: false, site: null })
    setWpCliCommand('')
    setWpCliResult(null)
  }

  const handleRunWpCli = async (): Promise<void> => {
    setWpCliLoading(true)
    setWpCliResult(null)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'runWpCliCommand',
        wpCliModal.site,
        wpCliCommand
      )
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
    if (!/.+\..*$/.test(domain)) {
      return `${domain}.test`
    }

    return domain
  }

  const showScrollBar = (barTop: number, barHeight: number): void => {
    setScrollBar({
      top: barTop,
      height: barHeight,
      visible: true
    })
    setBarEverShown(true)
    setIsScrolling(true)
    if (barTimeoutRef.current) clearTimeout(barTimeoutRef.current)
    barTimeoutRef.current = setTimeout(() => {
      setScrollBar((b) => ({ ...b, visible: false }))
      setIsScrolling(false)
    }, 800)
  }

  const updateScrollBar = (): void => {
    const el = sitesListRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight) {
      setScrollBar({ top: 0, height: 0, visible: false })
      setIsScrolling(false)
      return
    }
    const availableHeight = clientHeight - SCROLLBAR_MARGIN * 2
    const barHeight = Math.max((clientHeight / scrollHeight) * availableHeight, 24)
    const barTop =
      SCROLLBAR_MARGIN + (scrollTop / (scrollHeight - clientHeight)) * (availableHeight - barHeight)
    showScrollBar(barTop, barHeight)
  }

  // Use a ref to always clear and restart the fade-out timer immediately on scroll
  useEffect(() => {
    const el = sitesListRef.current
    if (!el) return
    let ticking = false
    const onScroll = (): void => {
      // Always show the bar immediately on scroll
      if (!ticking) {
        ticking = true
        window.requestAnimationFrame(() => {
          updateScrollBar()
          ticking = false
        })
      }
    }
    el.addEventListener('scroll', onScroll)
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (barTimeoutRef.current) clearTimeout(barTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchSites()
  }, [])

  useEffect(() => {
    updateScrollBar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, loading])

  return (
    <div className="SiteList">
      <div className="header">
        <h3>My Sites</h3>
        <button onClick={handleCreateSite} className="new-site-button">
          <span className="icon"></span>
          New Site
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <ul className="sites-list" ref={sitesListRef} style={{ position: 'relative' }}>
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
                    title={
                      scanningSite === site.name ? 'Scan in progress...' : 'Run SonarQube Scan'
                    }
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
                    <span className="icon"></span>
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
        {(scrollBar.visible || isScrolling || (!scrollBar.visible && barEverShown)) &&
          scrollBar.height > 0 && (
            <div
              className={`minimal-scroll-indicator${scrollBar.visible || isScrolling ? ' visible scrolling' : ''}`}
              style={{
                position: 'absolute',
                top: scrollBar.top,
                right: 2,
                width: 3,
                height: scrollBar.height,
                borderRadius: 2,
                background: 'rgba(255, 255, 255, 0.3)',
                zIndex: 3,
                transition: 'top 0.1s, height 0.1s, opacity 0.5s'
              }}
            />
          )}
      </div>

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
            </div>
            <div className="form-group">
              <label className="form-label">Aliases (optional, space-separated)</label>
              <div className="input-container">
                <input
                  type="text"
                  value={newSite.aliases}
                  onChange={(e) => setNewSite({ ...newSite, aliases: e.target.value })}
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
                  onChange={(e) =>
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
                className={`create-button ${!newSite.domain.replace('.test', '') ? 'disabled' : ''}`}
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
