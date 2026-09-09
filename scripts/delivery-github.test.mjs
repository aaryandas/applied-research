import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  GITHUB_ACTIONS_APP_ID,
  GITHUB_ACTIONS_APP_SLUG,
  INDEPENDENT_REVIEW_RECEIPT_FILE,
  INDEPENDENT_REVIEW_RECEIPT_KIND,
  REVIEW_CHECK_NAME,
  TRUSTED_REVIEW_JOB_NAME,
  TRUSTED_WORKFLOW_FILE,
  independentReviewArtifactName,
} from './delivery-constants.mjs';
import {
  bindIndependentReviewDisplay,
  extractNamedFileFromZip,
  parseActionsRunJob,
  parseNativeJobCheckRunId,
  fetchCollaboratorPermission,
} from './delivery-github.mjs';
import { createIndependentReviewRunReceipt } from './delivery-trust.mjs';

const HEAD = 'cccccccccccccccccccccccccccccccccccccccc';
const MAIN = 'dddddddddddddddddddddddddddddddddddddddd';
const AGENT = 'bc-11111111-1111-1111-1111-111111111111';
const RUN = 'run-22222222-2222-2222-2222-222222222222';

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function genuineReceipt(overrides = {}) {
  return createIndependentReviewRunReceipt({
    prNumber: 99,
    headSha: HEAD,
    customCheckId: 9001,
    githubRunId: 42,
    criticAgentId: AGENT,
    criticRunId: RUN,
    passed: true,
    status: 'PASS',
    ...overrides,
  });
}

function genuineDisplayCheck(overrides = {}) {
  return {
    id: 9001,
    name: REVIEW_CHECK_NAME,
    head_sha: HEAD,
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/aaryandas/applied-research/runs/9001',
    details_url:
      'https://github.com/aaryandas/applied-research/actions/runs/42',
    app: { slug: GITHUB_ACTIONS_APP_SLUG, id: GITHUB_ACTIONS_APP_ID },
    output: { summary: 'githubRunId=42 is display text, not association' },
    ...overrides,
  };
}

function mockReviewWorld({
  artifacts,
  run,
  jobs,
  receipt,
  zipStatus = 200,
} = {}) {
  const artifactName = independentReviewArtifactName(99, HEAD);
  const listed = artifacts ?? [
    {
      id: 7,
      name: artifactName,
      expired: false,
      size_in_bytes: 200,
      workflow_run: { id: 42, head_sha: MAIN },
    },
  ];
  const runBody = run ?? {
    id: 42,
    path: TRUSTED_WORKFLOW_FILE,
    event: 'workflow_run',
    name: 'Independent review',
    head_branch: 'codex/ar-41-cursor-cloud-orchestration-ce33',
    head_sha: MAIN,
  };
  const jobBodies = jobs ?? [
    {
      id: 8,
      name: TRUSTED_REVIEW_JOB_NAME,
      run_id: 42,
      status: 'completed',
      conclusion: 'success',
      check_run_url:
        'https://api.github.com/repos/aaryandas/applied-research/check-runs/111',
    },
  ];
  const receiptBody = receipt ?? genuineReceipt();
  return {
    artifactName,
    receiptBody,
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes(`/actions/artifacts?name=`)) {
        return json({ total_count: listed.length, artifacts: listed });
      }
      if (href.endsWith('/actions/artifacts/7/zip')) {
        return {
          ok: zipStatus >= 200 && zipStatus < 300,
          status: zipStatus,
          body: Buffer.from('PK'),
          async arrayBuffer() {
            return Buffer.from('PK');
          },
        };
      }
      if (href.endsWith('/actions/runs/42/jobs?per_page=100')) {
        return json({ jobs: jobBodies });
      }
      if (href.endsWith('/actions/runs/42')) {
        return json(runBody);
      }
      throw new Error(`unexpected ${href}`);
    },
    extractZipFile: () => JSON.stringify(receiptBody),
  };
}

async function bindWith(world, check = genuineDisplayCheck()) {
  return bindIndependentReviewDisplay(check, {
    repository: 'aaryandas/applied-research',
    prNumber: 99,
    headSha: HEAD,
    defaultBranch: 'main',
    token: 'ghs_test',
    fetchImpl: world.fetchImpl,
    extractZipFile: world.extractZipFile,
  });
}

test('custom Checks API html_url is not an Actions run job url', () => {
  assert.equal(
    parseActionsRunJob(
      'https://github.com/aaryandas/applied-research/runs/9001',
    ),
    null,
  );
  assert.deepEqual(
    parseActionsRunJob(
      'https://github.com/aaryandas/applied-research/actions/runs/42/job/8',
    ),
    { runId: '42', jobId: '8' },
  );
  assert.equal(
    parseNativeJobCheckRunId(
      'https://api.github.com/repos/aaryandas/applied-research/check-runs/111',
    ),
    111,
  );
});

test('genuine independent-review binding uses artifact receipt, not details_url', async () => {
  const world = mockReviewWorld();
  const bound = await bindWith(world);
  assert.equal(bound.independentReviewBinding.ok, true);
  assert.equal(bound.independentReviewBinding.customCheckId, 9001);
  assert.equal(bound.independentReviewBinding.nativeJobCheckId, 111);
  assert.notEqual(
    bound.independentReviewBinding.customCheckId,
    bound.independentReviewBinding.nativeJobCheckId,
  );
  assert.equal(bound.independentReviewBinding.githubRunId, '42');
  assert.equal(bound.independentReviewBinding.runHeadSha, MAIN);
  assert.notEqual(bound.independentReviewBinding.runHeadSha, HEAD);
  assert.equal(
    bound.independentReviewBinding.workflowPath,
    TRUSTED_WORKFLOW_FILE,
  );
  assert.equal(bound.independentReviewBinding.jobName, TRUSTED_REVIEW_JOB_NAME);
  assert.equal(bound.independentReviewBinding.headSha, HEAD);
});

test('borrowed trusted run via details_url without that run artifact is rejected', async () => {
  const world = mockReviewWorld({ artifacts: [] });
  let fetchedRun = false;
  const bound = await bindIndependentReviewDisplay(genuineDisplayCheck(), {
    repository: 'aaryandas/applied-research',
    prNumber: 99,
    headSha: HEAD,
    token: 'ghs_test',
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('/actions/runs/')) fetchedRun = true;
      return world.fetchImpl(url);
    },
    extractZipFile: world.extractZipFile,
  });
  assert.equal(bound.independentReviewBinding.ok, false);
  assert.equal(bound.independentReviewBinding.reason, 'missing-artifact');
  assert.equal(fetchedRun, false);
});

test('borrowed artifact from another workflow path is rejected', async () => {
  const world = mockReviewWorld({
    run: {
      id: 42,
      path: '.github/workflows/steal.yml',
      event: 'pull_request',
      head_branch: 'attack',
      head_sha: HEAD,
    },
  });
  const bound = await bindWith(world);
  assert.equal(bound.independentReviewBinding.ok, false);
  assert.equal(bound.independentReviewBinding.reason, 'wrong-workflow');
});

test('receipt for a different custom check id cannot alias this display check', async () => {
  const world = mockReviewWorld({
    receipt: genuineReceipt({ customCheckId: 5555 }),
  });
  const bound = await bindWith(world);
  assert.equal(bound.independentReviewBinding.ok, false);
  assert.equal(
    bound.independentReviewBinding.reason,
    'custom-check-id-mismatch',
  );
});

test('receipt for the wrong PR or SHA is rejected', async () => {
  const wrongPr = mockReviewWorld({
    receipt: genuineReceipt({ prNumber: 7 }),
  });
  assert.equal(
    (await bindWith(wrongPr)).independentReviewBinding.reason,
    'receipt-wrong-pr',
  );
  const wrongSha = mockReviewWorld({
    receipt: genuineReceipt({
      headSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    }),
  });
  assert.equal(
    (await bindWith(wrongSha)).independentReviewBinding.reason,
    'receipt-wrong-sha',
  );
});

test('wrong job identity or unsuccessful job is rejected', async () => {
  const wrongJob = mockReviewWorld({
    jobs: [
      {
        id: 8,
        name: 'something else',
        run_id: 42,
        status: 'completed',
        conclusion: 'success',
        check_run_url:
          'https://api.github.com/repos/aaryandas/applied-research/check-runs/111',
      },
    ],
  });
  assert.equal(
    (await bindWith(wrongJob)).independentReviewBinding.reason,
    'missing-expected-job',
  );
  const failedJob = mockReviewWorld({
    jobs: [
      {
        id: 8,
        name: TRUSTED_REVIEW_JOB_NAME,
        run_id: 42,
        status: 'completed',
        conclusion: 'failure',
        check_run_url:
          'https://api.github.com/repos/aaryandas/applied-research/check-runs/111',
      },
    ],
  });
  assert.equal(
    (await bindWith(failedJob)).independentReviewBinding.reason,
    'job-not-success',
  );
});

test('malformed or missing receipt fails closed', async () => {
  const malformed = mockReviewWorld();
  malformed.extractZipFile = () => '{not-json';
  assert.equal(
    (await bindWith(malformed)).independentReviewBinding.reason,
    'receipt-not-json',
  );
  const missingKind = mockReviewWorld({
    receipt: { ...genuineReceipt(), kind: 'copied-summary' },
  });
  assert.equal(
    (await bindWith(missingKind)).independentReviewBinding.reason,
    'receipt-kind',
  );
  const extractFail = mockReviewWorld();
  extractFail.extractZipFile = () => {
    throw new Error('unzip missing');
  };
  assert.equal(
    (await bindWith(extractFail)).independentReviewBinding.reason,
    'receipt-extract-failed',
  );
});

test('collaborator permission 404 is none, not write', async () => {
  const none = await fetchCollaboratorPermission(
    'aaryandas/applied-research',
    'stranger',
    {
      token: 'ghs_test',
      fetchImpl: async () => ({
        ok: false,
        status: 404,
        async json() {
          return { message: 'Not Found' };
        },
      }),
    },
  );
  assert.equal(none.permission, 'none');
});

test('unzip extracts the official artifact receipt file when unzip exists', () => {
  const zipProbe = spawnSync('zip', ['-v'], { encoding: 'utf8' });
  const unzipProbe = spawnSync('unzip', ['-v'], { encoding: 'utf8' });
  if (zipProbe.error || unzipProbe.error) {
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'ar-receipt-zip-'));
  try {
    const receipt = genuineReceipt();
    const jsonPath = join(dir, INDEPENDENT_REVIEW_RECEIPT_FILE);
    const zipPath = join(dir, 'artifact.zip');
    writeFileSync(jsonPath, JSON.stringify(receipt));
    const zipped = spawnSync('zip', ['-q', '-j', zipPath, jsonPath], {
      encoding: 'utf8',
    });
    assert.equal(zipped.status, 0, zipped.stderr);
    const extracted = extractNamedFileFromZip(
      readFileSync(zipPath),
      INDEPENDENT_REVIEW_RECEIPT_FILE,
    );
    assert.match(extracted, new RegExp(INDEPENDENT_REVIEW_RECEIPT_KIND));
    assert.match(extracted, /"customCheckId":9001/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
