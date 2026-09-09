import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assessMerge,
  REQUIRED_CHECKS,
  releaseReady,
  runTick,
  normalizeChecks,
  releaseCiState,
} from './delivery-merge.mjs';

const sha = 'a'.repeat(40);
function candidate() {
  return {
    number: 42,
    state: 'OPEN',
    isDraft: false,
    isCrossRepository: false,
    author: { login: 'aaryandas', is_bot: false },
    headRefOid: sha,
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
