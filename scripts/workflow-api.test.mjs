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
  const receiptFiles = [filename];
  writeFileSync(join(directory, filename), JSON.stringify(receipt));
  for (const extraSha of options.extraShas ?? []) {
    const extraName = filename.replace(sha, extraSha);
    receiptFiles.push(extraName);
    writeFileSync(
      join(directory, extraName),
      JSON.stringify({ ...receipt, sha: extraSha }),
    );
  }
  execFileSync('zip', ['-q', join(directory, 'receipt.zip'), ...receiptFiles], {
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
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push(String(url));
    if (options.secondaryLimit)
      return Response.json(
        { message: 'You have exceeded a secondary rate limit.' },
        {
          status: 403,
          headers: { 'x-ratelimit-remaining': '42' },
        },
      );

    if (
      options.rateLimited ||
      (options.archiveRateLimited && String(url).endsWith('/zip'))
    )
      return new Response('{}', {
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1800000000',
        },
      });
    if (init?.method === 'POST') {
      posts.push(JSON.parse(init.body));
      return Response.json({});
    }
    if (/\/commits\/[a-f0-9]{40}\/status$/.test(String(url)))
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
  const { publishStatus, github } = await import(
    `./workflow-api.mjs?test=${directory}`
  );
  return { publishStatus, github, posts, requests, directory };
}

test('one reconciliation downloads each immutable run receipt archive only once', async (t) => {
  const { publishStatus, requests } = await fixture(t);
  await publishStatus(sha, result);
  await publishStatus(sha, result);
  assert.equal(
    requests.filter((url) => url.endsWith('/actions/runs/123')).length,
    1,
  );
  assert.equal(
    requests.filter((url) => url.includes('/actions/runs/123/artifacts'))
      .length,
    1,
  );
  assert.equal(
    requests.filter((url) => url.endsWith('/actions/artifacts/321/zip')).length,
    1,
  );
});

test('GitHub rate exhaustion is explicit and stops further requests in this reconciliation', async (t) => {
  const { github, requests } = await fixture(t, { rateLimited: true });
  await assert.rejects(github('pulls'), /GitHub rate limit exhausted/);
  await assert.rejects(github('pulls'), /GitHub rate limit exhausted/);
  assert.equal(requests.length, 1);
});

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

test('ten unchanged PRs sharing a trusted reconciliation use thirteen GitHub requests', async (t) => {
  const shas = Array.from({ length: 10 }, (_, index) =>
    (index + 1).toString(16).repeat(40),
  );
  const { publishStatus, requests, posts } = await fixture(t, {
    extraShas: shas,
  });
  await Promise.all(shas.map((head) => publishStatus(head, result)));
  assert.equal(requests.length, 13);
  assert.equal(posts.length, 0);
});

for (const [event, expectedPosts] of [
  ['workflow_run', 0],
  ['workflow_dispatch', 1],
]) {
  test(`Sonar ${event} feature-branch run metadata preserves the trust boundary`, async (t) => {
    const sonar = { ...result, context: 'Sonar gate' };
    const { publishStatus, posts } = await fixture(t, {
      result: sonar,
      run: { event, head_branch: 'codex/feature' },
    });
    await publishStatus(sha, sonar);
    assert.equal(posts.length, expectedPosts);
  });
}

test('archive rate exhaustion does not fall through to a replacement status', async (t) => {
  const { publishStatus, posts } = await fixture(t, {
    archiveRateLimited: true,
  });
  await assert.rejects(
    publishStatus(sha, result),
    /GitHub rate limit exhausted/,
  );
  assert.equal(posts.length, 0);
});

test('secondary exhaustion without retry-after stops subsequent GitHub requests', async (t) => {
  const { github, requests } = await fixture(t, { secondaryLimit: true });
  await assert.rejects(github('pulls'), /GitHub rate limit exhausted/);
  await assert.rejects(github('pulls'), /GitHub rate limit exhausted/);
  assert.equal(requests.length, 1);
});

for (const [label, pull_requests] of [
  ['omitted', undefined],
  ['empty', []],
  ['main', [{ base: { ref: 'main' }, head: { sha } }]],
  ['other-base', [{ base: { ref: 'codex/attacker-base' }, head: { sha } }]],
]) {
  test(`PR-target status reuse does not require pull_requests (${label})`, async (t) => {
    const { publishStatus, posts } = await fixture(t, {
      run: {
        event: 'pull_request_target',
        head_branch: 'codex/feature',
        pull_requests,
      },
    });
    await publishStatus(sha, result);
    assert.equal(posts.length, 0);
  });
}
