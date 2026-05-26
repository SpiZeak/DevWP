import { useEffect, useMemo, useState } from 'react';
import FormInput from '../ui/FormInput';
import ModalBase from '../ui/ModalBase';
import Toggle from '../ui/Toggle';

export interface NewSiteData {
  domain: string;
  webRoot: string;
  aliases: string;
  multisite: {
    enabled: boolean;
    type: 'subdomain' | 'subdirectory';
  };
  wordpress?: {
    title: string;
    adminUser: string;
    adminPassword: string;
    adminEmail: string;
  };
}

interface CreateSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (siteData: NewSiteData) => void;
}

interface MultisiteOptionProps {
  type: 'subdomain' | 'subdirectory';
  isSelected: boolean;
  onClick: () => void;
  label: string;
  example: string;
}

const MultisiteOption: React.FC<MultisiteOptionProps> = ({
  type,
  isSelected,
  onClick,
  label,
  example,
}) => {
  const baseClasses =
    'flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-all border-2';
  const selectedClasses =
    'border-pumpkin bg-gunmetal-400 text-pumpkin font-semibold';
  const unselectedClasses =
    'border-gunmetal-500 bg-gunmetal-500 hover:bg-gunmetal-400 hover:text-pumpkin hover:border-gunmetal-400';

  return (
    <button
      type="button"
      className={`${baseClasses} ${isSelected ? selectedClasses : unselectedClasses}`}
      onClick={onClick}
    >
      <input
        hidden
        type="radio"
        id={`multisite-${type}`}
        name="multisite-type"
        value={type}
        checked={isSelected}
        readOnly
      />
      <label htmlFor={`multisite-${type}`} className="cursor-pointer">
        {label}
        <span
          className={`ml-1 text-xs ${isSelected ? 'text-pumpkin-300' : 'text-seasalt-300'}`}
        >
          ({example})
        </span>
      </label>
    </button>
  );
};

const CreateSiteModal: React.FC<CreateSiteModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const initialSiteData = useMemo<NewSiteData>(
    () => ({
      domain: 'example.test',
      webRoot: '',
      aliases: '',
      multisite: {
        enabled: false,
        type: 'subdirectory',
      },
    }),
    [],
  );

  const initialWpInstall = useMemo(
    () => ({
      enabled: true,
      title: '',
      adminUser: '',
      adminPassword: '',
      adminEmail: '',
    }),
    [],
  );

  const [newSite, setNewSite] = useState<NewSiteData>(initialSiteData);
  const [wpInstall, setWpInstall] = useState(initialWpInstall);

  useEffect(() => {
    if (!isOpen) {
      setNewSite(initialSiteData);
      setWpInstall(initialWpInstall);
    }
  }, [isOpen, initialSiteData, initialWpInstall]);

  if (!isOpen) return null;

  const formatDomain = (domain: string): string => {
    return /.+\..*$/.test(domain) ? domain : `${domain}.test`;
  };

  const updateSiteField = (
    field: keyof NewSiteData,
    value: string | { enabled: boolean; type: 'subdomain' | 'subdirectory' },
  ) => {
    setNewSite((prev) => ({ ...prev, [field]: value }));
  };

  const updateMultisiteField = (
    field: keyof NewSiteData['multisite'],
    value: boolean | 'subdomain' | 'subdirectory',
  ) => {
    setNewSite((prev) => ({
      ...prev,
      multisite: { ...prev.multisite, [field]: value },
    }));
  };

  const handleWebRootChange = (value: string) => {
    updateSiteField('webRoot', value.trim().replace(/^\/+|\/+$/g, ''));
  };

  const handleSubmit = (): void => {
    const formattedDomain = formatDomain(newSite.domain);
    const siteDataToSend: NewSiteData = {
      ...newSite,
      domain: formattedDomain,
      aliases: newSite.aliases
        .split(' ')
        .filter(Boolean)
        .map(formatDomain)
        .join(' '),
      ...(wpInstall.enabled && {
        wordpress: {
          title: wpInstall.title || formattedDomain,
          adminUser: wpInstall.adminUser,
          adminPassword: wpInstall.adminPassword,
          adminEmail: wpInstall.adminEmail,
        },
      }),
    };
    onSubmit(siteDataToSend);
  };

  const formattedDomain = formatDomain(newSite.domain);
  const isSubmitDisabled = !newSite.domain.replace('.test', '');

  const renderWebRootHelpText = () => (
    <div className="mt-2 text-seasalt text-xs">
      Site will be created in www/
      <span className="font-bold text-pumpkin">{formattedDomain}</span>.
      {newSite.webRoot ? (
        <>
          {' '}
          Web server will point to www/
          <span className="font-bold text-pumpkin">{formattedDomain}</span>/
          <span className="font-bold text-pumpkin">{newSite.webRoot}</span>.
        </>
      ) : (
        ' Web server will point to the site root.'
      )}
      <br />
      Accessible at https://
      <span className="font-bold text-pumpkin">{formattedDomain}</span>
    </div>
  );

  const footer = (
    <div className="flex justify-end gap-2.5">
      <button
        type="button"
        onClick={onClose}
        className="bg-gunmetal-400 hover:bg-gunmetal-300 px-4 py-2 border-0 rounded text-seasalt-300 hover:text-seasalt transition-colors cursor-pointer"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitDisabled}
        className="bg-pumpkin hover:bg-pumpkin-600 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-warm-charcoal disabled:text-seasalt-300 transition-colors cursor-pointer disabled:cursor-not-allowed"
      >
        Create
      </button>
    </div>
  );

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Site"
      maxWidthClass="max-w-lg"
      footer={footer}
    >
      <FormInput
        label="Domain"
        value={newSite.domain}
        onChange={(value) => updateSiteField('domain', value)}
        placeholder="example.test"
        autoFocus
      />

      <FormInput
        label="Aliases (optional, space-separated)"
        value={newSite.aliases}
        onChange={(value) => updateSiteField('aliases', value)}
        placeholder="alias1.test alias2.test"
      />

      <FormInput
        label={`Web Root (optional, relative to site directory e.g. "public", "dist")`}
        value={newSite.webRoot}
        onChange={handleWebRootChange}
        placeholder="public (leave blank for site root)"
        helpText={renderWebRootHelpText()}
      />

      {/* Multisite section */}
      <div className="mb-8 rounded-md">
        <div className="flex items-center gap-2 mb-6">
          <Toggle
            checked={newSite.multisite.enabled}
            onChange={(checked) => updateMultisiteField('enabled', checked)}
          />
          <label
            htmlFor="multisite-enabled-toggle"
            className="ml-3 font-medium text-seasalt hover:text-pumpkin transition-colors cursor-pointer"
            onClick={() =>
              updateMultisiteField('enabled', !newSite.multisite.enabled)
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                updateMultisiteField('enabled', !newSite.multisite.enabled);
              }
            }}
          >
            Enable WordPress Multisite
          </label>
        </div>

        {newSite.multisite.enabled && (
          <div className="flex gap-4">
            <MultisiteOption
              type="subdirectory"
              isSelected={newSite.multisite.type === 'subdirectory'}
              onClick={() => updateMultisiteField('type', 'subdirectory')}
              label="Subdirectory"
              example="example.test/site2"
            />
            <MultisiteOption
              type="subdomain"
              isSelected={newSite.multisite.type === 'subdomain'}
              onClick={() => updateMultisiteField('type', 'subdomain')}
              label="Subdomain"
              example="site2.example.test"
            />
          </div>
        )}
      </div>

      {/* WordPress Installation */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Toggle
            checked={wpInstall.enabled}
            onChange={(checked) =>
              setWpInstall((prev) => ({
                ...prev,
                enabled: checked,
              }))
            }
          />
          <label
            htmlFor="wp-install-toggle"
            className="ml-3 font-medium text-seasalt hover:text-pumpkin transition-colors cursor-pointer"
            onClick={() =>
              setWpInstall((prev) => ({
                ...prev,
                enabled: !prev.enabled,
              }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setWpInstall((prev) => ({
                  ...prev,
                  enabled: !prev.enabled,
                }));
              }
            }}
          >
            Install WordPress
          </label>
        </div>

        {wpInstall.enabled && (
          <div className="bg-gunmetal-400 mt-4 p-4 border border-gunmetal-300/30 rounded-lg">
            <FormInput
              label="Site Title"
              value={wpInstall.title}
              onChange={(value) =>
                setWpInstall((prev) => ({ ...prev, title: value }))
              }
              placeholder={formattedDomain}
            />

            <p className="mb-3 font-semibold text-seasalt-300 text-xs uppercase tracking-wider">
              Admin Credentials
            </p>

            <div className="gap-3 grid grid-cols-2">
              <FormInput
                label="Username"
                value={wpInstall.adminUser}
                onChange={(value) =>
                  setWpInstall((prev) => ({ ...prev, adminUser: value }))
                }
                placeholder="root"
              />
              <FormInput
                label="Email"
                value={wpInstall.adminEmail}
                onChange={(value) =>
                  setWpInstall((prev) => ({ ...prev, adminEmail: value }))
                }
                placeholder="root@example.com"
                type="email"
              />
            </div>

            <FormInput
              label="Password"
              value={wpInstall.adminPassword}
              onChange={(value) =>
                setWpInstall((prev) => ({ ...prev, adminPassword: value }))
              }
              placeholder="root"
              type="password"
            />
          </div>
        )}
      </div>
    </ModalBase>
  );
};

export default CreateSiteModal;
