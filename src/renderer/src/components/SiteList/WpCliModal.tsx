import type { Site } from '@renderer/env';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import ModalBase from '../ui/ModalBase';
import Spinner from '../ui/Spinner';

interface WpCliModalProps {
  isOpen: boolean;
  site: Site | null;
  onClose: () => void;
}

const WpCliModal: React.FC<WpCliModalProps> = ({ isOpen, site, onClose }) => {
  const [wpCliCommand, setWpCliCommand] = useState<string>('');
  const [wpCliOutput, setWpCliOutput] = useState<string>('');
  const [wpCliError, setWpCliError] = useState<string>('');
  const [wpCliLoading, setWpCliLoading] = useState<boolean>(false);
  const outputRef = useRef<HTMLPreElement>(null);

  // Auto-scroll output as new lines arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: wpCliOutput/wpCliError intentional for auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [wpCliOutput, wpCliError]);

  if (!isOpen || !site) return null;

  const handleRunWpCli = async (): Promise<void> => {
    try {
      setWpCliLoading(true);
      setWpCliOutput('');
      setWpCliError('');

      const result = await invoke<{
        success: boolean;
        output: string;
        error: string;
      }>('run_wp_cli', {
        request: {
          site: site,
          command: wpCliCommand,
        },
      });

      setWpCliOutput(result.output ?? '');
      setWpCliError(result.error ?? '');
    } catch (e) {
      setWpCliError(String(e));
    } finally {
      setWpCliLoading(false);
    }
  };

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>): void => {
    e.preventDefault();

    if (!wpCliLoading && wpCliCommand.trim()) {
      handleRunWpCli();
    }
  };

  const handleClose = (): void => {
    setWpCliCommand('');
    setWpCliOutput('');
    setWpCliError('');
    onClose();
  };

  const hasOutput = wpCliOutput || wpCliError;

  const footer = (
    <div className="flex justify-end gap-2.5">
      <button
        type="button"
        onClick={handleClose}
        className="bg-gunmetal-500 hover:bg-gunmetal-600 px-4 py-2 border-0 rounded text-seasalt-400 hover:text-seasalt transition-colors duration-200 cursor-pointer"
        disabled={wpCliLoading}
      >
        Cancel
      </button>
      <button
        type="submit"
        form="wp-cli-form"
        className="bg-pumpkin hover:bg-pumpkin-600 disabled:bg-gunmetal-300 px-4 py-2 border-0 rounded text-warm-charcoal disabled:text-seasalt-400 transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed"
        disabled={!wpCliCommand.trim() || wpCliLoading}
      >
        {wpCliLoading ? (
          <Spinner svgClass="size-6" title="Loading WP-CLI response..." />
        ) : (
          'Run'
        )}
      </button>
    </div>
  );

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={handleClose}
      title={`Run WP-CLI Command — ${site.name}`}
      footer={footer}
    >
      <form id="wp-cli-form" onSubmit={handleSubmit}>
        <div className="mb-5">
          <label
            htmlFor="wp-cli-command"
            className="block mb-1 text-seasalt text-sm"
          >
            Command
          </label>
          <input
            id="wp-cli-command"
            type="text"
            className="bg-gunmetal-500 p-2 border border-gunmetal-600 focus:border-pumpkin-500 rounded focus:outline-none w-full text-seasalt"
            value={wpCliCommand}
            onChange={(e): void => setWpCliCommand(e.target.value)}
            placeholder="e.g. plugin list"
            disabled={wpCliLoading}
          />
          <div className="mt-1 text-seasalt-400 text-xs">
            Only enter the command after <span className="font-bold">wp</span>,
            e.g.{' '}
            <code className="bg-gunmetal-500 px-1 rounded">plugin list</code>
          </div>
        </div>
      </form>
      {hasOutput && (
        <div className="mb-5">
          <div className="block mb-1 text-seasalt text-sm">
            Output {wpCliLoading && <span className="text-amber">●</span>}
          </div>
          <pre
            ref={outputRef}
            className="bg-warm-charcoal-200 p-2.5 border border-gunmetal-600 rounded max-h-75 overflow-auto font-mono text-seasalt text-xs wrap-break-word whitespace-pre-wrap"
          >
            {wpCliOutput && <span className="text-emerald">{wpCliOutput}</span>}
            {wpCliError && <span className="text-crimson">{wpCliError}</span>}
            {wpCliLoading && <span className="text-amber">▊</span>}
          </pre>
        </div>
      )}
    </ModalBase>
  );
};

export default WpCliModal;
