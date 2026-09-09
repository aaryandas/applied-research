import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trustedGateStatus, gateRunId } from './gate-provenance.mjs';
const sha = 'a'.repeat(40);
const status = {
  id: 10,
  context: 'Fable review',
  state: 'success',
  creator: { login: 'github-actions[bot]' },
  target_url: 'https://github.com/aaryandas/applied-research/actions/runs/123',
};
const run = {
  id: 123,
  path: '.github/workflows/claude-review.yml',
  head_branch: 'main',
  event: 'pull_request_target',
  status: 'completed',
  conclusion: 'success',
  repository: { full_name: 'aaryandas/applied-research' },
};
const receipt = {
  runId: '123',
  context: 'Fable review',
  sha,
  state: 'success',
  workflowRef:
    'aaryandas/applied-research/.github/workflows/claude-review.yml@refs/heads/main',
  workflowSha: 'b'.repeat(40),
};
test('success requires a trusted workflow run and its matching immutable receipt', () => {
  assert.equal(trustedGateStatus({ sha, status, run, receipt }), true);
  for (const patch of [
    { path: '.github/workflows/evil.yml' },
    { event: 'pull_request' },
    { head_branch: 'codex/feature', event: 'issue_comment' },
    { conclusion: 'cancelled' },
    { id: 999 },
  ])
    assert.equal(
      trustedGateStatus({ sha, status, run: { ...run, ...patch }, receipt }),
      false,
    );
  assert.equal(trustedGateStatus({ sha, status, run }), false);
  assert.equal(
    trustedGateStatus({
      sha,
      status,
      run,
      receipt: { ...receipt, sha: 'b'.repeat(40) },
    }),
    false,
  );
  assert.equal(
    trustedGateStatus({
      sha,
      status,
      run,
      receipt: { ...receipt, state: 'failure' },
    }),
    false,
  );
  assert.equal(
    trustedGateStatus({
      sha,
      status: {
        ...status,
        target_url: 'https://github.com/other/repo/actions/runs/123',
      },
      run,
      receipt,
    }),
    false,
  );
});
test('malformed or unrelated run links never establish provenance', () => {
  assert.equal(gateRunId(status), 123);
  for (const target_url of [
    '',
    'https://evil.example/actions/runs/123',
    status.target_url + '/jobs/456',
    status.target_url + '?sha=fake',
  ])
    assert.equal(gateRunId({ ...status, target_url }), null);
});

test('PR-target metadata may name the feature branch only with a main-workflow receipt', () => {
  assert.equal(
    trustedGateStatus({
      sha,
      status,
      run: { ...run, head_branch: 'codex/feature' },
      receipt,
    }),
    true,
  );
  assert.equal(
    trustedGateStatus({
      sha,
      status,
      run: { ...run, head_branch: 'codex/feature' },
      receipt: {
        ...receipt,
        workflowRef:
          'aaryandas/applied-research/.github/workflows/claude-review.yml@refs/heads/codex/feature',
      },
    }),
    false,
  );
});
