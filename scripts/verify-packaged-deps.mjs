import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

function usageAndExit(message) {
  if (message) console.error(message);
  console.error(
    'Usage: node scripts/verify-packaged-deps.mjs <path-to-app.asar>',
  );
  process.exit(2);
}

const asarPath = process.argv[2];
if (!asarPath) usageAndExit('Missing app.asar path.');
if (!fs.existsSync(asarPath)) usageAndExit(`app.asar not found: ${asarPath}`);

// @electron/asar is provided via electron-builder toolchain.
const asar = await import('@electron/asar');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devwp-asar-'));
try {
  asar.extractAll(asarPath, tmpRoot);

  const appPackageJsonPath = path.join(tmpRoot, 'package.json');
  if (!fs.existsSync(appPackageJsonPath)) {
    usageAndExit(`Extracted asar does not contain package.json: ${asarPath}`);
  }

  const appPackageJson = JSON.parse(
    fs.readFileSync(appPackageJsonPath, 'utf8'),
  );
  const rootDeps = {
    ...(appPackageJson.dependencies ?? {}),
  };

  const requireFromApp = createRequire(path.join(tmpRoot, 'package.json'));

  /** @type {Set<string>} */
  const visitedPackageJsonPaths = new Set();

  /** @type {Array<{ name: string, baseDir: string, optional: boolean }>} */
  const queue = Object.keys(rootDeps).map((name) => ({
    name,
    baseDir: tmpRoot,
    optional: false,
  }));

  /** @type {Array<{ from: string, dep: string, reason: string }>} */
  const missing = [];

  function findNearestPackageJson(startFileOrDir) {
    let current = fs.statSync(startFileOrDir).isDirectory()
      ? startFileOrDir
      : path.dirname(startFileOrDir);

    while (true) {
      const candidate = path.join(current, 'package.json');
      if (fs.existsSync(candidate)) return candidate;

      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }

  function isBuiltin(moduleName) {
    // builtins can be referenced as "node:fs" as well.
    if (moduleName.startsWith('node:')) return true;
    return builtinModules.includes(moduleName);
  }

  function isTypesOnlyPackage(moduleName) {
    // Some upstream packages incorrectly list @types/* in "dependencies".
    // They are not required at runtime and their absence should not fail releases.
    return moduleName.startsWith('@types/');
  }

  while (queue.length > 0) {
    const { name, baseDir, optional } = queue.pop();

    if (isBuiltin(name)) continue;

    let depPackageJsonPath;
    try {
      const requireFromBase = createRequire(path.join(baseDir, 'package.json'));
      const resolvedEntry = requireFromBase.resolve(name);
      depPackageJsonPath = findNearestPackageJson(resolvedEntry);
      if (!depPackageJsonPath)
        throw new Error(
          `Could not locate package.json for ${name} from ${resolvedEntry}`,
        );
    } catch (err) {
      if (optional) continue;
      missing.push({
        from: baseDir,
        dep: name,
        reason: String(err?.message ?? err),
      });
      continue;
    }

    if (visitedPackageJsonPaths.has(depPackageJsonPath)) continue;
    visitedPackageJsonPaths.add(depPackageJsonPath);

    let depPackageJson;
    try {
      depPackageJson = JSON.parse(fs.readFileSync(depPackageJsonPath, 'utf8'));
    } catch (err) {
      missing.push({
        from: depPackageJsonPath,
        dep: name,
        reason: `Failed to read/parse package.json: ${String(err?.message ?? err)}`,
      });
      continue;
    }

    const depDir = path.dirname(depPackageJsonPath);
    const deps = depPackageJson.dependencies ?? {};
    const optionalDeps = depPackageJson.optionalDependencies ?? {};

    for (const child of Object.keys(deps)) {
      if (isTypesOnlyPackage(child)) continue;
      queue.push({ name: child, baseDir: depDir, optional: false });
    }

    for (const child of Object.keys(optionalDeps)) {
      if (isTypesOnlyPackage(child)) continue;
      queue.push({ name: child, baseDir: depDir, optional: true });
    }
  }

  // Also ensure the app's entrypoint can load its declared deps at least.
  for (const depName of Object.keys(rootDeps)) {
    if (isBuiltin(depName)) continue;
    try {
      requireFromApp.resolve(depName);
    } catch (err) {
      missing.push({
        from: tmpRoot,
        dep: depName,
        reason: `Root dependency not resolvable: ${String(err?.message ?? err)}`,
      });
    }
  }

  if (missing.length > 0) {
    console.error(
      `Missing dependencies in packaged app.asar (${missing.length}):`,
    );
    for (const item of missing.slice(0, 50)) {
      console.error(`- ${item.dep} (from: ${item.from})`);
      console.error(`  ${item.reason}`);
    }
    if (missing.length > 50) {
      console.error(`...and ${missing.length - 50} more`);
    }
    process.exit(1);
  }

  console.log('Packaged dependency verification passed.');
} finally {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
