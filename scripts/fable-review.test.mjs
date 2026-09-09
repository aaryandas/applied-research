import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const sha = 'a'.repeat(40);
const repository = 'aaryandas/applied-research';
const pr = {
  number: 21,
  state: 'open',
  draft: false,
  user: { type: 'User' },
  head: { sha, ref: 'codex/ar-41-delivery', repo: { full_name: repository } },
};

function execute(script, pull, env = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'review-publisher-'));
  try {
    const eventPath = join(directory, 'event.json');
    writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 21 } }));
    const source = `
      const requests = [];
      globalThis.fetch = async (url, options) => {
        if (!url.startsWith('https://api.github.com/')) throw new Error('Unexpected external request: ' + url);
        if (options.method === 'POST') { requests.push({ url, body: JSON.parse(options.body) }); return Response.json({}); }
        if (url.endsWith('/pulls/21')) return Response.json(${JSON.stringify(pull)});
        if (url.endsWith('/status')) return Response.json({ statuses: [] });
        throw new Error('Unexpected GitHub request: ' + url);
      };
      process.argv[2] = 'finish';
      try { await import(${JSON.stringify(new URL(script, import.meta.url).href)}); }
      finally { console.log(JSON.stringify(requests)); }
    `;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', source],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REPOSITORY: repository,
          RUNNER_TEMP: directory,
          GITHUB_RUN_ID: '123',
          GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/claude-review.yml@refs/heads/main`,
          GITHUB_WORKFLOW_SHA: 'b'.repeat(40),
          REVIEW_SHA: sha,
          REVIEW_JOB_RESULT: 'success',
          REVIEW_OUTCOME: 'success',
          REVIEW_OUTPUT: JSON.stringify({
            sha,
            standards: 'PASS',
            spec: 'PASS',
            required_fixes: [],
            summary: 'Reviewed.',
          }),
          ...env,
        },
      },
    );
    return {
      status: result.status,
      requests: JSON.parse(result.stdout.trim()),
      receipt:
        result.status === 0 && script === './fable-review.mjs'
          ? JSON.parse(
              readFileSync(
                join(directory, 'gate-receipts', `fable-review--${sha}.json`),
              ),
            )
          : null,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('isolated publisher validates output and writes its own same-run receipt', () => {
  const result = execute('./fable-review.mjs', pr);
  assert.equal(result.status, 0);
  assert.equal(result.requests[0].body.state, 'success');
  assert.equal(result.receipt.runId, '123');
  assert.equal(result.receipt.sha, sha);
  assert.equal(
    result.receipt.workflowRef,
    `${repository}/.github/workflows/claude-review.yml@refs/heads/main`,
  );
  for (const [pull, env] of [
    [{ ...pr, head: { ...pr.head, sha: 'c'.repeat(40) } }, {}],
    [pr, { REVIEW_JOB_RESULT: 'failure' }],
    [pr, { REVIEW_OUTPUT: '{malformed' }],
    [{ ...pr, state: 'closed' }, {}],
  ]) {
    const blocked = execute('./fable-review.mjs', pull, env);
    assert.equal(blocked.status, 1);
    assert.equal(blocked.requests[0].body.state, 'failure');
  }
});

test('fork and bot PRs cannot query or mutate Linear attachments', () => {
  for (const pull of [
    { ...pr, user: { type: 'Bot' } },
    { ...pr, head: { ...pr.head, repo: { full_name: 'outsider/fork' } } },
  ]) {
    const result = execute('./linear-gate.mjs', pull);
    assert.equal(result.status, 0);
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].body.state, 'failure');
    assert.match(
      result.requests[0].body.description,
      /human-authored same-repository/,
    );
  }
});

test('Claude and gate publisher are isolated jobs with separate token capabilities', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/claude-review.yml', import.meta.url),
    'utf8',
  );
  const reviewer = workflow
    .split('\n  review:\n')[1]
    .split('\n  publish:\n')[0];
  const publisher = workflow
    .split('\n  publish:\n')[1]
    .split('\n  queue:\n')[0];
  assert.doesNotMatch(
    reviewer,
    /: write|fable-review\.mjs finish|upload-artifact/,
  );
  assert.match(reviewer, /claude_code_oauth_token:/);
  assert.match(publisher, /needs: \[begin, review\]/);
  assert.match(publisher, /actions\/checkout@/);
  assert.match(
    publisher,
    /ref: \$\{\{ github.event.repository.default_branch \}\}/,
  );
  assert.doesNotMatch(
    publisher,
    /download-artifact|claude_code_oauth_token|trusted-gates/,
  );
  assert.match(publisher, /REVIEW_SHA: \$\{\{ needs.begin.outputs.sha \}\}/);
  assert.match(publisher, /REVIEW_JOB_RESULT: \$\{\{ needs.review.result \}\}/);
  assert.match(publisher, /!cancelled\(\)/);
});
