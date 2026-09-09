import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COORDINATOR_DISPATCH_RECEIPT_SOURCE,
  LAUNCH_RECEIPT_KIND,
  REQUIRED_MODEL_ID,
  REQUIRED_MODEL_PARAMS,
  TRUSTED_WORKFLOW_FILE,
  UNTRUSTED_CURSOR_CREDENTIAL,
} from './delivery-constants.mjs';
import {
  assertUntrustedMustNotCarryCursorKey,
  cursorCredentialUseAllowed,
  forbiddenCursorSecretWorkflows,
  idempotentReviewAgentId,
  launchReceiptFailures,
  launchMintFailures,
  parseLaunchReceipt,
  requiredIsolationIds,
  reviewIdempotencyKey,
  untrustedEnvLaunchReceipt,
} from './delivery-trust.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const AGENT = 'bc-11111111-1111-1111-1111-111111111111';
const RUN = 'run-22222222-2222-2222-2222-222222222222';

test('F1: Cursor credentials are refused on pull_request even with TRUSTED set', () => {
  assert.equal(
    cursorCredentialUseAllowed({
      TRUSTED_DEFAULT_BRANCH: 'true',
      GITHUB_EVENT_NAME: 'pull_request',
      CURSOR_API_KEY: 'cursor_should-not-be-used',
    }),
    false,
  );
  assert.throws(
    () =>
      assertUntrustedMustNotCarryCursorKey({
        CURSOR_API_KEY: 'cursor_should-not-be-used',
      }),
    (error) => error.message === UNTRUSTED_CURSOR_CREDENTIAL,
  );
});

test('trusted dispatch on the default branch is allowed', () => {
  assert.equal(
    cursorCredentialUseAllowed({
      TRUSTED_DEFAULT_BRANCH: 'true',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_DEFAULT_BRANCH: 'main',
    }),
    true,
  );
  assert.equal(
    cursorCredentialUseAllowed({
      TRUSTED_DEFAULT_BRANCH: 'true',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/feature',
      GITHUB_DEFAULT_BRANCH: 'main',
    }),
    false,
  );
});

test('F4: isolation ids fail closed when empty', () => {
  assert.throws(() => requiredIsolationIds({}), /IMPLEMENTER_AGENT_ID/);
  assert.throws(
    () =>
      requiredIsolationIds({
        IMPLEMENTER_AGENT_ID: AGENT,
        VERIFIER_AGENT_ID: 'bc-44444444-4444-4444-4444-444444444444',
        RECORDER_AGENT_ID: '',
      }),
    /RECORDER_AGENT_ID|IMPLEMENTER_AGENT_ID/,
  );
});

test('idempotent agent id is a documented bc- UUID stable for PR+SHA', () => {
  const first = idempotentReviewAgentId({
    repository: 'aaryandas/applied-research',
    prNumber: 44,
    headSha: HEAD,
  });
  const second = idempotentReviewAgentId({
    repository: 'aaryandas/applied-research',
    prNumber: 44,
    headSha: HEAD,
  });
  assert.equal(first, second);
  assert.match(first, /^bc-[0-9a-f-]{36}$/i);
  assert.notEqual(
    first,
    idempotentReviewAgentId({
      repository: 'aaryandas/applied-research',
      prNumber: 45,
      headSha: HEAD,
    }),
  );
  assert.equal(
    reviewIdempotencyKey({
      repository: 'aaryandas/applied-research',
      prNumber: 44,
      headSha: HEAD,
    }),
    `independent-review:aaryandas/applied-research:44:${HEAD}`,
  );
});

test('launch receipt must bind documented model params, not a guessed picker field', () => {
  const failures = launchReceiptFailures(
    {
      schemaVersion: 1,
      kind: LAUNCH_RECEIPT_KIND,
      source: 'trusted-launch-job',
      agentId: AGENT,
      runId: RUN,
      headSha: HEAD,
      modelId: REQUIRED_MODEL_ID,
      modelParams: [...REQUIRED_MODEL_PARAMS],
      githubRunId: '1',
      githubWorkflowSha: HEAD,
      githubEvent: 'workflow_run',
      workflowPath: TRUSTED_WORKFLOW_FILE,
    },
    {
      expectedHeadSha: HEAD,
      agent: { id: AGENT },
      run: { id: RUN },
      actionsRun: {
        id: 1,
        path: TRUSTED_WORKFLOW_FILE,
        event: 'workflow_run',
      },
    },
  );
  assert.deepEqual(failures, []);
  const spoofed = launchReceiptFailures({
    schemaVersion: 1,
    kind: LAUNCH_RECEIPT_KIND,
    source: 'trusted-launch-job',
    agentId: AGENT,
    runId: RUN,
    headSha: HEAD,
    modelId: 'claude-fable-5-1',
    modelParams: [...REQUIRED_MODEL_PARAMS],
    githubRunId: '1',
    githubWorkflowSha: HEAD,
    githubEvent: 'workflow_run',
    workflowPath: TRUSTED_WORKFLOW_FILE,
  });
  assert.match(spoofed.join('\n'), /modelId must be grok-4\.6/);
  const coordinator = launchReceiptFailures({
    schemaVersion: 1,
    kind: LAUNCH_RECEIPT_KIND,
    source: 'coordinator',
    agentId: AGENT,
    runId: RUN,
    headSha: HEAD,
    modelId: REQUIRED_MODEL_ID,
    modelParams: [...REQUIRED_MODEL_PARAMS],
    githubRunId: '1',
    githubWorkflowSha: HEAD,
    githubEvent: 'workflow_dispatch',
    workflowPath: TRUSTED_WORKFLOW_FILE,
  });
  assert.match(coordinator.join('\n'), /trusted-launch-job/);
  const wrongPath = launchReceiptFailures(
    {
      schemaVersion: 1,
      kind: LAUNCH_RECEIPT_KIND,
      source: 'trusted-launch-job',
      agentId: AGENT,
      runId: RUN,
      headSha: HEAD,
      modelId: REQUIRED_MODEL_ID,
      modelParams: [...REQUIRED_MODEL_PARAMS],
      githubRunId: '1',
      githubWorkflowSha: HEAD,
      githubEvent: 'workflow_run',
      workflowPath: TRUSTED_WORKFLOW_FILE,
    },
    {
      actionsRun: {
        id: 1,
        path: '.github/workflows/forge.yml',
        event: 'workflow_run',
      },
    },
  );
  assert.match(
    wrongPath.join('\n'),
    /trusted independent-review workflow path/,
  );
  const missingRun = launchReceiptFailures({
    schemaVersion: 1,
    kind: LAUNCH_RECEIPT_KIND,
    source: 'trusted-launch-job',
    agentId: AGENT,
    runId: RUN,
    headSha: HEAD,
    modelId: REQUIRED_MODEL_ID,
    modelParams: [...REQUIRED_MODEL_PARAMS],
    githubRunId: '1',
    githubWorkflowSha: HEAD,
    githubEvent: 'workflow_run',
    workflowPath: TRUSTED_WORKFLOW_FILE,
  });
  assert.match(missingRun.join('\n'), /must be bound to GET/);
  const demoted = untrustedEnvLaunchReceipt({
    schemaVersion: 1,
    kind: LAUNCH_RECEIPT_KIND,
    source: 'trusted-launch-job',
    agentId: AGENT,
    runId: RUN,
    headSha: HEAD,
    modelId: REQUIRED_MODEL_ID,
    modelParams: [...REQUIRED_MODEL_PARAMS],
    githubRunId: '1',
    githubWorkflowSha: HEAD,
    githubEvent: 'workflow_dispatch',
    workflowPath: TRUSTED_WORKFLOW_FILE,
  });
  assert.equal(demoted.source, COORDINATOR_DISPATCH_RECEIPT_SOURCE);
  assert.match(
    launchReceiptFailures(demoted, {
      actionsRun: {
        id: 1,
        path: TRUSTED_WORKFLOW_FILE,
        event: 'workflow_dispatch',
      },
    }).join('\n'),
    /trusted-launch-job/,
  );
});

test('unparseable launch receipt fails closed', () => {
  assert.throws(() => parseLaunchReceipt('{'), /not parseable/);
});

test('only the trusted workflow file may mention secrets.CURSOR_API_KEY', () => {
  const forbidden = forbiddenCursorSecretWorkflows([
    {
      path: '.github/workflows/steal.yml',
      content: 'env:\n  CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}\n',
    },
    {
      path: TRUSTED_WORKFLOW_FILE,
      content: 'env:\n  CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}\n',
    },
  ]);
  assert.equal(forbidden.length, 1);
  assert.equal(forbidden[0].path, '.github/workflows/steal.yml');
});

test('launch mint fails closed on automated, fork, closed, draft, stale, and low-permission actors', () => {
  const pr = {
    state: 'open',
    draft: false,
    head: {
      sha: HEAD,
      repo: { full_name: 'aaryandas/applied-research' },
    },
    base: { repo: { full_name: 'aaryandas/applied-research' } },
  };
  const ok = {
    eventName: 'workflow_dispatch',
    trustedDefaultBranch: 'true',
    launchEnabled: true,
    expectedHeadSha: HEAD,
    liveHeadSha: HEAD,
    repository: 'aaryandas/applied-research',
    pr,
    actorLogin: 'aaryandas',
    permission: { permission: 'admin' },
  };
  assert.deepEqual(launchMintFailures(ok), []);
  assert.match(
    launchMintFailures({ ...ok, eventName: 'workflow_run' }).join('\n'),
    /must not mint/,
  );
  assert.match(
    launchMintFailures({ ...ok, actorLogin: 'github-actions[bot]' }).join('\n'),
    /github-actions\[bot\]/,
  );
  assert.match(
    launchMintFailures({ ...ok, permission: { permission: 'triage' } }).join(
      '\n',
    ),
    /write, maintain, or admin/,
  );
  assert.match(
    launchMintFailures({ ...ok, pr: { ...pr, state: 'closed' } }).join('\n'),
    /closed or missing/,
  );
  assert.match(
    launchMintFailures({ ...ok, pr: { ...pr, draft: true } }).join('\n'),
    /draft/,
  );
  assert.match(
    launchMintFailures({
      ...ok,
      pr: {
        ...pr,
        head: { ...pr.head, repo: { full_name: 'other/fork' } },
      },
    }).join('\n'),
    /fork or foreign/,
  );
  assert.match(
    launchMintFailures({ ...ok, liveHeadSha: 'b'.repeat(40) }).join('\n'),
    /recheck before launch/,
  );
});
