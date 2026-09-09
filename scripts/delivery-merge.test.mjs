import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assessMerge as assessWithPolicy,
  releaseObservation,
  reconcileReleases,
  changedFilePaths,
  REQUIRED_CHECKS,
  releaseReady,
  runTick,
  normalizeChecks,
  releaseCiState,
} from './delivery-merge.mjs';

const sha = 'a'.repeat(40);
const mainSha = 'b'.repeat(40);
const policy = {
  sha: mainSha,
  config: {
    shared: ['context/**'],
    lanes: {
      auth: ['src/main/auth-*.ts'],
      delivery: ['.github/**', 'scripts/**'],
    },
  },
};
const assessMerge = (pr, checks, trustedPolicy = policy) =>
  assessWithPolicy(pr, checks, trustedPolicy);
function candidate() {
  return {
    number: 42,
    state: 'OPEN',
    isDraft: false,
    isCrossRepository: false,
    author: { login: 'aaryandas', is_bot: false },
    headRefOid: sha,
    mainSha,
    labels: ['lane:auth'],
    headRefName: 'codex/ar-40-auth',
    baseRefName: 'main',
    body: '',
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    upToDate: true,
    files: ['context/next-run.md'],
    reviewDecision: '',
    reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } },
  };
}
const checks = () =>
  REQUIRED_CHECKS.map((name) => ({
    name,
    app: {
      slug:
        name === 'Cursor Automation: Bugbot PR Review'
          ? 'cursor'
          : 'github-actions',
      id: name === 'Cursor Automation: Bugbot PR Review' ? 1210556 : 15368,
    },
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
  }));

function normalized(sha, runs, statuses) {
  const enriched = statuses.map((status, index) => ({
    ...status,
    id: status.id * 100 + index,
    target_url: `https://github.com/aaryandas/applied-research/actions/runs/${status.id * 100 + index}`,
  }));
  const evidence = new Map(
    enriched.map((status) => {
      const path =
        status.context === 'Fable review'
          ? '.github/workflows/claude-review.yml'
          : '.github/workflows/linear-gate.yml';
      return [
        status.id,
        {
          run: {
            id: status.id,
            repository: { full_name: 'aaryandas/applied-research' },
            path,
            head_branch: 'main',
            event: 'pull_request_target',
            status: status.state === 'pending' ? 'in_progress' : 'completed',
            conclusion: status.state === 'pending' ? null : 'success',
          },
          receipt: {
            runId: String(status.id),
            context: status.context,
            state: status.state,
            sha,
            workflowRef: `aaryandas/applied-research/${path}@refs/heads/main`,
            workflowSha: 'b'.repeat(40),
          },
        },
      ];
    }),
  );
  return normalizeChecks(sha, runs, enriched, evidence);
}

test('infrastructure status errors are distinct from product gate failures', () => {
  const statuses = checks();
  statuses.find((check) => check.name === 'Linear gate').conclusion = 'error';
  assert.equal(assessMerge(candidate(), statuses).kind, 'infra');
  statuses.find((check) => check.name === 'Linear gate').conclusion = 'failure';
  assert.equal(assessMerge(candidate(), statuses).kind, 'gate');
  const source = { ...candidate(), files: ['src/main/auth-adapter.ts'] };
  const sonar = {
    name: 'Sonar gate',
    head_sha: sha,
    status: 'completed',
    conclusion: 'error',
  };
  assert.equal(assessMerge(source, [...checks(), sonar]).kind, 'infra');
  sonar.conclusion = 'failure';
  assert.equal(assessMerge(source, [...checks(), sonar]).kind, 'gate');
});

test('requires every successful check on the exact head', () => {
  assert.equal(assessMerge(candidate(), checks()).eligible, true);
  for (const name of REQUIRED_CHECKS) {
    assert.equal(
      assessMerge(
        candidate(),
        checks().filter((c) => c.name !== name),
      ).eligible,
      false,
    );
  }
  const stale = checks();
  stale[0].head_sha = 'b'.repeat(40);
  assert.equal(assessMerge(candidate(), stale).eligible, false);
  const failed = checks();
  failed[0].conclusion = 'failure';
  assert.equal(assessMerge(candidate(), failed).kind, 'gate');
});

test('rejects unsafe or incomplete PR state', () => {
  for (const patch of [
    { isDraft: true },
    { isCrossRepository: true },
    { author: { login: 'dependabot[bot]', is_bot: true } },
    { headRefName: 'codex/no-ticket' },
    { mergeStateStatus: 'BEHIND' },
    { upToDate: false },
    { reviewDecision: 'CHANGES_REQUESTED' },
    {
      reviewThreads: {
        nodes: [{ isResolved: false }],
        pageInfo: { hasNextPage: false },
      },
    },
    { reviewThreads: { nodes: [], pageInfo: { hasNextPage: true } } },
  ])
    assert.equal(
      assessMerge({ ...candidate(), ...patch }, checks()).eligible,
      false,
    );
});

test('pending checks are infrastructure waiting, not a product defect', () => {
  const pending = checks();
  pending[0].status = 'in_progress';
  pending[0].conclusion = null;
  assert.equal(assessMerge(candidate(), pending).kind, 'infra');
});

test('release requires main CI at its exact revision', () => {
  assert.equal(releaseReady(sha, checks()), true);
  assert.equal(releaseReady('b'.repeat(40), checks()), false);
  assert.equal(releaseReady(sha, []), false);
});

test('existing lock prevents any second process or API mutation', () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'delivery-lock-'));
  try {
    writeFileSync(join(stateDir, 'merge.lock'), '{"pid":1}');
    assert.match(runTick({ stateDir, apply: true }).reason, /lock exists/);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test('uncertain prior mutation fails closed without a duplicate request', () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'delivery-state-'));
  try {
    writeFileSync(
      join(stateDir, 'state.json'),
      JSON.stringify({ receipts: [{ number: 42, status: 'merging' }] }),
    );
    assert.match(
      runTick({ stateDir, apply: true }).reason,
      /uncertain outcome/,
    );
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test('mixed Actions checks and latest trusted commit statuses satisfy merge gates', () => {
  const statusNames = ['Fable review', 'Linear gate'];
  const runs = checks().filter((check) => !statusNames.includes(check.name));
  const statuses = statusNames.map((context) => ({
    context,
    state: 'success',
    id: 10,
    creator: { login: 'github-actions[bot]' },
  }));
  assert.equal(
    assessMerge(candidate(), normalized(sha, runs, statuses)).eligible,
    true,
  );
  statuses.push({
    context: 'Fable review',
    state: 'pending',
    id: 11,
    creator: { login: 'github-actions[bot]' },
  });
  assert.match(
    assessMerge(candidate(), normalized(sha, runs, statuses)).reason,
    /Pending check: Fable/,
  );
  statuses.push({
    context: 'Fable review',
    state: 'success',
    id: 12,
    creator: { login: 'untrusted-user' },
  });
  assert.equal(
    assessMerge(candidate(), normalized(sha, runs, statuses)).eligible,
    false,
  );
});

test('source changes require an exact-head hosted Sonar status, never a local receipt', () => {
  const pr = { ...candidate(), files: ['src/main/auth-sdk.ts'] };
  assert.equal(assessMerge(pr, checks()).action, 'needs-sonar-cloud');
  const sonar = {
    name: 'Sonar gate',
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
  };
  assert.equal(assessMerge(pr, [...checks(), sonar]).eligible, true);
  assert.equal(
    assessMerge(pr, [...checks(), { ...sonar, head_sha: 'b'.repeat(40) }])
      .eligible,
    false,
  );
  assert.equal(
    assessMerge(pr, [...checks(), { ...sonar, conclusion: 'failure' }])
      .eligible,
    false,
  );
  assert.equal(
    assessMerge(pr, checks(), {
      sha,
      outcome: 'passed',
      qualityGate: 'OK',
      scanner: 'sonarqube-native',
      analysisId: 'fake',
    }).eligible,
    false,
  );
  assert.equal(
    assessMerge({ ...pr, files: undefined }, checks()).eligible,
    false,
  );
});

test('human PR Bugbot check is accepted only from the verified Cursor app', () => {
  const runs = checks().filter(
    (check) => check.name !== 'Cursor Automation: Bugbot PR Review',
  );
  const bugbot = {
    name: 'Cursor Bugbot',
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
    app: { slug: 'cursor', id: 1210556 },
  };
  assert.equal(
    assessMerge(
      candidate(),
      normalized(
        sha,
        [...runs, bugbot],
        ['Fable review', 'Linear gate'].map((context) => ({
          context,
          id: 1,
          state: 'success',
          creator: { login: 'github-actions[bot]' },
        })),
      ),
    ).eligible,
    true,
  );
  assert.equal(
    assessMerge(
      candidate(),
      normalized(
        sha,
        [...runs, { ...bugbot, app: { slug: 'github-actions', id: 15368 } }],
        ['Fable review', 'Linear gate'].map((context) => ({
          context,
          id: 1,
          state: 'success',
          creator: { login: 'github-actions[bot]' },
        })),
      ),
    ).eligible,
    false,
  );
});

test('completed red main CI is terminal attention rather than perpetual pending', () => {
  assert.equal(releaseCiState(sha, []), 'pending');
  assert.equal(releaseCiState(sha, checks()), 'passed');
  const failed = checks();
  failed[0].conclusion = 'failure';
  assert.equal(releaseCiState(sha, failed), 'failed');
  assert.equal(releaseCiState('b'.repeat(40), failed), 'pending');
});

test('CI, helper and lane checks must be published by GitHub Actions', () => {
  for (const name of [
    'checks / CI gate',
    'Workflow gate rules',
    'Lane guard',
  ]) {
    const forged = checks().map((check) =>
      check.name === name
        ? { ...check, app: { slug: 'untrusted-app', id: 999 } }
        : check,
    );
    assert.equal(assessMerge(candidate(), forged).eligible, false);
    assert.equal(
      normalizeChecks(sha, forged, []).some((check) => check.name === name),
      false,
    );
  }
});

test('PR-owned lane policy and successful Lane guard cannot authorize protected paths', () => {
  const pr = {
    ...candidate(),
    files: ['.github/lanes.json', '.github/workflows/ci.yml'],
    lanePolicy: { lanes: { auth: ['**'] }, shared: ['**'] },
  };
  assert.match(assessMerge(pr, checks()).reason, /outside trusted lane/);
  assert.equal(
    assessMerge({ ...pr, labels: ['lane:delivery'] }, checks()).eligible,
    true,
  );
  assert.equal(assessMerge(pr, checks(), { ...policy, sha }).eligible, false);
  assert.equal(assessMerge(pr, checks(), null).eligible, false);
  for (const labels of [
    null,
    [],
    ['lane:auth', 'lane:delivery'],
    ['lane:invented'],
  ])
    assert.equal(
      assessMerge({ ...candidate(), labels }, checks()).eligible,
      false,
    );
  assert.equal(
    assessMerge(
      {
        ...candidate(),
        files: changedFilePaths([
          { filename: 'context/moved.md', previous_filename: '.github/ci.yml' },
        ]),
      },
      checks(),
    ).eligible,
    false,
  );
});

const releaseRequest = { requestedForSha: sha, at: '2026-09-09T05:00:00.900Z' };
const releaseRun = {
  id: 123,
  head_sha: sha,
  path: '.github/workflows/release.yml',
  event: 'workflow_dispatch',
  head_branch: 'main',
  created_at: '2026-09-09T05:00:00Z',
  status: 'in_progress',
  conclusion: null,
  html_url: 'https://github.com/run/123',
};

test('release observations bind the requested SHA and run without claiming deployment', () => {
  assert.equal(
    releaseObservation(releaseRequest, [releaseRun], []).releaseStatus,
    'pending',
  );
  for (const patch of [
    { head_sha: mainSha },
    { event: 'pull_request' },
    { path: '.github/workflows/forged.yml' },
    { created_at: '2026-09-09T04:59:59Z' },
  ])
    assert.equal(
      releaseObservation(releaseRequest, [{ ...releaseRun, ...patch }], [])
        .runId,
      null,
    );
  const succeeded = releaseObservation(
    releaseRequest,
    [{ ...releaseRun, status: 'completed', conclusion: 'success' }],
    [],
  );
  assert.equal(succeeded.releaseStatus, 'succeeded');
  assert.equal(succeeded.deploymentStatus, 'pending');
  assert.equal(
    releaseObservation({ ...releaseRequest, runId: 999 }, [releaseRun], [])
      .runId,
    999,
  );
  assert.equal(
    releaseObservation(
      releaseRequest,
      [{ ...releaseRun, status: 'completed', conclusion: 'failure' }],
      [],
    ).releaseStatus,
    'failed',
  );
});

test('deployment observations report current environment outcomes separately from installers', () => {
  const runs = [{ ...releaseRun, status: 'completed', conclusion: 'success' }];
  const deployed = [
    { id: 1, environment: 'production', statuses: [{ state: 'success' }] },
  ];
  assert.equal(
    releaseObservation(releaseRequest, runs, deployed).deploymentStatus,
    'succeeded',
  );
  assert.equal(
    releaseObservation(releaseRequest, runs, [
      { ...deployed[0], statuses: [{ state: 'failure' }] },
    ]).deploymentStatus,
    'failed',
  );
  assert.equal(
    releaseObservation(releaseRequest, runs, [
      { ...deployed[0], statuses: [{ state: 'in_progress' }] },
    ]).deploymentStatus,
    'pending',
  );
});

test('uncertain release dispatch remains blocked rather than queried or dispatched again', () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'delivery-release-intent-'));
  try {
    writeFileSync(
      join(stateDir, 'state.json'),
      JSON.stringify({
        receipts: [
          {
            number: 42,
            status: 'merged',
            mergeSha: sha,
            release: { status: 'dispatching', ...releaseRequest },
          },
        ],
      }),
    );
    assert.match(
      runTick({ stateDir, apply: true }).reason,
      /uncertain outcome/,
    );
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test('later ticks query the requested release and report changes once without redispatch', () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'release-observation-'));
  const state = {
    receipts: [{ release: { status: 'requested', ...releaseRequest } }],
  };
  let run = { ...releaseRun };
  const requests = [];
  const read = (path) => {
    requests.push(path);
    if (path === `deployments?sha=${sha}&per_page=20`) return [];
    if (path === 'actions/runs/123') return run;
    if (
      path ===
      `actions/workflows/release.yml/runs?head_sha=${sha}&event=workflow_dispatch&per_page=100`
    )
      return { workflow_runs: [run] };
    assert.fail(`Unexpected API action: ${path}`);
  };
  const tick = () =>
    reconcileReleases({
      state,
      path: join(stateDir, 'state.json'),
      apply: true,
      read,
    });
  try {
    assert.equal(tick().releases[0].releaseStatus, 'pending');
    assert.equal(state.receipts[0].release.runId, 123);
    assert.equal(tick(), null);
    run = { ...run, status: 'completed', conclusion: 'failure' };
    assert.equal(tick().kind, 'attention');
    assert.equal(tick(), null);
    assert.equal(
      requests.filter((path) => path.startsWith('actions/workflows/')).length,
      1,
    );
    assert.equal(state.receipts[0].release.status, 'requested');
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});
