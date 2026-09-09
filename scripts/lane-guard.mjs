// Fails when a PR labeled lane:<name> changes files outside that lane or the shared allowlist.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { minimatch } from 'minimatch';
import { allowedLanePaths } from './lane-guard-rules.mjs';

const config = JSON.parse(readFileSync('.github/lanes.json', 'utf8'));
const labels = (process.env.LABELS ?? '').split(',').filter(Boolean);
let selection;
try {
  selection = allowedLanePaths(config, labels);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const { lane, allowed } = selection;
const changed = execFileSync(
  'git',
  ['diff', '--name-only', `${process.env.BASE}...${process.env.HEAD}`],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean);
const outside = changed.filter(
  (f) =>
    !allowed.some((g) =>
      minimatch(f, g, { dot: true, matchBase: g.includes('/') === false }),
    ),
);
if (outside.length) {
  console.error(
    `lane:${lane} may not change:\n  ${outside.join('\n  ')}\nMove the change to its owning lane's PR. Only lane:delivery may change workflow files; no coordinator label bypasses the guard.`,
  );
  process.exit(1);
}
console.log(`lane:${lane} ok, ${changed.length} files within lane`);
