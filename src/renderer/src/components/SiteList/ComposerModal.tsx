import type { Site } from '@renderer/env';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import Spinner from '../ui/Spinner';

interface ComposerModalProps {
  isOpen: boolean;
  site: Site | null;
  onClose: () => void;
}

const ComposerModal: React.FC<ComposerModalProps> = ({
  isOpen,
  site,
  onClose,
}) => {
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!isOpen || !site) return;

    setOutput('');
    setError('');
    setLoading(true);

    invoke<{ success: boolean; output: string; error: string }>(
      'run_composer_update',
      { site },
    )
      .then((result) => {
        setOutput(result.output ?? '');
        setError(result.error ?? '');
      })
      .catch((e: unknown) => {
        setError(String(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, site]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, error]);

  const handleClose = (): void => {
    if (loading) return;
    setOutput('');
    setError('');
    onClose();
  };

  if (!isOpen || !site) return null;

  const hasOutput = output || error;

  return (
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-warm-charcoal/70 animate-fade-in">
      <div className="bg-gunmetal-400 shadow-xl p-5 rounded-lg w-[90%] max-w-lg animate-scale-in">
        <h3 className="mt-0 mb-5 text-seasalt">
          Composer Update for <span className="font-bold">{site.name}</span>
        </h3>

        {loading && !hasOutput && (
          <div className="flex justify-center items-center gap-3 py-6">
            <Spinner
              svgClass="size-6 text-pumpkin"
              title="Running composer update..."
            />
            <span className="text-seasalt-400 text-sm">
              Running composer update…
            </span>
          </div>
        )}

        {hasOutput && (
          <div className="mb-5">
            <div className="block mb-1 text-seasalt text-sm">
              Output {loading && <span className="text-amber">●</span>}
            </div>
            <pre
              ref={outputRef}
              className="bg-warm-charcoal-200 p-2.5 border border-gunmetal-600 rounded max-h-96 overflow-auto font-mono text-seasalt text-xs wrap-break-word whitespace-pre-wrap"
            >
              {output && <span className="text-emerald">{output}</span>}
              {error && <span className="text-crimson">{error}</span>}
              {loading && <span className="text-amber">▊</span>}
            </pre>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="bg-gunmetal-500 hover:bg-gunmetal-600 disabled:opacity-50 px-4 py-2 border-0 rounded text-seasalt-400 hover:text-seasalt transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComposerModal;
