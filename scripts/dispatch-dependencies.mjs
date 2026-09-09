import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const INSTALL_RESERVATION_BYTES = 1_000_000_000;
export const FREE_SPACE_FLOOR_BYTES = 2_000_000_000;
const REQUIRED_MODULES = [
  'typescript/bin/tsc',
  'eslint/bin/eslint.js',
  'prettier/bin/prettier.cjs',
  '@electron/rebuild/lib/cli.js',
  'electron/package.json',
];

export function canSeedDependencies({
  platform,
  sameFilesystem,
  apfs,
  locksMatch,
  modulesComplete,
}) {
  return (
    platform === 'darwin' &&
    sameFilesystem &&
    apfs &&
    locksMatch &&
    modulesComplete
  );
}
export function canReserveInstall({ freeBytes, uninstalledWorkers }) {
  return (
    freeBytes >=
    FREE_SPACE_FLOOR_BYTES +
      INSTALL_RESERVATION_BYTES * (uninstalledWorkers + 1)
  );
}
function isApfs(path) {
  const mounts = execFileSync('/sbin/mount', [], {
    encoding: 'utf8',
    timeout: 5000,
  })
    .split('\n')
    .map((line) => line.match(/^.+ on (.+) \(([^)]+)\)$/))
    .filter(Boolean)
    .filter(
      (match) =>
        match[1] === '/' ||
        path === match[1] ||
        path.startsWith(`${match[1]}/`),
    )
    .sort((a, b) => b[1].length - a[1].length);
  return mounts[0]?.[2].split(',')[0] === 'apfs';
}
export function seedDependencies({ root, worktree }) {
  const destination = join(worktree, 'node_modules');
  if (existsSync(destination)) return { status: 'existing' };
  const source = join(root, 'node_modules');
  const sourceLock = readFileSync(join(root, 'package-lock.json'));
  const targetLock = readFileSync(join(worktree, 'package-lock.json'));
  const lockHash = createHash('sha256').update(targetLock).digest('hex');
  const eligible = canSeedDependencies({
    platform: process.platform,
    sameFilesystem: statSync(root).dev === statSync(worktree).dev,
    apfs: process.platform === 'darwin' && isApfs(root),
    locksMatch: sourceLock.equals(targetLock),
    modulesComplete: REQUIRED_MODULES.every((module) =>
      existsSync(join(source, module)),
    ),
  });
  if (!eligible) return { status: 'unseeded', lockHash };
  try {
    // cp -c requests clonefile; same-device APFS avoids its cross-filesystem full-copy fallback.
    execFileSync('/bin/cp', ['-cR', source, destination], {
      timeout: 120_000,
      stdio: 'pipe',
    });
    if (
      !REQUIRED_MODULES.every((module) => existsSync(join(destination, module)))
    )
      throw new Error('Incomplete dependency clone.');
    return {
      status: 'seeded',
      method: 'apfs-clonefile',
      lockHash,
      seededAt: new Date().toISOString(),
    };
  } catch {
    // This destination did not exist before this attempt; never remove an existing installation.
    rmSync(destination, { recursive: true, force: true });
    return {
      status: 'unseeded',
      reason: 'Dependency clone failed; installation reservation required.',
      lockHash,
    };
  }
}
