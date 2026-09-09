import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CI_GATE_NAME,
  GITHUB_ACTIONS_APP_ID,
  GITHUB_ACTIONS_APP_SLUG,
  LANE_GUARD_NAME,
  LINEAR_GATE_NAME,
  PARTIAL_ACCEPTANCE,
  REVIEW_CHECK_NAME,
  TRUSTED_REVIEW_JOB_NAME,
  TRUSTED_WORKFLOW_FILE,
  independentReviewArtifactName,
} from './delivery-constants.mjs';
import { createIndependentReviewRunReceipt } from './delivery-trust.mjs';
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
  trustedReviewPublisherOk,
  reviewFromChecks,
  runQueueTick,
  untrustedQueueNotice,
} from './delivery-queue.mjs';

const HEAD = 'cccccccccccccccccccccccccccccccccccccccc';
const MAIN = 'dddddddddddddddddddddddddddddddddddddddd';
const OTHER = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function actionsApp() {
  return { slug: GITHUB_ACTIONS_APP_SLUG, id: GITHUB_ACTIONS_APP_ID };
}

function trustedReviewCheck(sha = HEAD) {
  return {
    id: 9001,
    name: REVIEW_CHECK_NAME,
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/aaryandas/applied-research/runs/9001',
    details_url:
      'https://github.com/aaryandas/applied-research/actions/runs/42',
    app: actionsApp(),
    output: {
      title: 'PASS',
      summary: 'githubRunId=42 is display text, not association',
    },
    independentReviewBinding: {
      ok: true,
      customCheckId: 9001,
      githubRunId: '42',
      workflowPath: TRUSTED_WORKFLOW_FILE,
      event: 'workflow_run',
      jobName: TRUSTED_REVIEW_JOB_NAME,
      headBranch: 'codex/ar-41-cursor-cloud-orchestration-ce33',
      runHeadSha: MAIN,
      nativeJobCheckId: 111,
      passed: true,
      headSha: sha,
    },
  };
}

function passingChecks(sha = HEAD) {
  return [
    {
      name: CI_GATE_NAME,
      head_sha: sha,
      status: 'completed',
      conclusion: 'success',
      app: actionsApp(),
    },
    {
      name: LANE_GUARD_NAME,
      head_sha: sha,
      status: 'completed',
      conclusion: 'success',
      app: actionsApp(),
    },
    {
      name: LINEAR_GATE_NAME,
      head_sha: sha,
      status: 'completed',
      conclusion: 'success',
      app: actionsApp(),
    },
    trustedReviewCheck(sha),
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

test('same-name independent review check without trusted artifact receipt cannot merge', () => {
  const forged = {
    name: REVIEW_CHECK_NAME,
    head_sha: HEAD,
    status: 'completed',
    conclusion: 'success',
    app: { slug: 'github-actions', id: GITHUB_ACTIONS_APP_ID },
  };
  assert.equal(trustedReviewPublisherOk(forged), false);
  assert.equal(reviewFromChecks([forged], HEAD).passed, false);
  const decision = assessCandidate({
    pr: readyPr(),
    checks: passingChecks().map((check) =>
      check.name === REVIEW_CHECK_NAME ? forged : check,
    ),
    linear: { identifier: 'AR-41', state: 'In Review' },
    review: reviewFromChecks([forged], HEAD),
    acceptance: { ok: true },
    sonar: { ok: true },
    liveMainSha: MAIN,
    activation: true,
  });
  assert.equal(decision.eligible, false);
  assert.match(decision.reason, /artifact receipt|Independent Cursor Cloud/);
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

  const missingSonar = bindDeployment({
    mergedMainSha: MAIN,
    liveMainSha: MAIN,
    ci: 'success',
    activation: false,
  });
  assert.equal(missingSonar.halt, true);
  assert.match(missingSonar.reason, /Post-merge hosted Sonar/);
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

test('hosted Sonar is post-merge on exact main; pre-merge requires independent review not PR secrets', () => {
  const premergeApp = evaluateSonar({
    files: ['src/main/index.ts'],
    checks: passingChecks(),
    headSha: HEAD,
    phase: 'premerge',
  });
  assert.equal(premergeApp.ok, true);
  assert.match(premergeApp.reason, /Pre-merge/);
  assert.match(premergeApp.reason, /after merge/);

  const fakePrSonar = evaluateSonar({
    files: ['src/main/index.ts'],
    checks: [
      {
        name: 'Sonar gate',
        head_sha: HEAD,
        status: 'completed',
        conclusion: 'success',
        app: { slug: 'cursor-bot', id: 1 },
      },
    ],
    headSha: HEAD,
    phase: 'premerge',
  });
  assert.equal(fakePrSonar.ok, true);
  assert.equal(fakePrSonar.phase, 'premerge');

  const postmergeStale = evaluateSonar({
    files: ['src/main/index.ts'],
    checks: [],
    headSha: HEAD,
    mainSonar: {
      sha: OTHER,
      conclusion: 'success',
      app: actionsApp(),
      publisher: { workflowPath: '.github/workflows/sonar.yml' },
    },
    phase: 'postmerge',
  });
  assert.equal(postmergeStale.ok, false);
  assert.match(postmergeStale.reason, /Post-merge hosted Sonar/);

  const postmergeOk = evaluateSonar({
    files: ['src/main/index.ts'],
    checks: [],
    headSha: HEAD,
    mainSonar: {
      sha: HEAD,
      conclusion: 'success',
      app: actionsApp(),
      publisher: { workflowPath: '.github/workflows/sonar.yml' },
    },
    phase: 'postmerge',
  });
  assert.equal(postmergeOk.ok, true);

  const fakePublisher = evaluateSonar({
    files: ['src/main/index.ts'],
    checks: [
      {
        name: 'Sonar gate',
        head_sha: HEAD,
        status: 'completed',
        conclusion: 'success',
        app: actionsApp(),
        publisher: { workflowPath: '.github/workflows/forge.yml' },
      },
    ],
    headSha: HEAD,
    phase: 'postmerge',
  });
  assert.equal(fakePublisher.ok, false);

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

test('F5: trusted evaluate binds the custom PR check to a trusted-run artifact receipt', async () => {
  const calls = [];
  const artifactName = independentReviewArtifactName(99, HEAD);
  const receipt = createIndependentReviewRunReceipt({
    prNumber: 99,
    headSha: HEAD,
    customCheckId: 9001,
    githubRunId: 42,
    githubRunAttempt: 1,
    githubJobId: 8,
    criticAgentId: 'bc-11111111-1111-1111-1111-111111111111',
    criticRunId: 'run-22222222-2222-2222-2222-222222222222',
    passed: true,
    status: 'PASS',
  });
  const displayChecks = passingChecks().map((check) =>
    check.name === REVIEW_CHECK_NAME
      ? { ...check, independentReviewBinding: undefined }
      : check,
  );
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
      extractZipFile: () => JSON.stringify(receipt),
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
          return json({ check_runs: displayChecks });
        }
        if (href.includes('/actions/artifacts?name=')) {
          assert.equal(href.includes(encodeURIComponent(artifactName)), true);
          return json({
            total_count: 1,
            artifacts: [
              {
                id: 7,
                name: artifactName,
                expired: false,
                size_in_bytes: 200,
                workflow_run: { id: 42, head_sha: MAIN },
              },
            ],
          });
        }
        if (href.endsWith('/actions/artifacts/7/zip')) {
          return {
            ok: true,
            status: 200,
            async arrayBuffer() {
              return Buffer.from('PK');
            },
          };
        }
        if (href.endsWith('/actions/jobs/8')) {
          return json({
            id: 8,
            name: TRUSTED_REVIEW_JOB_NAME,
            run_id: 42,
            run_attempt: 1,
            status: 'completed',
            conclusion: 'success',
            check_run_url:
              'https://api.github.com/repos/aaryandas/applied-research/check-runs/111',
          });
        }
        if (href.includes('/actions/runs/42/attempts/1/jobs')) {
          return json({
            jobs: [
              {
                id: 8,
                name: TRUSTED_REVIEW_JOB_NAME,
                run_id: 42,
                run_attempt: 1,
                status: 'completed',
                conclusion: 'success',
                check_run_url:
                  'https://api.github.com/repos/aaryandas/applied-research/check-runs/111',
              },
            ],
          });
        }
        if (href.endsWith('/actions/runs/42/attempts/1')) {
          return json({
            id: 42,
            path: TRUSTED_WORKFLOW_FILE,
            event: 'workflow_run',
            name: 'Independent review',
            head_branch: 'codex/ar-41-cursor-cloud-orchestration-ce33',
            head_sha: MAIN,
            run_attempt: 1,
          });
        }
        if (href.includes('/actions/runs/42/jobs')) {
          throw new Error('must not GET latest-attempt jobs');
        }
        if (href.includes('/actions/runs/42')) {
          return json({
            id: 42,
            path: TRUSTED_WORKFLOW_FILE,
            event: 'workflow_run',
            name: 'Independent review',
            head_branch: 'codex/ar-41-cursor-cloud-orchestration-ce33',
            head_sha: MAIN,
          });
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
  assert.equal(result.review.evidence.customCheckId, 9001);
  assert.equal(result.review.evidence.nativeJobCheckId, 111);
  assert.notEqual(
    result.review.evidence.customCheckId,
    result.review.evidence.nativeJobCheckId,
  );
  assert.equal(result.review.evidence.runHeadSha, MAIN);
  assert.notEqual(result.review.evidence.runHeadSha, HEAD);
  assert.equal(
    calls.some((href) => href.includes('/actions/artifacts?name=')),
    true,
  );
  assert.equal(
    calls.some((href) => href.includes('api.linear.app')),
    true,
  );
  assert.equal(reviewFromChecks(passingChecks(), HEAD).passed, true);
});

test('premerge app candidate is eligible without PR-head Sonar when review provenance is trusted', () => {
  const sonar = evaluateSonar({
    files: ['src/main/index.ts'],
    checks: passingChecks(),
    headSha: HEAD,
    mainSonar: null,
    phase: 'premerge',
  });
  assert.equal(sonar.ok, true);
  const decision = assessCandidate({
    pr: readyPr({ files: ['src/main/index.ts'] }),
    checks: passingChecks(),
    linear: { identifier: 'AR-41', state: 'In Review' },
    review: {
      passed: true,
      evidence: { headSha: HEAD },
    },
    acceptance: {
      ok: true,
      reason: 'Nonempty exact-revision MP4 attached',
    },
    sonar,
    liveMainSha: MAIN,
    activation: false,
  });
  assert.equal(decision.eligible, true);
  assert.equal(decision.merge, false);
});

test('same-name review check from another Actions workflow cannot merge', () => {
  const steal = {
    ...trustedReviewCheck(),
    independentReviewBinding: {
      ok: false,
      reason: 'wrong-workflow',
    },
  };
  assert.equal(trustedReviewPublisherOk(steal), false);
  const decision = assessCandidate({
    pr: readyPr(),
    checks: passingChecks().map((check) =>
      check.name === REVIEW_CHECK_NAME ? steal : check,
    ),
    linear: { identifier: 'AR-41', state: 'In Review' },
    review: reviewFromChecks([steal], HEAD),
    acceptance: { ok: true },
    sonar: { ok: true },
    liveMainSha: MAIN,
    activation: true,
  });
  assert.equal(decision.eligible, false);
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
