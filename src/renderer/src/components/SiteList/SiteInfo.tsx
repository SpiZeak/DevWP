import type { Site } from '@renderer/env';
import { invoke } from '@tauri-apps/api/core';
import Icon from '../ui/Icon';
import Spinner from '../ui/Spinner';
import { useSiteActions } from './SiteActionContext';

interface SiteInfoProps {
  site: Site;
  onBack: () => void;
}

const SiteInfo: React.FC<SiteInfoProps> = ({ site, onBack }) => {
  const { onOpenUrl, onComposerUpdate, onOpenWpCli, onEditSite } =
    useSiteActions();

  const isProvisioning = site.status === 'provisioning';

  const handleOpenDirectory = (): void => {
    void invoke('open_directory', { path: site.path });
  };

  return (
    <div className="animate-fade-in-up w-full">
      {/* Back button & header */}
      <div className="flex justify-between items-center mb-6 w-full">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="group flex justify-center items-center bg-gunmetal-500 hover:bg-pumpkin hover:shadow-lg rounded-lg size-10 hover:scale-105 transition-all duration-200 cursor-pointer"
            title="Back to sites list"
            type="button"
          >
            <Icon
              className="text-seasalt group-hover:text-warm-charcoal text-xl"
              content="󰅁"
            />
          </button>
          <div className="flex justify-center items-center bg-linear-to-br from-pumpkin to-pumpkin-600 rounded-lg w-8 h-8">
            <Icon className="text-warm-charcoal text-lg" content="󰌨" />
          </div>
          <h3 className="font-bold text-seasalt text-2xl truncate max-w-[200px]">
            {site.name}
          </h3>
          {site.status === 'provisioning' && (
            <div className="flex items-center gap-2 bg-amber/20 px-3 py-1 rounded-full">
              <Spinner svgClass="size-3" title="Site is being provisioned" />
              <span className="font-medium text-amber text-xs">
                Provisioning
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Site detail card */}
      <div className="bg-gunmetal-500 shadow-2xl rounded-xl overflow-hidden">
        {/* Info sections */}
        <div className="p-6 space-y-6">
          {/* Site name & status */}
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold text-seasalt text-lg">{site.name}</h4>
              <p className="text-seasalt-400 text-xs mt-0.5">Site Name</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  site.status === 'active'
                    ? 'bg-emerald-500'
                    : site.status === 'provisioning'
                      ? 'bg-amber-500'
                      : 'bg-seasalt-400'
                }`}
              />
              <span className="text-seasalt-300 text-sm capitalize">
                {site.status}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gunmetal-600" />

          {/* Path */}
          <div>
            <div className="flex items-center gap-2 text-seasalt-400 text-xs mb-1.5">
              <Icon className="text-base" content="󰉋" />
              <span>Directory</span>
            </div>
            <button
              type="button"
              onClick={handleOpenDirectory}
              className="bg-gunmetal-400 hover:bg-gunmetal-600 px-3 py-2 rounded-lg w-full text-seasalt hover:text-pumpkin text-left text-sm font-mono transition-colors cursor-pointer"
              title="Open folder in file manager"
            >
              {site.path}
            </button>
          </div>

          {/* URL */}
          <div>
            <div className="flex items-center gap-2 text-seasalt-400 text-xs mb-1.5">
              <Icon className="text-base" content="󰖟" />
              <span>URL</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenUrl(site.url)}
              className="bg-gunmetal-400 hover:bg-pumpkin hover:text-warm-charcoal px-3 py-2 rounded-lg w-full text-seasalt text-left text-sm font-mono transition-colors cursor-pointer"
              title="Open site in browser"
            >
              {site.url}
            </button>
          </div>

          {/* Aliases */}
          {site.aliases && (
            <div>
              <div className="flex items-center gap-2 text-seasalt-400 text-xs mb-1.5">
                <Icon className="text-base" content="󰇘" />
                <span>Aliases</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {site.aliases.split(/[\s,]+/).filter(Boolean).map((alias) => (
                  <span
                    key={alias}
                    className="bg-gunmetal-400 px-2.5 py-1 rounded-md text-seasalt-300 text-xs font-mono"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Web Root */}
          {site.webRoot && (
            <div>
              <div className="flex items-center gap-2 text-seasalt-400 text-xs mb-1.5">
                <Icon className="text-base" content="󰜌" />
                <span>Web Root</span>
              </div>
              <span className="bg-gunmetal-400 px-3 py-2 rounded-lg inline-block text-seasalt-300 text-sm font-mono">
                {site.webRoot}
              </span>
            </div>
          )}

          {/* Multisite */}
          {site.multisite?.enabled && (
            <div>
              <div className="flex items-center gap-2 text-seasalt-400 text-xs mb-1.5">
                <Icon className="text-base" content="󰣺" />
                <span>Multisite</span>
              </div>
              <span className="bg-gunmetal-400 px-3 py-2 rounded-lg inline-block text-emerald-400 text-sm capitalize">
                {site.multisite.type}
              </span>
            </div>
          )}

          {/* Divider before actions */}
          <div className="border-t border-gunmetal-600" />

          {/* Action buttons */}
          <div>
            <p className="text-seasalt-400 text-xs mb-3">Actions</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpenUrl(site.url)}
                disabled={isProvisioning}
                className="flex items-center gap-2 bg-gunmetal-400 hover:bg-pumpkin disabled:bg-gunmetal-300 hover:shadow-lg px-4 py-2.5 rounded-lg hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
                title="Open Site"
              >
                <Icon className="text-seasalt group-hover/btn:text-warm-charcoal text-lg" content="" />
                <span className="text-seasalt text-sm font-medium">Open Site</span>
              </button>

              <button
                type="button"
                onClick={() => onComposerUpdate(site)}
                disabled={isProvisioning}
                className="flex items-center gap-2 bg-gunmetal-400 hover:bg-pumpkin disabled:bg-gunmetal-300 hover:shadow-lg px-4 py-2.5 rounded-lg hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
                title="Run Composer Update"
              >
                <Icon className="text-seasalt text-lg" content="󰏗" />
                <span className="text-seasalt text-sm font-medium">Composer Update</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenWpCli(site)}
                disabled={isProvisioning}
                className="flex items-center gap-2 bg-gunmetal-400 hover:bg-emerald disabled:bg-gunmetal-300 hover:shadow-lg px-4 py-2.5 rounded-lg hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
                title="Run WP-CLI Command"
              >
                <Icon className="text-seasalt text-lg" content="󰆍" />
                <span className="text-seasalt text-sm font-medium">WP-CLI</span>
              </button>

              <button
                type="button"
                onClick={() => onEditSite(site)}
                disabled={isProvisioning}
                className="flex items-center gap-2 bg-gunmetal-400 hover:bg-pumpkin-500 disabled:bg-gunmetal-300 hover:shadow-lg px-4 py-2.5 rounded-lg hover:scale-105 disabled:hover:scale-100 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
                title="Edit Site Settings"
              >
                <Icon className="text-seasalt text-lg" content="󰒓" />
                <span className="text-seasalt text-sm font-medium">Edit</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteInfo;
