import { app } from 'electron';

let cachedVerbose: boolean | undefined;

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

export function isVerboseMode(): boolean {
  if (cachedVerbose === undefined) {
    const envFlag = parseBooleanFlag(process.env.DEVWP_VERBOSE);
    const argvFlag = process.argv.some(
      (arg) => arg === '--verbose' || arg === '-v',
    );
    const hasCommandLineSwitch =
      typeof app?.commandLine?.hasSwitch === 'function' &&
      app.commandLine.hasSwitch('verbose');

    cachedVerbose = envFlag || argvFlag || hasCommandLineSwitch;
  }

  return cachedVerbose;
}

export function _resetRuntimeFlagsForTesting(): void {
  cachedVerbose = undefined;
}
