import { listen } from '@tauri-apps/api/event';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface BuildLogProps {
  /** Whether any service is currently building */
  isBuilding: boolean;
}

/** Strip ANSI escape codes from a string */
function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI stripping
  return str.replace(/\x1B\[[0-9;]*[mGKHFABCDJsu]/g, '').replace(/\r/g, '');
}

const BuildLog: React.FC<BuildLogProps> = ({ isBuilding }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasBuilding = useRef(false);

  // Clear logs when a new build cycle starts
  useEffect(() => {
    if (isBuilding && !wasBuilding.current) {
      setLogs([]);
      setIsOpen(true);
    }
    wasBuilding.current = isBuilding;
  }, [isBuilding]);

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;

    const setup = async () => {
      unlistenFn = await listen<{ service_name: string; line: string }>(
        'docker-log',
        (event) => {
          const { service_name, line } = event.payload;
          const cleaned = stripAnsi(line).trim();
          if (!cleaned) return;
          const formatted = `[${service_name}] ${cleaned}`;
          setLogs((prev) => {
            const next = [...prev, formatted];
            return next.length > 500 ? next.slice(-500) : next;
          });
        },
      );
    };

    setup();
    return () => {
      unlistenFn?.();
    };
  }, []);

  // Auto-scroll to bottom when new lines arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: logs intentional for auto-scroll
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, logs]);

  if (!isBuilding && logs.length === 0) return null;

  return (
    <div className="bg-gunmetal-600 mt-4 rounded-lg overflow-hidden animate-fade-in-up">
      <button
        type="button"
        className="flex justify-between items-center hover:bg-gunmetal-500 px-3 py-2 w-full text-left transition-colors"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="build-log-content"
      >
        <span className="font-medium text-seasalt text-sm">
          {isBuilding ? 'Build Output' : 'Build Output (complete)'}
        </span>
        <span
          className="text-seasalt-400 text-xs transition-transform duration-200"
          style={{
            display: 'inline-block',
            transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        >
          ▾
        </span>
      </button>
      <div
        ref={scrollRef}
        id="build-log-content"
        className="overflow-y-auto font-mono text-green-400 text-xs leading-relaxed transition-[max-height,padding] duration-300 ease-in-out"
        style={{
          maxHeight: isOpen ? '13rem' : '0',
          padding: isOpen ? '0.5rem 0.75rem' : '0 0.75rem',
        }}
      >
        {logs.length === 0 ? (
          <span className="text-seasalt-400">Waiting for output…</span>
        ) : (
          logs.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: log lines have no stable id
            <div key={i} className="break-all whitespace-pre-wrap">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default BuildLog;
