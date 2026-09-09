import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CI_GATE_NAME,
  LANE_GUARD_NAME,
  LINEAR_GATE_NAME,
  PARTIAL_ACCEPTANCE,
  REVIEW_CHECK_NAME,
} from './delivery-constants.mjs';
import {
  acquireQueueLock,
  assessCandidate,
  bindDeployment,
  captureRetrospective,
  evaluateAcceptance,
  evaluateSonar,
  mergeActivationEnabled,
  releaseQueueLock,
  runQueueTick,
} from './delivery-queue.mjs';

const HEAD = 'cccccccccccccccccccccccccccccccccccccccc';
const MAIN = 'dddddddddddddddddddddddddddddddddddddddd';
const OTHER = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function passingChecks(sha = HEAD) {
  return [
    {
      name: CI_GATE_NAME,
      head_sha: sha,
      status: 'completed',
      conclusion: 'success',
      app: { slug: 'github-actions' },
    },
    {
      name: LANE_GUARD_NAME,
      head_sha: sha,
      status: 'completed',
      conclusion: 'success',
      app: { slug: 'github-actions' },
    },
    {
      name: LINEAR_GATE_NAME,
      head_sha: sha,
      status: 'completed',
      conclusion: 'success',
      app: { slug: 'github-actions' },
    },
    {
      name: REVIEW_CHECK_NAME,
      head_sha: sha,
      status: 'completed',
      conclusion: 'success',
      app: { slug: 'github-actions' },
    },
  ];
}

function readyPr(overrides = {}) {
  return {
    state: 'OPEN',
    isDraft: false,
    isCrossRepository: false,
    baseRefName: 'main',
    headRefName: 'codex/ar-41-cursor-cloud-orchestration-ce33',
    headRefOid: HEAD,
    mainSha: MAIN,
    upToDate: true,
    body: 'Linear: AR-41',
    files: ['scripts/delivery-review.mjs', 'context/next-run.md'],
    reviewThreads: { nodes: [{ isResolved: true }] },
    ...overrides,
  };
}

function readyReview() {
  return {
    passed: true,
    evidence: {
      headSha: HEAD,
      agentId: 'bc-11111111-1111-1111-1111-111111111111',
    },
  };
}

test('merge activation defaults off', () => {
  assert.equal(mergeActivationEnabled({}), false);
  assert.equal(
    mergeActivationEnabled({ DELIVERY_MERGE_ACTIVATION: 'true' }),
    true,
  );
});

test('ready delivery candidate stays unmerged while activation is off', () => {
  const decision = assessCandidate({
    pr: readyPr(),
    checks: passingChecks(),
    linear: { identifier: 'AR-41', state: 'In Review' },
    review: readyReview(),
    acceptance: { ok: true },
    sonar: { ok: true },
    liveMainSha: MAIN,
    activation: false,
  });
  assert.equal(decision.eligible, true);
  assert.equal(decision.merge, false);
  assert.match(decision.reason, /activation is off/);
});

test('changed main invalidates eligibility', () => {
  const decision = assessCandidate({
    pr: readyPr({ mainSha: MAIN }),
    checks: passingChecks(),
    linear: { identifier: 'AR-41', state: 'In Review' },
    review: readyReview(),
    acceptance: { ok: true },
    sonar: { ok: true },
    liveMainSha: OTHER,
    activation: true,
  });
  assert.equal(decision.eligible, false);
  assert.match(decision.reason, /Main moved/);
});

test('stale independent review SHA cannot merge', () => {
  const decision = assessCandidate({
    pr: readyPr(),
    checks: passingChecks(),
    linear: { identifier: 'AR-41', state: 'In Review' },
    review: { passed: true, evidence: { headSha: OTHER } },
    acceptance: { ok: true },
    sonar: { ok: true },
    liveMainSha: MAIN,
    activation: true,
  });
  assert.equal(decision.eligible, false);
  assert.match(decision.reason, /Independent Cursor Cloud/);
});

test('concurrent queue ticks refuse the second candidate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ar-delivery-lock-'));
  try {
    const first = acquireQueueLock(dir);
    assert.equal(first.ok, true);
    const second = acquireQueueLock(dir);
    assert.equal(second.ok, false);
    assert.match(second.reason, /one merge evaluation at a time/);
    releaseQueueLock(first);
    const third = acquireQueueLock(dir);
    assert.equal(third.ok, true);
    releaseQueueLock(third);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('queue rechecks head and main before apply', () => {
  let loads = 0;
  const result = runQueueTick({
    candidates: [{ number: 99 }],
    lockDir: join(tmpdir(), `ar-delivery-tick-${process.pid}`),
    activation: true,
    applyMerge: () => {
      throw new Error('must not merge after main moved');
    },
    load() {
      loads += 1;
      const liveMainSha = loads === 1 ? MAIN : OTHER;
      return {
        pr: readyPr({ mainSha: liveMainSha, upToDate: true }),
        checks: passingChecks(),
        linear: { identifier: 'AR-41', state: 'In Review' },
        review: readyReview(),
        acceptance: { ok: true },
        sonar: { ok: true },
        liveMainSha,
      };
    },
  });
  assert.equal(result.kind, 'infra');
  assert.match(result.reason, /main changed/);
});

test('failed deployment binds to exact main SHA and halts', () => {
  const failedCi = bindDeployment({
    mergedMainSha: MAIN,
    liveMainSha: MAIN,
    ci: 'failure',
    sonar: 'success',
    activation: true,
  });
  assert.equal(failedCi.halt, true);
  assert.match(failedCi.reason, /Main CI/);

  const drifted = bindDeployment({
    mergedMainSha: MAIN,
    liveMainSha: OTHER,
    ci: 'success',
    sonar: 'success',
    activation: true,
  });
  assert.equal(drifted.halt, true);
  assert.match(drifted.reason, /halt for regression/);

  const held = bindDeployment({
    mergedMainSha: MAIN,
    liveMainSha: MAIN,
    ci: 'success',
    sonar: 'success',
    activation: false,
  });
  assert.equal(held.ok, true);
  assert.equal(held.dispatched, false);
});

test('partial AR-17/19/24 recordings are not PASS', () => {
  assert.match(PARTIAL_ACCEPTANCE['AR-17'], /insight save/);
  const stale = evaluateAcceptance({
    ticket: 'AR-17',
    files: ['src/renderer/reader/Reader.tsx'],
    headSha: HEAD,
    attachments: [
      {
        title: 'AR-17 demo.mp4',
        contentType: 'video/mp4',
        size: 12_000,
        url: 'https://uploads.linear.app/old.mp4',
      },
    ],
  });
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /partial proof/);

  const empty = evaluateAcceptance({
    ticket: 'AR-19',
    files: ['src/renderer/practical/Practical.tsx'],
    headSha: HEAD,
    attachments: [],
  });
  assert.equal(empty.ok, false);

  const fresh = evaluateAcceptance({
    ticket: 'AR-24',
    files: ['src/renderer/explanations/Scene.tsx'],
    headSha: HEAD,
    attachments: [
      {
        title: `AR-24 ${HEAD} demo.mp4`,
        contentType: 'video/mp4',
        size: 44_000,
        url: 'https://uploads.linear.app/new.mp4',
      },
    ],
  });
  assert.equal(fresh.ok, true);
});

test('hosted Sonar stays required for application files and is not waived', () => {
  const waiting = evaluateSonar({
    files: ['src/main/index.ts'],
    checks: passingChecks(),
    headSha: HEAD,
  });
  assert.equal(waiting.ok, false);
  assert.match(waiting.reason, /hosted Sonar/);

  const delivery = evaluateSonar({
    files: ['scripts/delivery-queue.mjs'],
    checks: [],
    headSha: HEAD,
  });
  assert.equal(delivery.ok, true);

  const overlap = evaluateSonar({
    files: ['.github/workflows/sonar.yml'],
    checks: [],
    headSha: HEAD,
  });
  assert.equal(overlap.ok, false);
});

test('merge_group events are not reviewed-head proof', () => {
  const decision = assessCandidate({
    pr: readyPr(),
    checks: passingChecks(),
    linear: { identifier: 'AR-41', state: 'In Review' },
    review: readyReview(),
    acceptance: { ok: true },
    sonar: { ok: true },
    liveMainSha: MAIN,
    activation: true,
    eventName: 'merge_group',
  });
  assert.equal(decision.eligible, false);
  assert.match(decision.reason, /merge-group/);
});

test('retrospective requires a real failure, cause, and bounded fix', () => {
  const note = captureRetrospective({
    sha: MAIN,
    failure: 'Independent review used Fable after credits exhausted',
    cause: 'claude-review.yml still invoked claude-fable-5-1',
    processFix:
      'Replace that workflow with authenticated Cursor Cloud Grok 4.6 Extra High retrieval and keep merge activation off',
  });
  assert.equal(note.sha, MAIN);
  assert.match(note.processFix, /Cursor Cloud/);
  assert.throws(() => captureRetrospective({ failure: 'x' }), /actual failure/);
});

test('lock directory is created with owner-only mode intent', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'ar-delivery-parent-'));
  const dir = join(parent, 'nested');
  await mkdir(parent, { recursive: true });
  const lock = acquireQueueLock(dir);
  assert.equal(lock.ok, true);
  await writeFile(join(dir, 'note.txt'), 'ok');
  releaseQueueLock(lock);
  await rm(parent, { recursive: true, force: true });
});
