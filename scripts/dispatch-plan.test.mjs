import assert from 'node:assert/strict';
import test from 'node:test';
import { TARGET_TIME, planDispatch } from './dispatch-plan.mjs';
const now = Date.parse('2026-09-09T01:00:00Z');
const issue = (number, extra = {}) => ({
  id: `id-${number}`,
  identifier: `AR-${number}`,
  status: 'Todo',
  title: `Ticket ${number}`,
  description: 'Acceptance: behavior works',
  labels: [],
  blockedBy: [],
  lane: 'lane:delivery',
  priority: 0,
  createdAt: '2026-09-08T00:00:00Z',
  ...extra,
});
const plan = (issues, claims = {}, time = now) =>
  planDispatch({
    snapshot: { generatedAt: new Date(time).toISOString(), issues },
    claims,
    now: time,
  });
test('caps total pipeline at ten, including preexisting testing and review', () => {
  const result = plan([
    issue(1, { status: 'In Testing', activeRun: true }),
    issue(2, { status: 'In Review', activeRun: true }),
    ...Array.from({ length: 12 }, (_, i) => issue(i + 3)),
  ]);
  assert.equal(result.selected.length, 8);
});
test('claims survive repeated ticks and missing snapshot records', () => {
  const result = plan([issue(1), issue(2)], {
    'AR-1': { identifier: 'AR-1' },
    'AR-99': { identifier: 'AR-99' },
  });
  assert.deepEqual(
    result.selected.map((x) => x.identifier),
    ['AR-2'],
  );
  assert.equal(result.slots, 8);
});
test('sorts priority then age then identifier and excludes blocked, epic and playbook', () => {
  const result = plan([
    issue(1, { labels: ['Epic'] }),
    issue(2, { labels: ['Playbook'] }),
    issue(3, { blockedBy: ['AR-99'] }),
    issue(4),
    issue(5, { priority: 1 }),
    issue(6, { priority: 1, createdAt: '2026-09-07' }),
  ]);
  assert.deepEqual(
    result.selected.map((x) => x.identifier),
    ['AR-6', 'AR-5', 'AR-4'],
  );
});
test('only Done dependencies release a ticket', () => {
  assert.equal(
    plan([issue(1, { blockedBy: ['AR-2'] }), issue(2, { status: 'Canceled' })])
      .selected.length,
    0,
  );
  assert.equal(
    plan([issue(1, { blockedBy: ['AR-2'] }), issue(2, { status: 'Done' })])
      .selected.length,
    1,
  );
});
test('continues launching after target time when explicitly authorized', () => {
  assert.equal(
    plan([issue(1)], {}, Date.parse(TARGET_TIME)).selected.length,
    1,
  );
});
test('stale snapshots fail closed', () => {
  assert.throws(
    () =>
      planDispatch({
        snapshot: { generatedAt: '2026-09-08T00:00:00Z', issues: [] },
        now,
      }),
    /Refresh Linear/,
  );
});

test('reviewed checkpoint releases code work without marking prerequisite Done', () => {
  const result = plan([
    issue(1, {
      blockedBy: ['AR-2'],
      prerequisiteCheckpoints: [
        {
          identifier: 'AR-2',
          revision: 'abcdef1',
          evidence: 'Reviewed frozen public interface',
        },
      ],
    }),
    issue(2, { status: 'In Review' }),
  ]);
  assert.equal(result.selected.length, 1);
});
test('legacy statuses without activeRun do not consume this pipeline', () => {
  assert.equal(plan([issue(1, { status: 'In Testing' }), issue(2)]).slots, 10);
});

test('repeated real ticks preserve a single durable claim before Linear acknowledgment', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, readFileSync, rmSync, writeFileSync } =
    await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const directory = mkdtempSync(join(tmpdir(), 'dispatch-claim-test-'));
  const snapshotPath = join(directory, 'snapshot.json');
  writeFileSync(
    snapshotPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      issues: [issue(1)],
    }),
  );
  const tick = () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL('./dispatch.mjs', import.meta.url)),
          'tick',
          '--state-dir',
          directory,
          '--snapshot',
          snapshotPath,
        ],
        { encoding: 'utf8' },
      ),
    );
  try {
    const first = tick();
    const claimed = readFileSync(join(directory, 'claims.json'), 'utf8');
    const repeated = tick();
    assert.equal(first.events[0].type, 'transition');
    assert.equal(repeated.events[0].to, 'In Development');
    assert.equal(readFileSync(join(directory, 'claims.json'), 'utf8'), claimed);
    assert.equal(repeated.claims.length, 1);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('dependency cloning requires same-filesystem APFS, equal locks and complete installation', async () => {
  const { canSeedDependencies } = await import('./dispatch-dependencies.mjs');
  const ready = {
    platform: 'darwin',
    sameFilesystem: true,
    apfs: true,
    locksMatch: true,
    modulesComplete: true,
  };
  assert.equal(canSeedDependencies(ready), true);
  for (const key of ['sameFilesystem', 'apfs', 'locksMatch', 'modulesComplete'])
    assert.equal(canSeedDependencies({ ...ready, [key]: false }), false);
  assert.equal(canSeedDependencies({ ...ready, platform: 'linux' }), false);
});
test('unseeded workers reserve one gigabyte each above the free-space floor', async () => {
  const { canReserveInstall } = await import('./dispatch-dependencies.mjs');
  assert.equal(
    canReserveInstall({ freeBytes: 4_000_000_000, uninstalledWorkers: 1 }),
    true,
  );
  assert.equal(
    canReserveInstall({ freeBytes: 3_999_999_999, uninstalledWorkers: 1 }),
    false,
  );
});

test(
  'APFS seed copies independently and records the exact lock hash',
  { skip: process.platform !== 'darwin' },
  async () => {
    const { seedDependencies } = await import('./dispatch-dependencies.mjs');
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } =
      await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join, dirname } = await import('node:path');
    const directory = mkdtempSync(join(tmpdir(), 'dispatch-clone-test-'));
    const root = join(directory, 'source');
    const worktree = join(directory, 'target');
    mkdirSync(root);
    mkdirSync(worktree);
    for (const path of [root, worktree])
      writeFileSync(join(path, 'package-lock.json'), '{}');
    const required = [
      'typescript/bin/tsc',
      'eslint/bin/eslint.js',
      'prettier/bin/prettier.cjs',
      '@electron/rebuild/lib/cli.js',
      'electron/package.json',
    ];
    for (const relative of required) {
      const path = join(root, 'node_modules', relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, 'original');
    }
    try {
      const receipt = seedDependencies({ root, worktree });
      assert.equal(receipt.status, 'seeded');
      assert.match(receipt.lockHash, /^[a-f0-9]{64}$/);
      writeFileSync(
        join(worktree, 'node_modules/typescript/bin/tsc'),
        'changed',
      );
      assert.equal(
        readFileSync(join(root, 'node_modules/typescript/bin/tsc'), 'utf8'),
        'original',
      );
      assert.equal(seedDependencies({ root, worktree }).status, 'existing');
    } finally {
      rmSync(directory, { recursive: true });
    }
  },
);
