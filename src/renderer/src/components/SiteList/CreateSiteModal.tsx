import { useEffect, useState } from 'react';

export interface NewSiteData {
  domain: string;
  webRoot: string;
  aliases: string;
  multisite: {
    enabled: boolean;
    type: 'subdomain' | 'subdirectory';
  };
}

interface CreateSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (siteData: NewSiteData) => void;
}

interface FormInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  helpText?: React.ReactNode;
}

interface MultisiteOptionProps {
  type: 'subdomain' | 'subdirectory';
  isSelected: boolean;
  onClick: () => void;
  label: string;
  example: string;
}

const FormInput: React.FC<FormInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  helpText,
}) => {
  const inputId = `input-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="mb-5">
      <label htmlFor={inputId} className="block mb-1 text-sm">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gunmetal-400 p-2 border border-gunmetal-500 focus:border-pumpkin rounded focus:outline-none focus:ring-1 focus:ring-pumpkin w-full text-seasalt transition-colors"
        placeholder={placeholder}
      />
      {helpText && helpText}
    </div>
  );
};

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
  const initialSiteData: NewSiteData = {
    domain: 'example.test',
    webRoot: '',
    aliases: '',
    multisite: {
      enabled: false,
      type: 'subdirectory',
    },
  };

  const [newSite, setNewSite] = useState<NewSiteData>(initialSiteData);

  useEffect(() => {
    if (!isOpen) {
      setNewSite(initialSiteData);
    }
  }, [isOpen]);

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
    const siteDataToSend = {
      ...newSite,
      domain: formatDomain(newSite.domain),
      aliases: newSite.aliases
        .split(' ')
        .filter(Boolean)
        .map(formatDomain)
        .join(' '),
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

  return (
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-warm-charcoal/70">
      <div className="bg-gunmetal-500 shadow-xl p-5 rounded-lg w-[90%] max-w-lg">
        <h3 className="mt-0 mb-5">Create New Site</h3>

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
            <label className="inline-block relative mr-2 w-11 h-6">
              <input
                type="checkbox"
                id="multisite-enabled"
                checked={newSite.multisite.enabled}
                onChange={(e) =>
                  updateMultisiteField('enabled', e.target.checked)
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
      </div>
    </div>
  );
};

export default CreateSiteModal;
