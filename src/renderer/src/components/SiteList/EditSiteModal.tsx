import type { Site } from '@renderer/env';
import { useEffect, useState } from 'react';
import FormInput from '../ui/FormInput';
import Icon from '../ui/Icon';
import ModalBase from '../ui/ModalBase';

interface EditSiteData {
  aliases: string;
  webRoot: string;
}

interface EditSiteModalProps {
  isOpen: boolean;
  site: Site | null;
  onClose: () => void;
  onSubmit: (site: Site, data: EditSiteData) => void;
  onDelete: (site: Site) => Promise<void> | void;
}

const EditSiteModal: React.FC<EditSiteModalProps> = ({
  isOpen,
  site,
  onClose,
  onSubmit,
  onDelete,
}) => {
  const [editData, setEditData] = useState<EditSiteData>({
    aliases: '',
    webRoot: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && site) {
      setEditData({
        aliases: site.aliases || '',
        webRoot: site.webRoot || '',
      });
      setSubmitting(false);
    }
  }, [isOpen, site]);

  if (!isOpen || !site) {
    return null;
  }

  const originalData: EditSiteData = {
    aliases: site?.aliases || '',
    webRoot: site?.webRoot || '',
  };
  const hasChanges =
    editData.aliases !== originalData.aliases ||
    editData.webRoot !== originalData.webRoot;

  const updateField = (field: keyof EditSiteData, value: string): void => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleWebRootChange = (value: string): void => {
    updateField('webRoot', value.trim().replace(/^\/+|\/+$/g, ''));
  };

  const handleSubmit = (): void => {
    if (submitting || !hasChanges) return;
    setSubmitting(true);
    onSubmit(site, editData);
  };

  const handleDelete = (): void => {
    if (site.status === 'provisioning') return;
    void onDelete(site);
  };

  const renderWebRootHelpText = (): React.ReactNode => (
    <div className="mt-2 text-seasalt text-xs">
      {editData.webRoot ? (
        <>
          Web server will point to www/
          <span className="font-bold text-pumpkin">{site.name}</span>/
          <span className="font-bold text-pumpkin">{editData.webRoot}</span>.
        </>
      ) : (
        'Web server will point to the site root.'
      )}
      <br />
      Site accessible at{' '}
      <span className="font-bold text-pumpkin">{site.url}</span>
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
        disabled={!hasChanges || submitting}
        className="bg-pumpkin hover:bg-pumpkin-600 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-warm-charcoal disabled:text-seasalt-400 transition-colors cursor-pointer disabled:cursor-not-allowed"
      >
        {submitting ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Site Settings"
      footer={footer}
    >
      <div className="bg-gunmetal-400 mb-4 p-3 border-pumpkin border-l-4 rounded-lg">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="text-pumpkin" content="󰌨" />
          <span className="font-semibold text-seasalt text-sm">
            {site.name}
          </span>
        </div>
        <div className="text-seasalt-400 text-xs">{site.path}</div>
      </div>

      <FormInput
        label="Aliases (optional, space-separated)"
        value={editData.aliases}
        onChange={(value) => updateField('aliases', value)}
        placeholder="alias1.test alias2.test"
      />

      <FormInput
        label={`Web Root (optional, relative to site directory e.g. "public", "dist")`}
        value={editData.webRoot}
        onChange={handleWebRootChange}
        placeholder="public (leave blank for site root)"
        helpText={renderWebRootHelpText()}
      />

      <div className="bg-gunmetal-400/60 mt-6 px-4 py-4 border border-gunmetal-600 rounded-lg">
        <h4 className="mb-2 font-semibold text-seasalt text-sm">Danger Zone</h4>
        <p className="mb-3 text-seasalt-400 text-xs">
          Deleting this site removes Docker containers, files, and the database
          snapshot. This action cannot be undone.
        </p>
        <button
          type="button"
          onClick={handleDelete}
          className="bg-crimson hover:bg-crimson/80 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-seasalt disabled:text-seasalt-400 transition-colors cursor-pointer disabled:cursor-not-allowed"
          title="Delete Site"
          disabled={site.status === 'provisioning'}
        >
          Delete Site
        </button>
      </div>
    </ModalBase>
  );
};

export default EditSiteModal;
