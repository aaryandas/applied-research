import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AGENT_ID,
  MISSING_CURSOR_API_KEY,
  isSyntheticMergeRef,
} from './delivery-constants.mjs';
import {
  commentIsNotProof,
  evaluateIndependentReview,
  isGrok46ExtraHigh,
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

const catalog = {
  items: [
    {
      id: 'cursor-grok-4.6-xhigh',
      displayName: 'Grok 4.6 Extra High',
      aliases: ['grok-4.6-xhigh'],
      variants: [
        {
          displayName: 'Grok 4.6 Extra High',
          params: [],
          isDefault: true,
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

function agent(overrides = {}) {
  return {
    id: AGENT,
    name: 'Independent review AR-41',
    env: { type: 'cloud' },
    url: `https://cursor.com/agents/${AGENT}`,
    originalModelName: 'cursor-grok-4.6-xhigh',
    model: { id: 'cursor-grok-4.6-xhigh', displayName: 'Grok 4.6 Extra High' },
    repos: [
      {
        url: 'https://github.com/aaryandas/applied-research',
        prUrl: 'https://github.com/aaryandas/applied-research/pull/99',
        startingRef: HEAD,
      },
    ],
    ...overrides,
  };
}

function run(overrides = {}) {
  return {
    id: RUN,
    agentId: AGENT,
    status: 'FINISHED',
    originalModelName: 'cursor-grok-4.6-xhigh',
    model: { id: 'cursor-grok-4.6-xhigh' },
    result: `Here is the verdict\n\`\`\`json\n${JSON.stringify(verdict())}\n\`\`\``,
    ...overrides,
  };
}

function evaluate(overrides = {}) {
  return evaluateIndependentReview({
    expectedHeadSha: HEAD,
    prUrl: 'https://github.com/aaryandas/applied-research/pull/99',
    catalog,
    agent: agent(),
    run: run(),
    artifacts: { items: [{ url: `https://cursor.com/agents/${AGENT}` }] },
    implementerAgentId: IMPLEMENTER,
    verifierAgentId: VERIFIER,
    ...overrides,
  });
}

test('full SHA and merge refs', () => {
  assert.equal(isSyntheticMergeRef('refs/pull/21/merge'), true);
  assert.equal(isSyntheticMergeRef(HEAD), false);
  assert.match(AGENT, AGENT_ID);
});

test('catalog resolves Grok 4.6 Extra High and rejects Fable', () => {
  const resolved = resolveReviewModel(catalog);
  assert.equal(resolved.id, 'cursor-grok-4.6-xhigh');
  assert.equal(isGrok46ExtraHigh({ id: 'claude-fable-5-1' }), false);
  assert.equal(isGrok46ExtraHigh({ id: 'composer-2' }), false);
  assert.equal(
    isGrok46ExtraHigh({ originalModelName: 'cursor-grok-4.6-xhigh' }),
    true,
  );
});

test('authentic exact-head PASS', () => {
  const result = evaluate();
  assert.equal(result.passed, true);
  assert.equal(result.evidence.agentId, AGENT);
  assert.equal(result.evidence.headSha, HEAD);
  assert.equal(result.evidence.model.runtime, 'cursor-grok-4.6-xhigh');
});

test('missing Cursor API key stays pending, never PASS', () => {
  const result = missingKeyResult();
  assert.equal(result.passed, false);
  assert.equal(result.status, 'PENDING');
  assert.match(result.failures[0], /CURSOR_API_KEY/);
  assert.equal(result.setupDependency, 'repository secret CURSOR_API_KEY');
  assert.equal(
    MISSING_CURSOR_API_KEY.includes('https://api.cursor.com/v1/agents'),
    true,
  );
});

test('stale SHA fails closed', () => {
  const result = evaluate({
    expectedHeadSha: STALE,
    run: run({
      result: JSON.stringify(verdict({ headSha: HEAD })),
    }),
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /does not match current PR head/);
});

test('synthetic merge ref is not reviewed-head proof', () => {
  const result = evaluate({ expectedHeadSha: 'refs/pull/21/merge' });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /merge refs are not proof/);
});

test('model spoofing: Fable runtime cannot PASS as Grok Extra High', () => {
  const result = evaluate({
    agent: agent({
      originalModelName: 'claude-fable-5-1',
      model: { id: 'claude-fable-5-1', displayName: 'Fable 5.1' },
    }),
    run: run({
      originalModelName: 'claude-fable-5-1',
      model: { id: 'claude-fable-5-1' },
      result: JSON.stringify(
        verdict({
          model: { id: 'cursor-grok-4.6-xhigh', displayName: 'spoofed' },
        }),
      ),
    }),
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /Model picker\/runtime/);
});

test('role spoofing: implementer agent cannot self-review', () => {
  const asImplementer = evaluate({
    agent: agent({ id: IMPLEMENTER, name: 'Implement AR-41' }),
    implementerAgentId: IMPLEMENTER,
  });
  assert.equal(asImplementer.passed, false);
  assert.match(
    asImplementer.failures.join('\n'),
    /different cloud agent than the implementer/,
  );

  const named = evaluate({
    run: run({
      result: JSON.stringify(verdict({ role: 'implementer' })),
    }),
  });
  assert.equal(named.passed, false);
  assert.match(named.failures.join('\n'), /independent-reviewer/);
});

test('verifier and recorder roles are rejected', () => {
  const verifier = evaluate({
    agent: agent({ id: VERIFIER, name: 'Verify AR-41' }),
    verifierAgentId: VERIFIER,
  });
  assert.equal(verifier.passed, false);
  const recorder = evaluate({
    run: run({
      result: JSON.stringify(verdict({ role: 'recorder' })),
    }),
  });
  assert.equal(recorder.passed, false);
});

test('unresolved material findings fail even if axes say PASS', () => {
  const result = evaluate({
    run: run({
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
  const missing = evaluate({ run: run({ result: '' }) });
  assert.equal(missing.passed, false);
  const unfinished = evaluate({ run: run({ status: 'RUNNING' }) });
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
  const withoutAgent = evaluateIndependentReview({
    expectedHeadSha: HEAD,
    catalog,
    agent: null,
    run: run(),
  });
  assert.equal(withoutAgent.passed, false);
});

test('local or non-cloud env fails closed', () => {
  const result = evaluate({ agent: agent({ env: { type: 'local' } }) });
  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /Cursor Cloud/);
});
