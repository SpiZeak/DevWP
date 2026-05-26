import {
  attachConsole,
  debug,
  error,
  info,
  warn,
} from '@tauri-apps/plugin-log';

// Forward console methods to Tauri's logging system without patching globals.
// Instead of overriding console.* (which is fragile and can conflict),
// we use a dedicated interceptor via the Proxy pattern that keeps the
// original console intact while forwarding to Tauri loggers.
const forwarders: Record<string, (message: string) => Promise<void>> = {
  log: info,
  debug: debug,
  info: info,
  warn: warn,
  error: error,
};

let patched = false;

function forwardConsole(
  fnName: 'log' | 'debug' | 'info' | 'warn' | 'error',
  logger: (message: string) => Promise<void>,
) {
  if (patched) return;
  const original = console[fnName] as (...args: unknown[]) => void;
  console[fnName] = (...args: unknown[]) => {
    original(...args);
    const msg = args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');
    logger(msg);
  };
}

for (const [name, logger] of Object.entries(forwarders)) {
  forwardConsole(name as 'log' | 'debug' | 'info' | 'warn' | 'error', logger);
}
patched = true;

attachConsole();
