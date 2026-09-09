import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CI_GATE_NAME,
  CURSOR_API_KEYS_URL,
  GITHUB_ACTIONS_APP_ID,
  LEGACY_FABLE_WORKFLOW,
  LINEAR_DRAFT_PR_STATE,
  LINEAR_MERGE_STATE,
  LINEAR_READY_PR_STATE,
  LINEAR_STATUS_AUTOMATION_GAP,
  MISSING_CURSOR_API_KEY,
  TRUSTED_ENVIRONMENT_BRANCH_POLICY,
  TRUSTED_GITHUB_ENVIRONMENT,
  WALKTHROUGH_INTEGRATION_ROOT,
  classifyDeliveryCi,
  classifyLinearGate,
  expectedLinearStateFromPr,
  explainLinearLifecycleGap,
  githubActionsAppOk,
} from './delivery-constants.mjs';

test('trusted environment is the existing trusted-main branch policy, not a new secret', () => {
  assert.equal(TRUSTED_GITHUB_ENVIRONMENT, 'trusted-main');
  assert.deepEqual(TRUSTED_ENVIRONMENT_BRANCH_POLICY, {
    type: 'branch',
    name: 'main',
  });
  assert.match(MISSING_CURSOR_API_KEY, /trusted-main/);
  assert.match(
    MISSING_CURSOR_API_KEY,
    /Do not create a new secret or environment/,
  );
  assert.equal(MISSING_CURSOR_API_KEY.includes('trusted-cursor'), false);
  assert.equal(
    MISSING_CURSOR_API_KEY.includes('Create GitHub Environment'),
    false,
  );
  assert.equal(MISSING_CURSOR_API_KEY.includes(CURSOR_API_KEYS_URL), false);
});

test('legacy Fable workflow stays disabled_manually until a human re-enables after merge', () => {
  assert.equal(LEGACY_FABLE_WORKFLOW.id, 353522718);
  assert.equal(LEGACY_FABLE_WORKFLOW.state, 'disabled_manually');
  assert.equal(
    LEGACY_FABLE_WORKFLOW.actionsName,
    'Independent review (Claude)',
  );
  assert.equal(
    LEGACY_FABLE_WORKFLOW.path,
    '.github/workflows/claude-review.yml',
  );
});

test('owned Linear mapping is draft→In Development, ready→In Testing, merge still In Review', () => {
  assert.equal(LINEAR_MERGE_STATE, 'In Review');
  assert.equal(
    expectedLinearStateFromPr({ state: 'OPEN', isDraft: true }),
    LINEAR_DRAFT_PR_STATE,
  );
  assert.equal(
    expectedLinearStateFromPr({ state: 'OPEN', isDraft: false }),
    LINEAR_READY_PR_STATE,
  );
  assert.equal(
    expectedLinearStateFromPr({ state: 'CLOSED', isDraft: true }),
    null,
  );
  assert.equal(
    explainLinearLifecycleGap({
      pr: { state: 'OPEN', isDraft: false },
      linear: { identifier: 'AR-41', state: 'In Review' },
      ticket: 'AR-41',
    }),
    null,
  );
});

test('Backlog with an open PR is the GitHub↔Linear automation gap, not In Review', () => {
  const reason = explainLinearLifecycleGap({
    pr: { state: 'OPEN', isDraft: true },
    linear: { identifier: 'AR-52', state: 'Backlog' },
    ticket: 'AR-52',
  });
  assert.match(reason, /must be In Review \(current: Backlog\)/);
  assert.match(reason, /In Development/);
  assert.match(reason, /PR #45/);
  assert.match(reason, /AR-52/);
  assert.match(reason, /PR #46/);
  assert.match(reason, /AR-53/);
  assert.match(reason, /does not move Linear status/);
  assert.match(LINEAR_STATUS_AUTOMATION_GAP, /status automation gap/);
});

test('In Development on a draft PR still cannot merge', () => {
  const reason = explainLinearLifecycleGap({
    pr: { state: 'OPEN', isDraft: true },
    linear: { identifier: 'AR-41', state: 'In Development' },
    ticket: 'AR-41',
  });
  assert.match(reason, /must be In Review \(current: In Development\)/);
  assert.match(reason, /Owned mapping from this GitHub PR: In Development/);
  assert.equal(reason.includes('treat Backlog as In Review'), false);
  assert.match(reason, /does not move Linear status/);
});

test('expected Linear In Development and nonblocking Windows are not autofix signals', () => {
  const linear = classifyLinearGate({
    pr: { state: 'OPEN', isDraft: true },
    linear: { identifier: 'AR-41', state: 'In Development' },
    ticket: 'AR-41',
  });
  assert.equal(linear.kind, 'expected-lifecycle');
  assert.equal(linear.exitCode, 0);
  assert.equal(linear.autofix, false);
  const ignore = classifyDeliveryCi({
    liveHeadSha: 'a'.repeat(40),
    ciGateResult: 'success',
    workflowSha: 'a'.repeat(40),
    linearKind: 'expected-lifecycle',
    checks: [
      {
        name: 'checks / Verify (windows-latest)',
        conclusion: 'failure',
        head_sha: 'a'.repeat(40),
      },
    ],
  });
  assert.equal(ignore.action, 'ignore');
  assert.equal(ignore.autofix, false);
  assert.ok(ignore.expected.includes('windows-nonblocking-coverage'));
  const stale = classifyDeliveryCi({
    liveHeadSha: 'a'.repeat(40),
    workflowSha: 'b'.repeat(40),
    ciGateResult: 'failure',
  });
  assert.equal(stale.action, 'ignore');
  assert.equal(stale.staleHead, true);
  const blocking = classifyDeliveryCi({
    liveHeadSha: 'a'.repeat(40),
    workflowSha: 'a'.repeat(40),
    ciGateResult: 'failure',
    checks: [
      {
        name: CI_GATE_NAME,
        conclusion: 'failure',
        head_sha: 'a'.repeat(40),
      },
    ],
  });
  assert.equal(blocking.action, 'investigate');
  assert.equal(WALKTHROUGH_INTEGRATION_ROOT.length, 40);
  assert.equal(GITHUB_ACTIONS_APP_ID, 15368);
  assert.equal(
    githubActionsAppOk({
      app: { slug: 'github-actions', id: 15368 },
    }),
    true,
  );
  assert.equal(
    githubActionsAppOk({ app: { slug: 'github-actions', id: 1 } }),
    false,
  );
});
