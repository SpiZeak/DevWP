import { useEffect, useState, useRef } from 'react'
import WpCliModal from './WpCliModal'
import Spinner from '../ui/Spinner'
import SiteItem from './SiteItem'

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
  }

  const handleCloseWpCliModal = (): void => {
    setWpCliModal({ open: false, site: null })
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
    <div className="w-full">
      <div className="flex justify-between items-center mb-6 w-full">
        <div className="flex items-center gap-3">
          <div className="flex justify-center items-center bg-gradient-to-br from-pumpkin to-pumpkin-600 rounded-lg w-8 h-8">
            <span className="text-rich-black text-lg icon">󰌨</span>
          </div>
          <h3 className="font-bold text-seasalt text-2xl">Sites</h3>
          {sites.length > 0 && (
            <span className="bg-gunmetal-600 px-3 py-1 rounded-full font-medium text-seasalt-300 text-sm">
              {sites.length}
            </span>
          )}
        </div>
        <button
          onClick={handleCreateSite}
          className="group flex justify-center items-center gap-2 bg-pumpkin hover:bg-pumpkin-600 hover:shadow-lg px-4 py-3 rounded-lg font-semibold text-rich-black hover:scale-105 transition-all duration-200 cursor-pointer"
        >
          <span className="text-xl icon">󰆤</span>
          <span className="hidden sm:inline">New Site</span>
        </button>
      </div>

      <div className="relative">
        <div className="bg-gunmetal-700 shadow-2xl rounded-xl overflow-hidden">
          <ul className="py-2 max-h-[75vh] overflow-y-auto scrollbar-hide" ref={sitesListRef}>
            {loading ? (
              <li className="flex justify-center items-center py-12">
                <div className="flex items-center gap-3">
                  <Spinner svgClass="size-6 text-pumpkin" />
                  <span className="text-seasalt-300 text-lg">Loading sites...</span>
                </div>
              </li>
            ) : sites.length === 0 ? (
              <li className="flex flex-col justify-center items-center px-6 py-16 text-center">
                <div className="flex justify-center items-center bg-gunmetal-600 mb-4 rounded-full w-16 h-16">
                  <span className="text-seasalt-400 text-3xl icon">󰌨</span>
                </div>
                <h4 className="mb-2 font-semibold text-seasalt text-xl">No sites yet</h4>
                <p className="max-w-xs text-seasalt-400 text-sm">
                  Create your first WordPress development site to get started
                </p>
              </li>
            ) : (
              sites.map((site, index) => (
                <SiteItem
                  key={site.name}
                  site={site}
                  isLast={index === sites.length - 1}
                  onOpenUrl={openSiteUrl}
                  onScan={handleScanSite}
                  onDelete={handleDeleteSite}
                  onOpenWpCli={handleOpenWpCliModal}
                  scanningSite={scanningSite}
                />
              ))
            )}
          </ul>
        </div>

        {/* Enhanced scroll indicator */}
        {(scrollBar.visible || isScrolling || (!scrollBar.visible && barEverShown)) &&
          scrollBar.height > 0 && (
            <div
              className={`absolute right-2 w-1 rounded-full bg-gradient-to-b from-pumpkin to-pumpkin-600 z-10 transition-all duration-200 ${scrollBar.visible || isScrolling ? 'opacity-80' : 'opacity-0'}`}
              style={{
                top: scrollBar.top,
                height: scrollBar.height
              }}
            />
          )}
      </div>

      {/* Create Site Modal */}
      {isModalOpen && (
        <div className="z-50 fixed inset-0 flex justify-center items-center bg-black/70">
          <div className="bg-gray-700 shadow-xl p-5 rounded-lg w-[90%] max-w-lg">
            <h3 className="mt-0 mb-5">Create New Site</h3>
            <div className="mb-5">
              <label className="block mb-1 text-sm">Domain</label>
              <input
                type="text"
                value={newSite.domain}
                onChange={(e) => setNewSite({ ...newSite, domain: e.target.value })}
                className="bg-gray-600 p-2 border border-gray-500 rounded w-full text-seasalt"
                placeholder="example.test"
              />
            </div>
            <div className="mb-5">
              <label className="block mb-1 text-sm">Aliases (optional, space-separated)</label>
              <input
                type="text"
                value={newSite.aliases}
                onChange={(e) => setNewSite({ ...newSite, aliases: e.target.value })}
                className="bg-gray-600 p-2 border border-gray-500 rounded w-full text-seasalt"
                placeholder="alias1.test alias2.test"
              />
            </div>
            <div className="mb-5">
              <label className="block mb-1 text-sm">
                Web Root (optional, relative to site directory e.g. "public", "dist")
              </label>
              <input
                type="text"
                value={newSite.webRoot}
                onChange={(e) =>
                  setNewSite({
                    ...newSite,
                    webRoot: e.target.value.trim().replace(/^\/+|\/+$/g, '')
                  })
                }
                className="bg-gray-600 p-2 border border-gray-500 rounded w-full text-seasalt"
                placeholder="public (leave blank for site root)"
              />
              <div className="mt-1 text-seasalt text-xs">
                Site will be created in www/
                <span className="font-bold">{formatDomain(newSite.domain)}</span>.
                {newSite.webRoot ? (
                  <>
                    {' '}
                    Web server will point to www/
                    <span className="font-bold">{formatDomain(newSite.domain)}</span>/
                    <span className="font-bold">{newSite.webRoot}</span>.
                  </>
                ) : (
                  ' Web server will point to the site root.'
                )}
                <br />
                Accessible at https://
                <span className="font-bold">{formatDomain(newSite.domain)}</span>
              </div>
            </div>

            {/* Multisite section */}
            <div className="bg-gray-700 shadow-sm mb-8 rounded-md">
              <div className="flex items-center gap-2 mb-6">
                <label className="inline-block relative mr-2 w-11 h-6">
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
                    className="peer opacity-0 w-0 h-0"
                  />
                  <span className="top-0 right-0 bottom-0 before:bottom-0.5 left-0 before:left-0.5 absolute before:absolute bg-gray-400 before:bg-white peer-checked:bg-blue-500 peer-focus:shadow-sm rounded-3xl before:rounded-full before:w-4.5 before:h-4.5 before:content-[''] transition-all before:transition-all peer-checked:before:translate-x-5 duration-400 before:duration-400 cursor-pointer"></span>
                </label>
                <label htmlFor="multisite-enabled" className="ml-3 font-medium text-rich-black-100">
                  Enable WordPress Multisite
                </label>
              </div>

              {newSite.multisite.enabled && (
                <div className="flex gap-4">
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-all ${newSite.multisite.type === 'subdirectory' ? 'bg-blue-500 text-seasalt shadow-sm font-semibold' : 'bg-gray-600 hover:bg-gray-500'}`}
                    onClick={() =>
                      setNewSite({
                        ...newSite,
                        multisite: {
                          ...newSite.multisite,
                          type: 'subdirectory'
                        }
                      })
                    }
                  >
                    <input
                      hidden
                      type="radio"
                      id="multisite-subdirectory"
                      name="multisite-type"
                      value="subdirectory"
                      checked={newSite.multisite.type === 'subdirectory'}
                      readOnly
                    />
                    <label htmlFor="multisite-subdirectory" className="cursor-pointer">
                      Subdirectory{' '}
                      <span className="ml-1 text-rich-black-300 text-xs">(example.test/site2)</span>
                    </label>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-all ${newSite.multisite.type === 'subdomain' ? 'bg-blue-500 text-seasalt shadow-sm font-semibold' : 'bg-gray-600 hover:bg-gray-500'}`}
                    onClick={() =>
                      setNewSite({
                        ...newSite,
                        multisite: {
                          ...newSite.multisite,
                          type: 'subdomain'
                        }
                      })
                    }
                  >
                    <input
                      hidden
                      type="radio"
                      id="multisite-subdomain"
                      name="multisite-type"
                      value="subdomain"
                      checked={newSite.multisite.type === 'subdomain'}
                      readOnly
                    />
                    <label htmlFor="multisite-subdomain" className="cursor-pointer">
                      Subdomain{' '}
                      <span className="ml-1 text-rich-black-300 text-xs">(site2.example.test)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                onClick={handleCloseModal}
                className="bg-gray-600 px-4 py-2 border-0 rounded text-rich-black-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitNewSite}
                disabled={!newSite.domain.replace('.test', '')}
                className="bg-blue-500 disabled:bg-gray-500 px-4 py-2 border-0 rounded text-seasalt cursor-pointer disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WP-CLI Modal */}
      {wpCliModal.open && wpCliModal.site && (
        <WpCliModal
          isOpen={wpCliModal.open}
          site={wpCliModal.site}
          onClose={handleCloseWpCliModal}
        />
      )}
    </div>
  )
}

export default SiteList
