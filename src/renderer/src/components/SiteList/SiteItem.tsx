import type { Site } from '@renderer/env';
import Icon from '../ui/Icon';
import Spinner from '../ui/Spinner';

interface SiteItemProps {
  site: Site;
  isLast: boolean;
  onOpenUrl: (url: string) => void;
  onScan: (site: Site) => void;
  onOpenWpCli: (site: Site) => void;
  onEditSite: (site: Site) => void;
  scanningSite: string | null;
}

const SiteItem: React.FC<SiteItemProps> = ({
  site,
  isLast,
  onOpenUrl,
  onScan,
  onOpenWpCli,
  onEditSite,
  scanningSite,
}) => {
  const isProvisioning = site.status === 'provisioning';
  const handleOpenDirectory = (): void => {
    window.electron.ipcRenderer.invoke('open-directory', site.path);
  };

  return (
    <li
      className={`group relative bg-gunmetal-300 hover:bg-gunmetal-400 transition-all duration-200 rounded-lg mx-2 mb-3 ${!isLast ? 'mb-3' : 'mb-2'}`}
    >
      <div className="flex justify-between items-center p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center gap-2">
              <div className="bg-emerald shadow-sm rounded-full size-3"></div>
              <h4 className="font-semibold text-md text-seasalt truncate leading-tight">
                Example Site
              </h4>
            </div>
            {site.status === 'provisioning' && (
              <div className="flex items-center gap-2 bg-amber/20 px-2 py-1 rounded-full">
                <Spinner svgClass="size-3" title="Site is being provisioned" />
                <span className="font-medium text-amber text-xs">
                  Provisioning
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-seasalt-400 text-xs">
            <Icon className="text-base" content="󰉋" />
            <button
              type="button"
              onClick={handleOpenDirectory}
              className="hover:text-pumpkin text-left truncate transition-colors cursor-pointer"
              title="Open folder in file manager"
            >
              www/example.test
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(): void => onOpenUrl(site.url)}
            className="group/btn relative bg-gunmetal-500 hover:bg-pumpkin disabled:bg-gunmetal-300 hover:shadow-lg rounded-lg size-10 hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
            title="Open Site"
            disabled={isProvisioning}
          >
            <Icon className="text-2xl" content="" />
          </button>
          <button
            type="button"
            onClick={(): void => onScan(site)}
            className={`group/btn relative size-10 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-lg ${
              scanningSite === site.name || isProvisioning
                ? 'bg-amber/20 cursor-not-allowed'
                : 'bg-gunmetal-500 hover:bg-amber cursor-pointer'
            }`}
            disabled={scanningSite === site.name || isProvisioning}
            title={
              isProvisioning
                ? 'Site is being provisioned'
                : scanningSite === site.name
                  ? 'Scan in progress...'
                  : 'Run SonarQube Scan'
            }
          >
            {scanningSite === site.name ? (
              <Spinner
                svgClass="size-5 text-amber"
                title="Site is being scanned"
              />
            ) : (
              <Icon
                className="text-seasalt group-hover/btn:text-warm-charcoal text-2xl"
                content="󱉶"
              />
            )}
          </button>
          <button
            type="button"
            onClick={(): void => onOpenWpCli(site)}
            className="group/btn relative bg-gunmetal-500 hover:bg-emerald disabled:bg-gunmetal-300 hover:shadow-lg rounded-lg size-10 hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
            title="Run WP-CLI Command"
            disabled={isProvisioning}
          >
            <Icon
              className="text-seasalt group-hover/btn:text-warm-charcoal text-xl"
              content="󰆍"
            />
          </button>
          <button
            type="button"
            onClick={(): void => onEditSite(site)}
            className="group/btn relative bg-gunmetal-500 hover:bg-pumpkin-500 disabled:bg-gunmetal-300 hover:shadow-lg rounded-lg size-10 hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
            title="Edit Site Settings"
            disabled={isProvisioning}
          >
            <Icon
              className="text-seasalt group-hover/btn:text-warm-charcoal text-xl"
              content="󰒓"
            />
          </button>
        </div>
      </div>
    </li>
  );
};

export default SiteItem;
