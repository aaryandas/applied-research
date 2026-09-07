import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const artifactDirectory = 'release-artifacts';
const assets = readdirSync(artifactDirectory, { recursive: true })
  .filter((file) => /\.(dmg|zip|exe|AppImage)$/.test(file))
  .map((file) => join(artifactDirectory, file));
if (assets.length === 0) throw new Error('No release installers found');
const names = assets.map((file) => basename(file));
if (new Set(names).size !== names.length)
  throw new Error('Duplicate release asset names');
const checksums = assets
  .map((file) => {
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    return `${hash}  ${basename(file)}`;
  })
  .join('\n');
const checksumFile = join(artifactDirectory, 'SHA256SUMS.txt');
writeFileSync(checksumFile, `${checksums}\n`);

const tag = process.env.RELEASE_TAG;
const commit = process.env.GITHUB_SHA;
if (!tag || !commit) throw new Error('Release tag and commit are required');
execFileSync(
  'gh',
  [
    'release',
    'create',
    tag,
    '--verify-tag',
    '--target',
    commit,
    '--draft',
    '--title',
    `Applied Research ${tag}`,
    '--notes',
    'Unsigned development candidate. Not notarized. Review installation and smoke-test results before publishing.',
    ...assets,
    checksumFile,
  ],
  { stdio: 'inherit' },
);
