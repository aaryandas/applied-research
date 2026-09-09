import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
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
  parseLaunchReceipt,
  requiredIsolationIds,
  reviewIdempotencyKey,
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
      agentId: AGENT,
      runId: RUN,
      headSha: HEAD,
      modelId: REQUIRED_MODEL_ID,
      modelParams: [...REQUIRED_MODEL_PARAMS],
    },
    {
      expectedHeadSha: HEAD,
      agent: { id: AGENT },
      run: { id: RUN },
    },
  );
  assert.deepEqual(failures, []);
  const spoofed = launchReceiptFailures({
    schemaVersion: 1,
    kind: LAUNCH_RECEIPT_KIND,
    agentId: AGENT,
    runId: RUN,
    headSha: HEAD,
    modelId: 'claude-fable-5-1',
    modelParams: [...REQUIRED_MODEL_PARAMS],
  });
  assert.match(spoofed.join('\n'), /modelId must be grok-4\.6/);
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
