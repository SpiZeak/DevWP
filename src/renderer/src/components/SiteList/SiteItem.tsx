import { Site } from '@renderer/env'
import Spinner from '../ui/Spinner'

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
    <li className={`site-item ${!isLast ? 'with-border' : ''}`}>
      <div className="site-info">
        <div className="site-name-container">
          {site.name}
          {site.status === 'provisioning' && (
            <Spinner svgClass="size-4 ml-2" title="Site is being provisioned" />
          )}
        </div>
        <div className="site-path">{site.path}</div>
      </div>
      <div className="site-actions">
        <button onClick={(): void => onOpenUrl(site.url)} className="open-button" title="Open Site">
          <span className="icon"></span>
        </button>
        <button
          onClick={(): void => onScan(site)}
          className={`scan-button ${scanningSite === site.name ? 'scanning' : ''}`}
          disabled={scanningSite === site.name} // Disable while scanning this site
          title={scanningSite === site.name ? 'Scan in progress...' : 'Run SonarQube Scan'}
        >
          {scanningSite === site.name ? (
            <Spinner svgClass="size-4" title="Site is being scanned" />
          ) : (
            <span className="icon">󱉶</span>
          )}
        </button>
        <button onClick={(): void => onDelete(site)} className="delete-button" title="Delete Site">
          <span className="icon"></span>
        </button>
        <button
          onClick={(): void => onOpenWpCli(site)}
          className="wpcli-button"
          title="Run WP-CLI Command"
        >
          <span className="icon"></span>
        </button>
      </div>
    </li>
  )
}

export default SiteItem
