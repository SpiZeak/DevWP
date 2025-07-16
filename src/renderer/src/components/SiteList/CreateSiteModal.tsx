import { useState, useEffect } from 'react'

export interface NewSiteData {
  domain: string
  webRoot: string
  aliases: string
  multisite: {
    enabled: boolean
    type: 'subdomain' | 'subdirectory'
  }
}

interface CreateSiteModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (siteData: NewSiteData) => void
}

const CreateSiteModal: React.FC<CreateSiteModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [newSite, setNewSite] = useState<NewSiteData>({
    domain: 'example.test',
    webRoot: '',
    aliases: '',
    multisite: {
      enabled: false,
      type: 'subdirectory'
    }
  })

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal is closed
      setNewSite({
        domain: 'example.test',
        webRoot: '',
        aliases: '',
        multisite: { enabled: false, type: 'subdirectory' }
      })
    }
  }, [isOpen])

  if (!isOpen) return null

  const formatDomain = (domain: string): string => {
    if (!/.+\..*$/.test(domain)) {
      return `${domain}.test`
    }
    return domain
  }

  const handleSubmit = (): void => {
    const siteDataToSend = {
      ...newSite,
      domain: formatDomain(newSite.domain),
      aliases: newSite.aliases.split(' ').filter(Boolean).map(formatDomain).join(' ')
    }
    onSubmit(siteDataToSend)
  }

  return (
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-warm-charcoal/70">
      <div className="bg-gunmetal-500 shadow-xl p-5 rounded-lg w-[90%] max-w-lg">
        <h3 className="mt-0 mb-5">Create New Site</h3>
        <div className="mb-5">
          <label className="block mb-1 text-sm">Domain</label>
          <input
            type="text"
            value={newSite.domain}
            onChange={(e): void => setNewSite({ ...newSite, domain: e.target.value })}
            className="bg-gunmetal-400 p-2 border border-gunmetal-500 focus:border-pumpkin rounded focus:outline-none focus:ring-1 focus:ring-pumpkin w-full text-seasalt transition-colors"
            placeholder="example.test"
            autoFocus
          />
        </div>
        <div className="mb-5">
          <label className="block mb-1 text-sm">Aliases (optional, space-separated)</label>
          <input
            type="text"
            value={newSite.aliases}
            onChange={(e): void => setNewSite({ ...newSite, aliases: e.target.value })}
            className="bg-gunmetal-400 p-2 border border-gunmetal-500 focus:border-pumpkin rounded focus:outline-none focus:ring-1 focus:ring-pumpkin w-full text-seasalt transition-colors"
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
            onChange={(e): void =>
              setNewSite({
                ...newSite,
                webRoot: e.target.value.trim().replace(/^\/+|\/+$/g, '')
              })
            }
            className="bg-gunmetal-400 p-2 border border-gunmetal-500 focus:border-pumpkin rounded focus:outline-none focus:ring-1 focus:ring-pumpkin w-full text-seasalt transition-colors"
            placeholder="public (leave blank for site root)"
          />
          <div className="mt-2 text-seasalt text-xs">
            Site will be created in www/
            <span className="font-bold text-pumpkin">{formatDomain(newSite.domain)}</span>.
            {newSite.webRoot ? (
              <>
                {' '}
                Web server will point to www/
                <span className="font-bold text-pumpkin">{formatDomain(newSite.domain)}</span>/
                <span className="font-bold text-pumpkin">{newSite.webRoot}</span>.
              </>
            ) : (
              ' Web server will point to the site root.'
            )}
            <br />
            Accessible at https://
            <span className="font-bold text-pumpkin">{formatDomain(newSite.domain)}</span>
          </div>
        </div>

        {/* Multisite section */}
        <div className="mb-8 rounded-md">
          <div className="flex items-center gap-2 mb-6">
            <label className="inline-block relative mr-2 w-11 h-6">
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
                className="peer opacity-0 w-0 h-0"
              />
              <span className="top-0 right-0 bottom-0 before:bottom-0.5 left-0 before:left-0.5 absolute before:absolute bg-gunmetal-400 before:bg-seasalt peer-checked:bg-pumpkin peer-focus:shadow-sm rounded-3xl before:rounded-full before:w-4.5 before:h-4.5 before:content-[''] transition-all before:transition-all peer-checked:before:translate-x-5 duration-400 before:duration-400 cursor-pointer"></span>
            </label>
            <label
              htmlFor="multisite-enabled"
              className="ml-3 font-medium text-seasalt hover:text-pumpkin transition-colors cursor-pointer"
            >
              Enable WordPress Multisite
            </label>
          </div>

          {newSite.multisite.enabled && (
            <div className="flex gap-4">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-all ${newSite.multisite.type === 'subdirectory' ? 'bg-pumpkin text-warm-charcoal shadow-sm font-semibold' : 'bg-gunmetal-500 hover:bg-gunmetal-400 hover:text-pumpkin'}`}
                onClick={(): void =>
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
                  <span
                    className={`ml-1 text-xs ${newSite.multisite.type === 'subdirectory' ? 'text-warm-charcoal-300' : 'text-seasalt-300'}`}
                  >
                    (example.test/site2)
                  </span>
                </label>
              </div>

              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-all ${newSite.multisite.type === 'subdomain' ? 'bg-pumpkin text-warm-charcoal shadow-sm font-semibold' : 'bg-gunmetal-500 hover:bg-gunmetal-400 hover:text-pumpkin'}`}
                onClick={(): void =>
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
                  Subdomain
                </label>
                <div
                  className={`ml-1 text-xs ${newSite.multisite.type === 'subdomain' ? 'text-warm-charcoal-300' : 'text-seasalt-300'}`}
                >
                  (site2.example.test)
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="bg-gunmetal-400 hover:bg-gunmetal-300 px-4 py-2 border-0 rounded text-seasalt-300 hover:text-seasalt transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!newSite.domain.replace('.test', '')}
            className="bg-pumpkin hover:bg-pumpkin-600 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-warm-charcoal disabled:text-seasalt-300 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreateSiteModal
