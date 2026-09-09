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
  loadLiveCandidate,
  main,
  mergeActivationEnabled,
  releaseQueueLock,
  reviewFromChecks,
  runQueueTick,
  untrustedQueueNotice,
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
    assert.match(second.reason, /same-filesystem/);
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

test('Backlog with a linked open PR is an automation gap, not In Review', () => {
  const decision = assessCandidate({
    pr: readyPr(),
    checks: passingChecks(),
    linear: { identifier: 'AR-41', state: 'Backlog' },
    review: readyReview(),
    acceptance: { ok: true },
    sonar: { ok: true },
    liveMainSha: MAIN,
    activation: true,
  });
  assert.equal(decision.eligible, false);
  assert.equal(decision.merge, false);
  assert.match(decision.reason, /must be In Review \(current: Backlog\)/);
  assert.match(decision.reason, /status automation gap/);
  assert.match(decision.reason, /PR #45/);
});

test('ready-mapped In Development is not merge-eligible In Review', () => {
  const decision = assessCandidate({
    pr: readyPr(),
    checks: passingChecks(),
    linear: { identifier: 'AR-41', state: 'In Development' },
    review: readyReview(),
    acceptance: { ok: true },
    sonar: { ok: true },
    liveMainSha: MAIN,
    activation: true,
  });
  assert.equal(decision.eligible, false);
  assert.match(
    decision.reason,
    /must be In Review \(current: In Development\)/,
  );
  assert.match(
    decision.reason,
    /Owned mapping from this GitHub PR: In Testing/,
  );
  assert.match(decision.reason, /does not move Linear status/);
});

test('ready-mapped In Testing is not merge-eligible In Review', () => {
  const decision = assessCandidate({
    pr: readyPr({ isDraft: false }),
    checks: passingChecks(),
    linear: { identifier: 'AR-41', state: 'In Testing' },
    review: readyReview(),
    acceptance: { ok: true },
    sonar: { ok: true },
    liveMainSha: MAIN,
    activation: true,
  });
  assert.equal(decision.eligible, false);
  assert.match(decision.reason, /must be In Review \(current: In Testing\)/);
  assert.match(
    decision.reason,
    /Owned mapping from this GitHub PR: In Testing/,
  );
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

test('F5: pull_request main does not load GitHub or claim live eligibility', async () => {
  let fetched = false;
  const result = await main(
    {
      EVENT_NAME: 'pull_request',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_TOKEN: 'ghs_test',
      PR_NUMBER: '44',
      REPOSITORY: 'aaryandas/applied-research',
    },
    {
      command: 'untrusted',
      log: { log() {}, error() {} },
      fetchImpl: async () => {
        fetched = true;
        throw new Error('must not fetch');
      },
    },
  );
  assert.equal(result.live, false);
  assert.equal(result.kind, 'untrusted-notice');
  assert.equal(fetched, false);
  assert.match(result.reason, /must not claim live eligibility/);
  assert.match(
    untrustedQueueNotice().reason,
    /concurrency group delivery-queue-live/,
  );
});

test('F5: trusted evaluate loads GitHub/Linear/main/checks and stays unmerged', async () => {
  const calls = [];
  const result = await main(
    {
      TRUSTED_DEFAULT_BRANCH: 'true',
      EVENT_NAME: 'workflow_dispatch',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_DEFAULT_BRANCH: 'main',
      GITHUB_TOKEN: 'ghs_test',
      LINEAR_API_KEY: 'lin_api_test',
      PR_NUMBER: '99',
      REPOSITORY: 'aaryandas/applied-research',
      DELIVERY_MERGE_ACTIVATION: 'false',
    },
    {
      command: 'evaluate',
      log: { log() {}, error() {} },
      fetchImpl: async (url, init) => {
        const href = String(url);
        calls.push(href);
        const json = (body) => ({
          ok: true,
          status: 200,
          async json() {
            return body;
          },
        });
        if (href.includes('/pulls/99/files')) {
          return json([{ filename: 'scripts/delivery-queue.mjs' }]);
        }
        if (href.includes('/pulls/99') && !href.includes('files')) {
          return json({
            state: 'open',
            draft: false,
            html_url: 'https://github.com/aaryandas/applied-research/pull/99',
            body: 'Linear: AR-41',
            head: {
              sha: HEAD,
              ref: 'codex/ar-41-cursor-cloud-orchestration-ce33',
              repo: { full_name: 'aaryandas/applied-research' },
            },
            base: {
              ref: 'main',
              repo: { full_name: 'aaryandas/applied-research' },
            },
          });
        }
        if (href.includes('/git/ref/heads/main')) {
          return json({ object: { sha: MAIN } });
        }
        if (href.includes('/compare/')) {
          return json({ status: 'ahead' });
        }
        if (href.includes('/check-runs')) {
          return json({ check_runs: passingChecks() });
        }
        if (href.includes('api.github.com/graphql')) {
          return json({
            data: {
              repository: {
                pullRequest: {
                  reviewThreads: { nodes: [{ isResolved: true }] },
                },
              },
            },
          });
        }
        if (href.includes('api.linear.app/graphql')) {
          assert.equal(init.method, 'POST');
          return json({
            data: {
              issues: {
                nodes: [
                  {
                    identifier: 'AR-41',
                    state: { name: 'In Review' },
                    attachments: { nodes: [] },
                  },
                ],
              },
            },
          });
        }
        throw new Error(`unexpected fetch ${href}`);
      },
    },
  );
  assert.equal(result.live, true);
  assert.equal(result.merge, false);
  assert.equal(result.eligible, true);
  assert.match(result.serializer, /delivery-queue-live/);
  assert.equal(
    calls.some((href) => href.includes('api.github.com')),
    true,
  );
  assert.equal(
    calls.some((href) => href.includes('api.linear.app')),
    true,
  );
  assert.equal(reviewFromChecks(passingChecks(), HEAD).passed, true);
});

test('loadLiveCandidate refuses pull_request events', async () => {
  await assert.rejects(
    () =>
      loadLiveCandidate({
        TRUSTED_DEFAULT_BRANCH: 'true',
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_TOKEN: 'ghs_test',
        PR_NUMBER: '1',
        REPOSITORY: 'aaryandas/applied-research',
      }),
    /cannot run on pull_request/,
  );
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
