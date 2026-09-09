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
  parseIndependentReviewReceipt,
  parseTrustedLaunchReceipt,
  createIndependentReviewRunReceipt,
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

test('launch mint checks actor and triggering_actor permissions, including reruns', () => {
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
    triggeringActorLogin: 'aaryandas',
    actorPermission: { permission: 'admin' },
    triggeringActorPermission: { permission: 'admin' },
  };
  assert.deepEqual(launchMintFailures(ok), []);
  assert.deepEqual(
    launchMintFailures({
      ...ok,
      actorLogin: 'github-actions[bot]',
      actorPermission: { permission: 'admin' },
      triggeringActorLogin: 'aaryandas',
      triggeringActorPermission: { permission: 'write' },
    }),
    [],
  );
  assert.match(
    launchMintFailures({ ...ok, eventName: 'workflow_run' }).join('\n'),
    /must not mint/,
  );
  assert.match(
    launchMintFailures({
      ...ok,
      actorLogin: 'github-actions[bot]',
      triggeringActorLogin: 'github-actions[bot]',
      actorPermission: { permission: 'admin' },
      triggeringActorPermission: { permission: 'admin' },
    }).join('\n'),
    /github-actions\[bot\]/,
  );
  assert.match(
    launchMintFailures({
      ...ok,
      triggeringActorLogin: '',
      triggeringActorPermission: { permission: 'none' },
    }).join('\n'),
    /github\.triggering_actor/,
  );
  assert.match(
    launchMintFailures({
      ...ok,
      triggeringActorLogin: 'other',
      triggeringActorPermission: { permission: 'triage' },
    }).join('\n'),
    /github\.triggering_actor other/,
  );
  assert.match(
    launchMintFailures({
      ...ok,
      actorPermission: { permission: 'triage' },
      triggeringActorPermission: { permission: 'admin' },
    }).join('\n'),
    /github\.actor aaryandas/,
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

test('independent-review run receipt rejects malformed payloads and accepts a genuine one', () => {
  const receipt = createIndependentReviewRunReceipt({
    prNumber: 99,
    headSha: HEAD,
    customCheckId: 9001,
    githubRunId: 42,
    criticAgentId: AGENT,
    criticRunId: RUN,
    passed: true,
    status: 'PASS',
  });
  assert.equal(parseIndependentReviewReceipt(receipt).ok, true);
  assert.equal(parseIndependentReviewReceipt('').ok, false);
  assert.equal(parseIndependentReviewReceipt('{').reason, 'receipt-not-json');
  assert.equal(
    parseIndependentReviewReceipt({ ...receipt, kind: 'alias' }).reason,
    'receipt-kind',
  );
  assert.equal(
    parseIndependentReviewReceipt({ ...receipt, passed: 'true' }).reason,
    'receipt-passed',
  );
  assert.equal(
    parseIndependentReviewReceipt({ ...receipt, customCheckId: 0 }).reason,
    'receipt-customCheckId',
  );
});

test('persisted trusted launch receipt rejects forged payloads and accepts a POST receipt', () => {
  const receipt = {
    schemaVersion: 1,
    kind: LAUNCH_RECEIPT_KIND,
    source: 'trusted-launch-job',
    agentId: AGENT,
    runId: RUN,
    headSha: HEAD,
    prNumber: 99,
    repository: 'aaryandas/applied-research',
    modelId: REQUIRED_MODEL_ID,
    modelParams: [...REQUIRED_MODEL_PARAMS],
    githubRunId: '42',
    githubWorkflowSha: HEAD,
    githubEvent: 'workflow_dispatch',
    workflowPath: TRUSTED_WORKFLOW_FILE,
  };
  assert.equal(parseTrustedLaunchReceipt(receipt).ok, true);
  assert.equal(parseTrustedLaunchReceipt('').reason, 'missing-receipt');
  assert.equal(
    parseTrustedLaunchReceipt({
      ...receipt,
      kind: 'independent-review-run-receipt',
    }).reason,
    'receipt-kind',
  );
  assert.equal(
    parseTrustedLaunchReceipt({
      ...receipt,
      source: COORDINATOR_DISPATCH_RECEIPT_SOURCE,
    }).reason,
    'receipt-source',
  );
});
