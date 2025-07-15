import { Site } from '@renderer/env'
import Spinner from '../ui/Spinner'
import Icon from '../ui/Icon'

interface SiteItemProps {
  site: Site
  isLast: boolean
  onOpenUrl: (url: string) => void
  onScan: (site: Site) => void
  onDelete: (site: Site) => void
  onOpenWpCli: (site: Site) => void
  scanningSite: string | null
}

const SiteItem: React.FC<SiteItemProps> = ({
  site,
  isLast,
  onOpenUrl,
  onScan,
  onDelete,
  onOpenWpCli,
  scanningSite
}) => {
  return (
    <li
      className={`group relative bg-gunmetal-500 hover:bg-gunmetal-400 transition-all duration-200 rounded-lg mx-2 mb-3 ${!isLast ? 'mb-3' : 'mb-2'}`}
    >
      <div className="flex justify-between items-center p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2">
              <div className="bg-success shadow-sm rounded-full w-3 h-3"></div>
              <h4 className="font-semibold text-seasalt text-lg truncate leading-tight">
                {site.name}
              </h4>
            </div>
            {site.status === 'provisioning' && (
              <div className="flex items-center gap-2 bg-info/20 px-2 py-1 rounded-full">
                <Spinner svgClass="size-3" title="Site is being provisioned" />
                <span className="font-medium text-info text-xs">Provisioning</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-seasalt-400 text-sm">
            <Icon className="text-base" content="󰉋" />
            <span className="truncate">{site.path}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <button
            onClick={(): void => onOpenUrl(site.url)}
            className="group/btn relative bg-gunmetal-600 hover:bg-pumpkin hover:shadow-lg p-3 rounded-lg hover:scale-105 transition-all duration-200 cursor-pointer"
            title="Open Site"
          >
            <Icon className="text-2xl" content="" />
          </button>
          <button
            onClick={(): void => onScan(site)}
            className={`group/btn relative p-3 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-lg ${
              scanningSite === site.name
                ? 'bg-info/20 cursor-not-allowed'
                : 'bg-gunmetal-600 hover:bg-info cursor-pointer'
            }`}
            disabled={scanningSite === site.name}
            title={scanningSite === site.name ? 'Scan in progress...' : 'Run SonarQube Scan'}
          >
            {scanningSite === site.name ? (
              <Spinner svgClass="size-5 text-info" title="Site is being scanned" />
            ) : (
              <Icon className="text-seasalt group-hover/btn:text-rich-black text-2xl" content="󱉶" />
            )}
          </button>
          <button
            onClick={(): void => onDelete(site)}
            className="group/btn relative bg-gunmetal-600 hover:bg-danger hover:shadow-lg p-3 rounded-lg hover:scale-105 transition-all duration-200 cursor-pointer"
            title="Delete Site"
          >
            <Icon className="text-seasalt group-hover/btn:text-rich-black text-xl" content="󰧧" />
          </button>
          <button
            onClick={(): void => onOpenWpCli(site)}
            className="group/btn relative bg-gunmetal-600 hover:bg-success hover:shadow-lg p-3 rounded-lg hover:scale-105 transition-all duration-200 cursor-pointer"
            title="Run WP-CLI Command"
          >
            <Icon className="text-seasalt group-hover/btn:text-rich-black text-xl" content="󰆍" />
          </button>
        </div>
      </div>
    </li>
  )
}

export default SiteItem
