import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ticketIdentifier,
  verificationPassed,
  reviewPassed,
  queuePulls,
} from './workflow-gates.mjs';

const sha = 'a'.repeat(40);
test('ticket ownership uses branch or an explicit Linear line, never incidental references', () => {
  assert.equal(
    ticketIdentifier({
      head: { ref: 'codex/ar-42-reader' },
      body: 'Linear: AR-3',
    }),
    'AR-42',
  );
  assert.equal(
    ticketIdentifier({ head: { ref: 'codex/reader' }, body: 'Fixes AR-3' }),
    null,
  );
  assert.equal(
    ticketIdentifier({ head: { ref: 'codex/reader' }, body: 'Linear: AR-3' }),
    'AR-3',
  );
});
test('verification requires In Review and PASS evidence for the exact head with a recording', () => {
  const issue = {
    state: { name: 'In Review' },
    comments: {
      nodes: [
        {
          body: `VERIFICATION_SHA: ${sha}\nVERIFICATION_RESULT: PASS\nVERIFICATION_VIDEO: https://cursor.com/recording/1`,
        },
      ],
    },
  };
  assert.equal(verificationPassed(issue, sha), true);
  assert.equal(verificationPassed(issue, 'b'.repeat(40)), false);
  assert.equal(
    verificationPassed({ ...issue, state: { name: 'In Testing' } }, sha),
    false,
  );
  assert.equal(
    verificationPassed(
      {
        ...issue,
        comments: {
          nodes: [
            { body: `VERIFICATION_SHA: ${sha}\nVERIFICATION_RESULT: PASS` },
          ],
        },
      },
      sha,
    ),
    false,
  );
});
test('review rejects stale, missing, malformed and qualified verdicts', () => {
  const review = {
    sha,
    standards: 'PASS',
    spec: 'PASS',
    required_fixes: [],
    summary: 'Reviewed callers and criteria.',
  };
  assert.equal(reviewPassed(review, sha), true);
  assert.equal(reviewPassed(review, 'b'.repeat(40)), false);
  assert.equal(
    reviewPassed({ ...review, required_fixes: ['Fix data loss'] }, sha),
    false,
  );
  assert.equal(
    reviewPassed({ ...review, standards: 'PASS with required fixes' }, sha),
    false,
  );
  assert.equal(reviewPassed(null, sha), false);
  assert.equal(
    reviewPassed({ ...review, required_fixes: undefined }, sha),
    false,
  );
});
test('merge group checks every included current PR head and refuses an unresolved lead PR', () => {
  const pulls = [
    { number: 1, head: { sha } },
    { number: 2, head: { sha: 'b'.repeat(40) } },
  ];
  assert.deepEqual(
    queuePulls(
      pulls,
      [sha, 'b'.repeat(40)],
      'refs/heads/gh-readonly-queue/main/pr-2-abc',
    ),
    pulls,
  );
  assert.throws(() =>
    queuePulls(pulls, [sha], 'refs/heads/gh-readonly-queue/main/pr-2-abc'),
  );
  assert.throws(() => queuePulls([], [], 'unexpected-ref'));
});

test('video N/A is permitted only for exclusively delivery workflow files', () => {
  const issue = {
    state: { name: 'In Review' },
    comments: {
      nodes: [
        {
          body: `VERIFICATION_SHA: ${sha}\nVERIFICATION_RESULT: PASS\nVERIFICATION_VIDEO: NOT_APPLICABLE`,
        },
      ],
    },
  };
  assert.equal(
    verificationPassed(issue, sha, [
      '.github/workflows/ci.yml',
      'scripts/dispatch-plan.mjs',
    ]),
    true,
  );
  assert.equal(verificationPassed(issue, sha, ['src/main/index.ts']), false);
  assert.equal(verificationPassed(issue, sha, []), false);
  assert.equal(verificationPassed(issue, sha, ['package.json']), false);
});
