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
  pull_requests: [{ base: { ref: 'main' }, head: { sha } }],
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

test('Sonar workflow_run accepts triggering-branch metadata only with bound default-branch evidence', () => {
  const sonarStatus = { ...status, context: 'Sonar gate' };
  const sonarRun = {
    ...run,
    path: '.github/workflows/sonar.yml',
    event: 'workflow_run',
    head_branch: 'codex/ar-44-source',
    head_sha: sha,
  };
  const sonarReceipt = {
    ...receipt,
    context: 'Sonar gate',
    workflowRef:
      'aaryandas/applied-research/.github/workflows/sonar.yml@refs/heads/main',
  };
  const evidence = {
    sha,
    status: sonarStatus,
    run: sonarRun,
    receipt: sonarReceipt,
  };
  assert.equal(trustedGateStatus(evidence), true);
  for (const patch of [
    { run: { ...sonarRun, event: 'workflow_dispatch' } },
    { run: { ...sonarRun, event: 'pull_request' } },
    { run: { ...sonarRun, path: '.github/workflows/evil.yml' } },
    { run: { ...sonarRun, repository: { full_name: 'outsider/fork' } } },
    { status: { ...sonarStatus, creator: { login: 'untrusted' } } },
    { receipt: undefined },
    {
      receipt: {
        ...sonarReceipt,
        workflowRef:
          'aaryandas/applied-research/.github/workflows/sonar.yml@refs/heads/codex/ar-44-source',
      },
    },
    { receipt: { ...sonarReceipt, runId: '999' } },
    { receipt: { ...sonarReceipt, context: 'Fable review' } },
    { receipt: { ...sonarReceipt, sha: 'c'.repeat(40) } },
    { receipt: { ...sonarReceipt, workflowSha: '' } },
  ])
    assert.equal(trustedGateStatus({ ...evidence, ...patch }), false);
  assert.equal(
    trustedGateStatus({
      ...evidence,
      run: { ...sonarRun, event: 'workflow_dispatch', head_branch: 'main' },
    }),
    true,
  );
  assert.equal(
    trustedGateStatus({
      sha,
      status,
      run: { ...run, event: 'workflow_run', head_branch: 'codex/feature' },
      receipt,
    }),
    false,
  );
});

test('PR-target execution requires a server-recorded main base and exact gated head, even with a forged main receipt', () => {
  for (const pull_requests of [
    undefined,
    [],
    [{ base: { ref: 'codex/attacker-base' }, head: { sha } }],
    [{ base: { ref: 'main' }, head: { sha: 'c'.repeat(40) } }],
    [{ base: { ref: 'main' } }],
  ]) {
    for (const head_branch of ['main', 'codex/feature'])
      assert.equal(
        trustedGateStatus({
          sha,
          status,
          run: { ...run, head_branch, pull_requests },
          receipt,
        }),
        false,
      );
  }
  assert.equal(
    trustedGateStatus({
      sha,
      status: { ...status, state: 'pending' },
      run: { ...run, status: 'in_progress', pull_requests: [] },
    }),
    false,
  );
});
