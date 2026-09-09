import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const sha = 'a'.repeat(40);
const repository = 'aaryandas/applied-research';
const result = {
  context: 'Linear gate',
  state: 'success',
  description: 'AR-1: exact-head cloud verification passed',
};

async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'status-cache-'));
  const gateResult = options.result ?? result;
  const workflowPath =
    gateResult.context === 'Sonar gate'
      ? '.github/workflows/sonar.yml'
      : '.github/workflows/linear-gate.yml';
  const previous = {
    ...gateResult,
    creator: { login: 'github-actions[bot]' },
    target_url: `https://github.com/${repository}/actions/runs/123`,
  };
  const run = {
    id: 123,
    repository: { full_name: repository },
    path: workflowPath,
    head_branch: 'main',
    event: 'schedule',
    status: 'completed',
    conclusion: 'success',
  };
  const receipt = {
    sha,
    context: gateResult.context,
    state: gateResult.state,
    runId: '123',
    workflowRef: `${repository}/${workflowPath}@refs/heads/main`,
    workflowSha: 'b'.repeat(40),
    ...options.receipt,
  };
  const filename = `${gateResult.context.toLowerCase().replace(/[^a-z0-9]+/g, '-')}--${sha}.json`;
  writeFileSync(join(directory, filename), JSON.stringify(receipt));
  execFileSync('zip', ['-q', join(directory, 'receipt.zip'), filename], {
    cwd: directory,
  });
  const archive = readFileSync(join(directory, 'receipt.zip'));
  const environmentKeys = [
    'GITHUB_REPOSITORY',
    'GITHUB_RUN_ID',
    'GITHUB_WORKFLOW_REF',
    'GITHUB_WORKFLOW_SHA',
    'RUNNER_TEMP',
  ];
  const priorEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    GITHUB_REPOSITORY: repository,
    GITHUB_RUN_ID: '456',
    GITHUB_WORKFLOW_REF: receipt.workflowRef,
    GITHUB_WORKFLOW_SHA: 'c'.repeat(40),
    RUNNER_TEMP: directory,
  });
  const posts = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(init.body));
      return Response.json({});
    }
    if (String(url).endsWith(`/commits/${sha}/status`))
      return Response.json({ statuses: [previous] });
    if (String(url).endsWith('/actions/runs/123'))
      return Response.json({ ...run, ...options.run });
    if (String(url).includes('/actions/runs/123/artifacts'))
      return Response.json({
        artifacts: [
          {
            id: 321,
            name: 'gate-receipts-123',
            expired: options.expired ?? false,
            expires_at: options.expired
              ? '2020-01-01T00:00:00Z'
              : '2999-01-01T00:00:00Z',
            size_in_bytes: archive.length,
          },
        ],
      });
    if (String(url).endsWith('/actions/artifacts/321/zip'))
      return new Response(archive);
    throw new Error(`Unexpected request ${url}`);
  });
  t.after(() => {
    for (const [key, value] of Object.entries(priorEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  const { publishStatus } = await import(
    `./workflow-api.mjs?test=${directory}`
  );
  return { publishStatus, posts, directory };
}

test('a later reconciliation reuses an identical status only while its original receipt remains trusted', async (t) => {
  const { publishStatus, posts, directory } = await fixture(t);
  await publishStatus(sha, result);
  await publishStatus(sha, result);
  assert.equal(posts.length, 0);
  assert.throws(
    () =>
      readFileSync(
        join(directory, 'gate-receipts', `linear-gate--${sha}.json`),
      ),
    /ENOENT/,
  );
});

for (const [name, options] of [
  ['expired', { expired: true }],
  ['forged', { run: { event: 'pull_request' } }],
  ['mismatched', { receipt: { sha: 'd'.repeat(40) } }],
]) {
  test(`${name} receipt causes an identical status to be republished with fresh provenance`, async (t) => {
    const { publishStatus, posts } = await fixture(t, options);
    await publishStatus(sha, result);
    assert.equal(posts.length, 1);
    assert.equal(
      posts[0].target_url,
      `https://github.com/${repository}/actions/runs/456`,
    );
  });
}

test('an exhausted hosted-Sonar error remains a single trusted status across later ticks', async (t) => {
  const exhausted = {
    context: 'Sonar gate',
    state: 'error',
    description:
      'Hosted Sonar attempt 2 exhausted; inspect infrastructure and dispatch explicit retry',
  };
  const { publishStatus, posts } = await fixture(t, { result: exhausted });
  await publishStatus(sha, exhausted);
  await publishStatus(sha, exhausted);
  assert.equal(posts.length, 0);
});
