import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  AGENT_ID,
  LAUNCH_RECEIPT_KIND,
  MISSING_CURSOR_API_KEY,
  REQUIRED_MODEL_ID,
  REQUIRED_MODEL_PARAMS,
  TRUSTED_LAUNCH_RECEIPT_SOURCE,
  TRUSTED_WORKFLOW_FILE,
  isSyntheticMergeRef,
} from './delivery-constants.mjs';
import {
  buildLaunchBody,
  commentIsNotProof,
  createLaunchReceipt,
  evaluateFromCursor,
  evaluateIndependentReview,
  main,
  maybeLaunchReview,
  missingKeyResult,
  parseReviewVerdict,
  persistIndependentReviewReceipt,
  resolveReviewModel,
} from './delivery-review.mjs';
import { createIndependentReviewRunReceipt } from './delivery-trust.mjs';

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
    source: TRUSTED_LAUNCH_RECEIPT_SOURCE,
    agentId: AGENT,
    runId: RUN,
    headSha: HEAD,
    prNumber: 99,
    prUrl: PR_URL,
    modelId: REQUIRED_MODEL_ID,
    modelParams: [...REQUIRED_MODEL_PARAMS],
    idempotencyKey: `independent-review:aaryandas/applied-research:99:${HEAD}`,
    githubRunId: '1',
    githubWorkflowSha: HEAD,
    githubEvent: 'workflow_run',
    workflowPath: TRUSTED_WORKFLOW_FILE,
    launchedAt: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

function trustedActionsRun(overrides = {}) {
  return {
    id: 1,
    path: TRUSTED_WORKFLOW_FILE,
    event: 'workflow_run',
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
    actionsRun: trustedActionsRun(),
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
    'trusted-launch-job-bound-to-get-agent-run',
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
  assert.match(result.setupDependency, /trusted-main/);
  assert.equal(result.setupDependency.includes('trusted-cursor'), false);
  assert.match(MISSING_CURSOR_API_KEY, /trusted-main/);
  assert.match(
    MISSING_CURSOR_API_KEY,
    /Do not create a new secret or environment/,
  );
  assert.equal(MISSING_CURSOR_API_KEY.includes('trusted-cursor'), false);
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
  assert.equal(body.mode, 'agent');
  assert.equal(Object.hasOwn(body, 'readOnly'), false);
  assert.equal(Object.hasOwn(body, 'toolProfile'), false);
  assert.equal(Object.hasOwn(body, 'ask'), false);
  assert.deepEqual(
    Object.keys(body).sort(),
    [
      'agentId',
      'autoCreatePR',
      'env',
      'mode',
      'model',
      'name',
      'prompt',
      'repos',
      'skipReviewerRequest',
      'workOnCurrentBranch',
    ].sort(),
  );
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
    githubRunId: '1',
    githubWorkflowSha: HEAD,
    githubEvent: 'workflow_run',
  });
  assert.equal(made.prUrl, PR_URL);
  assert.equal(made.modelId, REQUIRED_MODEL_ID);
  assert.equal(made.source, TRUSTED_LAUNCH_RECEIPT_SOURCE);
  assert.equal(made.workflowPath, TRUSTED_WORKFLOW_FILE);
  assert.equal(made.githubEvent, 'workflow_run');
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

test('missing verdict headSha, findings, or run status fail closed', () => {
  const noHead = evaluate({
    run: documentedRun({
      result: JSON.stringify(verdict({ headSha: undefined })),
    }),
  });
  assert.equal(noHead.passed, false);
  assert.match(noHead.failures.join('\n'), /headSha is required/);

  const noFindings = evaluate({
    run: documentedRun({
      result: JSON.stringify(verdict({ findings: undefined })),
    }),
  });
  assert.equal(noFindings.passed, false);
  assert.match(noFindings.failures.join('\n'), /findings must be an array/);

  const noStatus = evaluate({
    run: documentedRun({ status: undefined }),
  });
  assert.equal(noStatus.passed, false);
  assert.match(
    noStatus.failures.join('\n'),
    /must be FINISHED \(saw missing\)/,
  );
});

test('missing Actions run binding or env-supplied receipt cannot PASS', () => {
  const missing = evaluate({ actionsRun: undefined });
  assert.equal(missing.passed, false);
  assert.match(missing.failures.join('\n'), /must be bound to GET/);

  const envReceipt = evaluate({
    launchReceipt: receipt({ source: 'coordinator-dispatch-input' }),
  });
  assert.equal(envReceipt.passed, false);
  assert.match(envReceipt.failures.join('\n'), /trusted-launch-job/);
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

test('evaluateFromCursor binds GET Actions run; missing token is not model proof', async () => {
  const env = {
    TRUSTED_DEFAULT_BRANCH: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_DEFAULT_BRANCH: 'main',
    GITHUB_TOKEN: 'ghs_test',
    GITHUB_REPOSITORY: 'aaryandas/applied-research',
  };
  const result = await evaluateFromCursor({
    apiKey: 'cursor_test-key',
    prUrl: PR_URL,
    expectedHeadSha: HEAD,
    implementerAgentId: IMPLEMENTER,
    verifierAgentId: VERIFIER,
    recorderAgentId: RECORDER,
    launchReceipt: receipt(),
    env,
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('/v1/models')) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify(catalog);
          },
        };
      }
      if (href.includes(`/v1/agents/${AGENT}/runs/${RUN}`)) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify(documentedRun());
          },
        };
      }
      if (href.includes(`/v1/agents/${AGENT}/artifacts`)) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ items: [] });
          },
        };
      }
      if (href.includes(`/v1/agents/${AGENT}`)) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify(documentedAgent());
          },
        };
      }
      if (href.includes('/actions/runs/1')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 1,
              path: TRUSTED_WORKFLOW_FILE,
              event: 'workflow_run',
            };
          },
        };
      }
      throw new Error(`unexpected fetch ${href}`);
    },
  });
  assert.equal(result.passed, true);
  assert.equal(
    result.evidence.model.provenance,
    'trusted-launch-job-bound-to-get-agent-run',
  );

  const noToken = await evaluateFromCursor({
    apiKey: 'cursor_test-key',
    prUrl: PR_URL,
    expectedHeadSha: HEAD,
    implementerAgentId: IMPLEMENTER,
    verifierAgentId: VERIFIER,
    recorderAgentId: RECORDER,
    launchReceipt: receipt(),
    env: {
      TRUSTED_DEFAULT_BRANCH: 'true',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_DEFAULT_BRANCH: 'main',
    },
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
  assert.equal(noToken.passed, false);
  assert.match(noToken.failures.join('\n'), /GITHUB_TOKEN/);
});

function launchPr(overrides = {}) {
  return {
    state: 'open',
    draft: false,
    html_url: PR_URL,
    head: {
      sha: HEAD,
      repo: { full_name: 'aaryandas/applied-research' },
    },
    base: {
      ref: 'main',
      repo: { full_name: 'aaryandas/applied-research' },
    },
    ...overrides,
  };
}

function dispatchLaunchEnv(overrides = {}) {
  return {
    TRUSTED_DEFAULT_BRANCH: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_DEFAULT_BRANCH: 'main',
    CURSOR_REVIEW_LAUNCH: 'true',
    GITHUB_TOKEN: 'ghs_test',
    GITHUB_ACTOR: 'aaryandas',
    GITHUB_TRIGGERING_ACTOR: 'aaryandas',
    GITHUB_RUN_ID: '1',
    GITHUB_SHA: HEAD,
    REPOSITORY: 'aaryandas/applied-research',
    ...overrides,
  };
}

test('workflow_run evaluates only and never POSTs a Cursor agent', async () => {
  let fetched = false;
  const result = await maybeLaunchReview({
    apiKey: 'cursor_test-key',
    launch: true,
    model: resolveReviewModel(catalog),
    prUrl: PR_URL,
    repoUrl: 'https://github.com/aaryandas/applied-research',
    headSha: HEAD,
    ticket: 'AR-41',
    repository: 'aaryandas/applied-research',
    prNumber: 99,
    env: dispatchLaunchEnv({
      GITHUB_EVENT_NAME: 'workflow_run',
      EVENT_NAME: 'workflow_run',
    }),
    fetchImpl: async () => {
      fetched = true;
      throw new Error('must not fetch');
    },
  });
  assert.equal(result.launched, false);
  assert.equal(fetched, false);
  assert.match(result.reason, /must not mint/);
});

test('launch mint rejects fork, closed, draft, stale SHA, and missing write permission before POST', async () => {
  const cases = [
    {
      pr: launchPr({
        head: {
          sha: HEAD,
          repo: { full_name: 'fork/applied-research' },
        },
      }),
      pattern: /fork or foreign/,
    },
    {
      pr: launchPr({ state: 'closed' }),
      pattern: /closed or missing/,
    },
    {
      pr: launchPr({ draft: true }),
      pattern: /draft/,
    },
    {
      pr: launchPr({
        head: {
          sha: STALE,
          repo: { full_name: 'aaryandas/applied-research' },
        },
      }),
      pattern: /does not match live PR head/,
    },
  ];
  for (const fixture of cases) {
    let posted = false;
    const result = await maybeLaunchReview({
      apiKey: 'cursor_test-key',
      launch: true,
      model: resolveReviewModel(catalog),
      prUrl: PR_URL,
      repoUrl: 'https://github.com/aaryandas/applied-research',
      headSha: HEAD,
      ticket: 'AR-41',
      repository: 'aaryandas/applied-research',
      prNumber: 99,
      env: dispatchLaunchEnv(),
      fetchImpl: async (url, init) => {
        const href = String(url);
        if (href.includes('/collaborators/')) {
          return {
            ok: true,
            status: 200,
            async json() {
              return { permission: 'admin' };
            },
          };
        }
        if (href.includes('/pulls/99')) {
          return {
            ok: true,
            status: 200,
            async json() {
              return fixture.pr;
            },
          };
        }
        if (init?.method === 'POST') {
          posted = true;
          throw new Error('must not POST Cursor');
        }
        throw new Error(`unexpected fetch ${href}`);
      },
    });
    assert.equal(result.launched, false, fixture.pattern);
    assert.equal(posted, false, fixture.pattern);
    assert.match(result.reason, fixture.pattern);
  }

  let posted = false;
  const noWrite = await maybeLaunchReview({
    apiKey: 'cursor_test-key',
    launch: true,
    model: resolveReviewModel(catalog),
    prUrl: PR_URL,
    repoUrl: 'https://github.com/aaryandas/applied-research',
    headSha: HEAD,
    ticket: 'AR-41',
    repository: 'aaryandas/applied-research',
    prNumber: 99,
    env: dispatchLaunchEnv(),
    fetchImpl: async (url, init) => {
      const href = String(url);
      if (href.includes('/collaborators/')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { permission: 'read' };
          },
        };
      }
      if (href.includes('/pulls/99')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return launchPr();
          },
        };
      }
      if (init?.method === 'POST') {
        posted = true;
        throw new Error('must not POST Cursor');
      }
      throw new Error(`unexpected fetch ${href}`);
    },
  });
  assert.equal(noWrite.launched, false);
  assert.equal(posted, false);
  assert.match(noWrite.reason, /write, maintain, or admin/);
});

test('authorized dispatch launch POSTs the documented mode:agent create schema', async () => {
  let posted;
  const result = await maybeLaunchReview({
    apiKey: 'cursor_test-key',
    launch: true,
    model: resolveReviewModel(catalog),
    prUrl: PR_URL,
    repoUrl: 'https://github.com/aaryandas/applied-research',
    headSha: HEAD,
    ticket: 'AR-41',
    repository: 'aaryandas/applied-research',
    prNumber: 99,
    env: dispatchLaunchEnv(),
    fetchImpl: async (url, init) => {
      const href = String(url);
      if (href.includes('/collaborators/aaryandas/permission')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { permission: 'maintain' };
          },
        };
      }
      if (href.includes('/pulls/99')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return launchPr();
          },
        };
      }
      if (href.includes('/v1/agents') && init?.method === 'POST') {
        posted = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              agent: { id: AGENT, url: `https://cursor.com/agents/${AGENT}` },
              run: { id: RUN },
            });
          },
        };
      }
      throw new Error(`unexpected fetch ${href}`);
    },
  });
  assert.equal(result.launched, true);
  assert.equal(result.agentId, AGENT);
  assert.equal(posted.mode, 'agent');
  assert.equal(posted.model.id, REQUIRED_MODEL_ID);
  assert.deepEqual(posted.model.params, [...REQUIRED_MODEL_PARAMS]);
  assert.equal(posted.repos[0].startingRef, HEAD);
  assert.equal(Object.hasOwn(posted.repos[0], 'prUrl'), false);
  assert.equal(posted.autoCreatePR, false);
  assert.equal(posted.workOnCurrentBranch, false);
  assert.equal(Object.hasOwn(posted, 'readOnly'), false);
  assert.equal(Object.hasOwn(posted, 'toolProfile'), false);
  assert.equal(result.receipt.source, TRUSTED_LAUNCH_RECEIPT_SOURCE);
  assert.equal(result.receipt.githubEvent, 'workflow_dispatch');
});

test('rerun launch GETs write permission for both github.actor and github.triggering_actor', async () => {
  const seen = [];
  let posted;
  const result = await maybeLaunchReview({
    apiKey: 'cursor_test-key',
    launch: true,
    model: resolveReviewModel(catalog),
    prUrl: PR_URL,
    repoUrl: 'https://github.com/aaryandas/applied-research',
    headSha: HEAD,
    ticket: 'AR-41',
    repository: 'aaryandas/applied-research',
    prNumber: 99,
    env: dispatchLaunchEnv({
      GITHUB_ACTOR: 'github-actions[bot]',
      GITHUB_TRIGGERING_ACTOR: 'aaryandas',
    }),
    fetchImpl: async (url, init) => {
      const href = String(url);
      if (href.includes('/collaborators/')) {
        seen.push(decodeURIComponent(href));
        const login = href.includes('github-actions')
          ? 'github-actions[bot]'
          : 'aaryandas';
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              permission: login === 'aaryandas' ? 'write' : 'admin',
            };
          },
        };
      }
      if (href.includes('/pulls/99')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return launchPr();
          },
        };
      }
      if (href.includes('/v1/agents') && init?.method === 'POST') {
        posted = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              agent: { id: AGENT, url: `https://cursor.com/agents/${AGENT}` },
              run: { id: RUN },
            });
          },
        };
      }
      throw new Error(`unexpected fetch ${href}`);
    },
  });
  assert.equal(result.launched, true);
  assert.equal(posted.mode, 'agent');
  assert.equal(
    seen.some((href) => href.includes('github-actions[bot]')),
    true,
  );
  assert.equal(
    seen.some((href) => href.includes('aaryandas')),
    true,
  );
});

test('rerun launch fails when triggering_actor lacks write even if actor is admin', async () => {
  let posted = false;
  const result = await maybeLaunchReview({
    apiKey: 'cursor_test-key',
    launch: true,
    model: resolveReviewModel(catalog),
    prUrl: PR_URL,
    repoUrl: 'https://github.com/aaryandas/applied-research',
    headSha: HEAD,
    ticket: 'AR-41',
    repository: 'aaryandas/applied-research',
    prNumber: 99,
    env: dispatchLaunchEnv({
      GITHUB_ACTOR: 'github-actions[bot]',
      GITHUB_TRIGGERING_ACTOR: 'stranger',
    }),
    fetchImpl: async (url, init) => {
      const href = String(url);
      if (href.includes('/collaborators/')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              permission: href.includes('stranger') ? 'none' : 'admin',
            };
          },
        };
      }
      if (href.includes('/pulls/99')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return launchPr();
          },
        };
      }
      if (init?.method === 'POST') {
        posted = true;
        throw new Error('must not POST Cursor');
      }
      throw new Error(`unexpected fetch ${href}`);
    },
  });
  assert.equal(result.launched, false);
  assert.equal(posted, false);
  assert.match(result.reason, /github\.triggering_actor stranger/);
});

test('trusted evaluate persists a run artifact receipt with the custom check id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ar-review-receipt-'));
  const output = join(dir, 'github-output');
  const previous = process.cwd();
  process.chdir(dir);
  try {
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
    persistIndependentReviewReceipt(receipt, { githubOutput: output });
    const written = JSON.parse(
      await readFile(join(dir, 'independent-review-receipt.json'), 'utf8'),
    );
    assert.equal(written.customCheckId, 9001);
    assert.equal(written.prNumber, 99);
    assert.equal(written.headSha, HEAD);
    const gh = await readFile(output, 'utf8');
    assert.match(gh, /review_receipt_file=independent-review-receipt.json/);
    assert.match(gh, /review_pr_number=99/);
    assert.match(gh, new RegExp(`review_head_sha=${HEAD}`));
  } finally {
    process.chdir(previous);
    await rm(dir, { recursive: true, force: true });
  }
});
