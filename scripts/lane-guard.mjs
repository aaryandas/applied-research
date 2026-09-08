// Fails when a PR labeled lane:<name> changes files outside that lane or the shared allowlist.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { minimatch } from 'minimatch';

const config = JSON.parse(readFileSync('.github/lanes.json', 'utf8'));
const labels = (process.env.LABELS ?? '').split(',').filter(Boolean);
const lanes = labels
  .filter((l) => l.startsWith('lane:'))
  .map((l) => l.slice(5));
if (lanes.length !== 1) {
  console.error(
    `Expected exactly one lane:<name> label, found: ${lanes.join(', ') || 'none'}`,
  );
  process.exit(1);
}
const [lane] = lanes;
if (lane === 'integration') process.exit(0); // coordinator merges may touch anything
const allowed = [...(config.lanes[lane] ?? []), ...config.shared];
if (!config.lanes[lane]) {
  console.error(
    `Unknown lane "${lane}". Known: ${Object.keys(config.lanes).join(', ')}`,
  );
  process.exit(1);
}
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
    `lane:${lane} may not change:\n  ${outside.join('\n  ')}\nEither move the change to its owning lane's PR or relabel with lane:contracts / lane:integration and get coordinator review.`,
  );
  process.exit(1);
}
console.log(`lane:${lane} ok, ${changed.length} files within lane`);
