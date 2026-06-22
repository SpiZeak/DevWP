import type { Site } from '@renderer/env';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import ModalBase from '../ui/ModalBase';
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
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const outputRef = useRef<HTMLPreElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setOutput('');
      setError('');
      setLoading(false);
      setConfirmed(false);
    }
  }, [isOpen]);

  // Run composer update after user confirms
  useEffect(() => {
    if (!isOpen || !site || !confirmed) return;

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
  }, [isOpen, site, confirmed]);

  // Auto-scroll output as new lines arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: output/error intentional for auto-scroll
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
    <ModalBase
      isOpen={isOpen}
      onClose={handleClose}
      title={`Composer Update — ${site.name}`}
      footer={
        <div className="flex justify-end gap-2.5">
          {hasOutput && !loading && (
            <button
              type="button"
              onClick={() => setConfirmed(false)}
              className="bg-gunmetal-400 hover:bg-gunmetal-300 px-4 py-2 border-0 rounded text-seasalt-300 hover:text-seasalt transition-colors cursor-pointer"
            >
              Run Again
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="bg-gunmetal-500 hover:bg-gunmetal-600 disabled:opacity-50 px-4 py-2 border-0 rounded text-seasalt-400 hover:text-seasalt transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed"
          >
            Close
          </button>
        </div>
      }
    >
      {!confirmed ? (
        <div className="text-center py-4">
          <div className="flex justify-center items-center bg-amber/10 mb-4 rounded-full w-14 h-14 mx-auto">
            <span className="text-amber text-2xl">⚠</span>
          </div>
          <p className="mb-1 text-seasalt">
            Run{' '}
            <code className="bg-gunmetal-500 px-1.5 py-0.5 rounded font-bold text-pumpkin text-sm">
              composer update
            </code>{' '}
            for <span className="font-semibold">{site.name}</span>?
          </p>
          <p className="mb-6 text-seasalt-400 text-xs">
            This will update all Composer dependencies. It may take a moment.
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="bg-gunmetal-500 hover:bg-gunmetal-600 px-4 py-2 rounded text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              className="bg-pumpkin hover:bg-pumpkin-600 px-4 py-2 rounded font-semibold text-warm-charcoal transition-colors cursor-pointer"
            >
              Run Update
            </button>
          </div>
        </div>
      ) : loading && !hasOutput ? (
        <div className="flex justify-center items-center gap-3 py-6">
          <Spinner
            svgClass="size-6 text-pumpkin"
            title="Running composer update..."
          />
          <span className="text-seasalt-400 text-sm">
            Running composer update…
          </span>
        </div>
      ) : hasOutput ? (
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
      ) : null}
    </ModalBase>
  );
};

export default ComposerModal;
