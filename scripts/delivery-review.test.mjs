import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AGENT_ID,
  LAUNCH_RECEIPT_KIND,
  MISSING_CURSOR_API_KEY,
  REQUIRED_MODEL_ID,
  REQUIRED_MODEL_PARAMS,
  isSyntheticMergeRef,
} from './delivery-constants.mjs';
import {
  buildLaunchBody,
  commentIsNotProof,
  createLaunchReceipt,
  evaluateFromCursor,
  evaluateIndependentReview,
  main,
  missingKeyResult,
  parseReviewVerdict,
  resolveReviewModel,
} from './delivery-review.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const STALE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const AGENT = 'bc-11111111-1111-1111-1111-111111111111';
const RUN = 'run-22222222-2222-2222-2222-222222222222';
const IMPLEMENTER = 'bc-33333333-3333-3333-3333-333333333333';
const VERIFIER = 'bc-44444444-4444-4444-4444-444444444444';
const RECORDER = 'bc-55555555-5555-5555-5555-555555555555';
const PR_URL = 'https://github.com/aaryandas/applied-research/pull/99';

const catalog = {
  items: [
    {
      id: REQUIRED_MODEL_ID,
      displayName: 'Grok 4.6',
      params: [
        {
          id: 'effort',
          values: [{ value: 'low' }, { value: 'xhigh' }],
        },
        {
          id: 'fast',
          values: [{ value: 'true' }, { value: 'false' }],
        },
      ],
      variants: [
        {
          displayName: 'Grok 4.6 Extra High',
          params: [...REQUIRED_MODEL_PARAMS],
          isDefault: false,
        },
      ],
    },
    {
      id: 'claude-fable-5-1',
      displayName: 'Fable 5.1',
      variants: [{ displayName: 'Fable 5.1', params: [] }],
    },
  ],
};

function verdict(overrides = {}) {
  return {
    role: 'independent-reviewer',
    headSha: HEAD,
    standards: 'PASS',
    spec: 'PASS',
    findings: [],
    resolutions: [],
    ...overrides,
  };
}

function documentedAgent(overrides = {}) {
  return {
    id: AGENT,
    name: 'Independent review AR-41',
    status: 'IDLE',
    env: { type: 'cloud' },
    url: `https://cursor.com/agents/${AGENT}`,
    repos: [
      {
        url: 'https://github.com/aaryandas/applied-research',
        startingRef: HEAD,
      },
    ],
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
    latestRunId: RUN,
    ...overrides,
  };
}

function documentedRun(overrides = {}) {
  return {
    id: RUN,
    agentId: AGENT,
    status: 'FINISHED',
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:01:00.000Z',
    durationMs: 1200,
    result: `Here is the verdict\n\`\`\`json\n${JSON.stringify(verdict())}\n\`\`\``,
    ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: LAUNCH_RECEIPT_KIND,
    source: 'coordinator',
    agentId: AGENT,
    runId: RUN,
    headSha: HEAD,
    prNumber: 99,
    prUrl: PR_URL,
    modelId: REQUIRED_MODEL_ID,
    modelParams: [...REQUIRED_MODEL_PARAMS],
    idempotencyKey: `independent-review:aaryandas/applied-research:99:${HEAD}`,
    githubRunId: '34326348344',
    githubWorkflowSha: 'ffffffffffffffffffffffffffffffffffffffff',
    launchedAt: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

function evaluate(overrides = {}) {
  return evaluateIndependentReview({
    expectedHeadSha: HEAD,
    prUrl: PR_URL,
    catalog,
    agent: documentedAgent(),
    run: documentedRun(),
    artifacts: { items: [{ url: `https://cursor.com/agents/${AGENT}` }] },
    implementerAgentId: IMPLEMENTER,
    verifierAgentId: VERIFIER,
    recorderAgentId: RECORDER,
    launchReceipt: receipt(),
    ...overrides,
  });
}

test('full SHA and merge refs', () => {
  assert.equal(isSyntheticMergeRef('refs/pull/21/merge'), true);
  assert.equal(isSyntheticMergeRef(HEAD), false);
  assert.match(AGENT, AGENT_ID);
});

test('catalog resolves grok-4.6 Extra High params and rejects Fable', () => {
  const resolved = resolveReviewModel(catalog);
  assert.equal(resolved.id, REQUIRED_MODEL_ID);
  assert.deepEqual(resolved.extraHighParams, [...REQUIRED_MODEL_PARAMS]);
  assert.equal(resolveReviewModel({ items: catalog.items.slice(1) }), null);
});

test('authentic exact-head PASS uses launch receipt, not GET model fields', () => {
  const result = evaluate();
  assert.equal(result.passed, true);
  assert.equal(result.evidence.agentId, AGENT);
  assert.equal(result.evidence.headSha, HEAD);
  assert.equal(result.evidence.model.id, REQUIRED_MODEL_ID);
  assert.equal(
    result.evidence.model.provenance,
    'launch-receipt-bound-to-get-agent-run',
  );
});

test('missing Cursor API key stays pending, never PASS', () => {
  const result = missingKeyResult();
  assert.equal(result.passed, false);
  assert.equal(result.status, 'PENDING');
  assert.match(result.failures[0], /CURSOR_API_KEY/);
  assert.equal(
    MISSING_CURSOR_API_KEY.includes('https://api.cursor.com/v1/agents'),
    false,
  );
  assert.match(result.setupDependency, /trusted-cursor/);
});

test('stale SHA fails closed', () => {
  const result = evaluate({
    expectedHeadSha: STALE,
    run: documentedRun({
      result: JSON.stringify(verdict({ headSha: HEAD })),
    }),
    launchReceipt: receipt({ headSha: HEAD }),
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /does not match current PR head/);
});

test('synthetic merge ref is not reviewed-head proof', () => {
  const result = evaluate({ expectedHeadSha: 'refs/pull/21/merge' });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /merge refs are not proof/);
});

test('F2: documented V1Agent/V1Run schema without model fields cannot PASS via verdict.model', () => {
  const result = evaluate({
    launchReceipt: null,
    run: documentedRun({
      result: JSON.stringify(
        verdict({
          model: { id: REQUIRED_MODEL_ID, displayName: 'spoofed' },
        }),
      ),
    }),
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /Launch receipt is required/);
  assert.match(result.failures.join('\n'), /verdict\.model is self-authored/);
});

test('F2: undocumented originalModelName is not accepted as picker proof', () => {
  const result = evaluate({
    agent: documentedAgent({ originalModelName: 'cursor-grok-4.6-xhigh' }),
    run: documentedRun({ originalModelName: 'cursor-grok-4.6-xhigh' }),
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /undocumented model fields/);
});

test('F3: GET startingRef mismatch fails closed', () => {
  const result = evaluate({
    agent: documentedAgent({
      repos: [
        {
          url: 'https://github.com/aaryandas/applied-research',
          startingRef: STALE,
          prUrl: PR_URL,
        },
      ],
    }),
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /startingRef/);
});

test('F3: launch body pins startingRef SHA, omits prUrl, sends grok-4.6 params and idempotent agentId', () => {
  const body = buildLaunchBody({
    model: resolveReviewModel(catalog),
    prUrl: PR_URL,
    repoUrl: 'https://github.com/aaryandas/applied-research',
    headSha: HEAD,
    ticket: 'AR-41',
    repository: 'aaryandas/applied-research',
    prNumber: 99,
  });
  assert.equal(body.repos[0].startingRef, HEAD);
  assert.equal(Object.hasOwn(body.repos[0], 'prUrl'), false);
  assert.equal(body.model.id, REQUIRED_MODEL_ID);
  assert.deepEqual(body.model.params, [...REQUIRED_MODEL_PARAMS]);
  assert.equal(body.workOnCurrentBranch, false);
  assert.equal(body.autoCreatePR, false);
  assert.equal(body.env.type, 'cloud');
  assert.match(body.agentId, AGENT_ID);
  assert.match(body.name, /^Independent review\b/);
  const made = createLaunchReceipt({
    agentId: AGENT,
    runId: RUN,
    headSha: HEAD,
    prNumber: 99,
    prUrl: PR_URL,
    repository: 'aaryandas/applied-research',
  });
  assert.equal(made.prUrl, PR_URL);
  assert.equal(made.modelId, REQUIRED_MODEL_ID);
});

test('F4: unset isolation ids cannot PASS even with JSON independent-reviewer role', () => {
  const result = evaluate({
    implementerAgentId: undefined,
    verifierAgentId: undefined,
    recorderAgentId: undefined,
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /IMPLEMENTER_AGENT_ID/);
});

test('F4: implementer agent cannot self-review via JSON role', () => {
  const asImplementer = evaluate({
    agent: documentedAgent({
      id: IMPLEMENTER,
      name: 'Independent review AR-41',
    }),
    run: documentedRun({
      agentId: IMPLEMENTER,
      result: JSON.stringify(verdict({ role: 'independent-reviewer' })),
    }),
    launchReceipt: receipt({ agentId: IMPLEMENTER }),
    implementerAgentId: IMPLEMENTER,
  });
  assert.equal(asImplementer.passed, false);
  assert.match(
    asImplementer.failures.join('\n'),
    /different cloud agent than the implementer/,
  );
});

test('role spoofing: JSON implementer/recorder cannot supply the critic', () => {
  const named = evaluate({
    run: documentedRun({
      result: JSON.stringify(verdict({ role: 'implementer' })),
    }),
  });
  assert.equal(named.passed, false);
  assert.match(named.failures.join('\n'), /implementer/);

  const recorder = evaluate({
    run: documentedRun({
      result: JSON.stringify(verdict({ role: 'recorder' })),
    }),
  });
  assert.equal(recorder.passed, false);
});

test('agent.name that is not Independent review fails even if JSON role matches', () => {
  const result = evaluate({
    agent: documentedAgent({ name: 'Implement AR-41' }),
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /agent\.name/);
});

test('unresolved material findings fail even if axes say PASS', () => {
  const result = evaluate({
    run: documentedRun({
      result: JSON.stringify(
        verdict({
          findings: [
            {
              severity: 'material',
              status: 'unresolved',
              path: 'scripts/x.mjs:1',
              rule: 'credentials',
              fix: 'remove secret',
            },
          ],
        }),
      ),
    }),
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /unresolved material/);
});

test('partial or missing run result is not PASS', () => {
  assert.equal(parseReviewVerdict('looks great'), null);
  const missing = evaluate({ run: documentedRun({ result: '' }) });
  assert.equal(missing.passed, false);
  const unfinished = evaluate({ run: documentedRun({ status: 'RUNNING' }) });
  assert.equal(unfinished.passed, false);
});

test('forged cursor[bot] comments and marker strings are not proof', () => {
  assert.equal(
    commentIsNotProof({
      user: { login: 'cursor[bot]' },
      body: 'VERIFICATION_RESULT: PASS',
    }).forgedBot,
    true,
  );
  assert.equal(
    commentIsNotProof({
      user: { login: 'github-actions[bot]' },
      body: 'INDEPENDENT_REVIEW_PASS',
    }).markerOnly,
    true,
  );
  const withComment = evaluate({
    comments: [
      {
        user: { login: 'cursor[bot]' },
        body: 'VERIFICATION_RESULT: PASS',
      },
    ],
  });
  assert.equal(withComment.passed, false);
  assert.match(withComment.failures.join('\n'), /comments/);
  const withoutAgent = evaluateIndependentReview({
    expectedHeadSha: HEAD,
    catalog,
    agent: null,
    run: documentedRun(),
    implementerAgentId: IMPLEMENTER,
    verifierAgentId: VERIFIER,
    recorderAgentId: RECORDER,
    launchReceipt: receipt(),
  });
  assert.equal(withoutAgent.passed, false);
});

test('missing env.type fail-closes; local env is not cloud', () => {
  const missing = evaluate({ agent: documentedAgent({ env: {} }) });
  assert.equal(missing.passed, false);
  assert.match(missing.failures.join('\n'), /env\.type=cloud \(saw missing\)/);
  const local = evaluate({
    agent: documentedAgent({ env: { type: 'local' } }),
  });
  assert.equal(local.passed, false);
  assert.match(local.failures.join('\n'), /local/);
});

test('F1: untrusted pull_request main never calls Cursor even if a key is present', async () => {
  let fetched = false;
  await assert.rejects(
    () =>
      main(
        {
          EVENT_NAME: 'pull_request',
          GITHUB_EVENT_NAME: 'pull_request',
          CURSOR_API_KEY: 'cursor_should-not-be-used',
          HEAD_SHA: HEAD,
          PR_NUMBER: '44',
          REPOSITORY: 'aaryandas/applied-research',
        },
        {
          command: 'untrusted',
          fetchImpl: async () => {
            fetched = true;
            throw new Error('must not fetch');
          },
        },
      ),
    /untrusted pull-request code/,
  );
  assert.equal(fetched, false);
});

test('untrusted main without a key posts a pending notice and does not fetch', async () => {
  let fetched = false;
  const logs = [];
  const result = await main(
    {
      EVENT_NAME: 'pull_request',
      HEAD_SHA: HEAD,
      PR_NUMBER: '44',
    },
    {
      command: 'untrusted',
      log: { log: (message) => logs.push(message), error() {} },
      fetchImpl: async () => {
        fetched = true;
        return {
          ok: false,
          status: 500,
          async json() {
            return {};
          },
          async text() {
            return '';
          },
        };
      },
    },
  );
  assert.equal(result.passed, false);
  assert.equal(fetched, false);
  assert.match(logs.join('\n'), /untrusted pull-request/);
});

test('evaluateFromCursor without a receipt does not treat list/prUrl JSON as PASS', async () => {
  const env = {
    TRUSTED_DEFAULT_BRANCH: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_DEFAULT_BRANCH: 'main',
  };
  const result = await evaluateFromCursor({
    apiKey: 'cursor_test-key',
    prUrl: PR_URL,
    expectedHeadSha: HEAD,
    implementerAgentId: IMPLEMENTER,
    verifierAgentId: VERIFIER,
    recorderAgentId: RECORDER,
    launchReceipt: null,
    env,
    fetchImpl: async (url) => {
      assert.match(String(url), /\/v1\/models$/);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(catalog);
        },
      };
    },
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /receipt|originalModelName/);
});
