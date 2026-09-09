import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ticketIdentifier,
  verificationPassed,
  reviewPassed,
} from './workflow-gates.mjs';

const sha = 'a'.repeat(40);
test('a copied Linear PASS cannot impersonate the Cursor cloud verifier', () => {
  const issue = {
    state: { name: 'In Review' },
    comments: {
      nodes: [
        {
          user: { id: 'connected-user' },
          body: `VERIFICATION_SHA: ${sha}\nVERIFICATION_RESULT: PASS\nVERIFICATION_VIDEO: https://uploads.linear.app/14eb3a60-92fc-4809-bfb7-320389ee012d/26d4b58e-b75e-4ab0-b760-e2347810aa11/c91dddf6-2d54-42e0-9afc-5ae30c79543e`,
        },
      ],
    },
  };
  assert.equal(
    verificationPassed(issue, sha, {
      linearUserId: 'connected-user',
      attestations: [],
    }),
    false,
  );
});
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
const recording =
  'https://uploads.linear.app/14eb3a60-92fc-4809-bfb7-320389ee012d/26d4b58e-b75e-4ab0-b760-e2347810aa11/c91dddf6-2d54-42e0-9afc-5ae30c79543e';
const linearUserId = 'connected-user';
function verificationFixture(video = recording) {
  const body = `VERIFICATION_SHA: ${sha}\nVERIFICATION_RESULT: PASS\nVERIFICATION_VIDEO: ${video}`;
  return {
    issue: {
      state: { name: 'In Review' },
      comments: { nodes: [{ user: { id: linearUserId }, body }] },
    },
    options: {
      linearUserId,
      attestations: [
        {
          user: { id: 206951365, login: 'cursor[bot]', type: 'Bot' },
          body,
          commit_id: sha,
        },
      ],
    },
  };
}
test('verification requires matching Cursor bot evidence and a Linear recording at the exact head', () => {
  const { issue, options } = verificationFixture();
  assert.equal(verificationPassed(issue, sha, options), true);
  assert.equal(verificationPassed(issue, 'b'.repeat(40), options), false);
  assert.equal(
    verificationPassed(
      { ...issue, state: { name: 'In Testing' } },
      sha,
      options,
    ),
    false,
  );
  assert.equal(
    verificationPassed(issue, sha, {
      ...options,
      linearUserId: 'someone-else',
    }),
    false,
  );
  assert.equal(
    verificationPassed(issue, sha, { ...options, attestations: [] }),
    false,
  );
  for (const user of [
    { id: 1, login: 'cursor[bot]', type: 'Bot' },
    { id: 206951365, login: 'other[bot]', type: 'Bot' },
    { id: 206951365, login: 'cursor[bot]', type: 'User' },
  ]) {
    assert.equal(
      verificationPassed(issue, sha, {
        ...options,
        attestations: [{ ...options.attestations[0], user }],
      }),
      false,
    );
  }
  assert.equal(
    verificationPassed(issue, sha, {
      ...options,
      attestations: [{ ...options.attestations[0], commit_id: 'b'.repeat(40) }],
    }),
    false,
  );
  assert.equal(
    verificationPassed(issue, sha, {
      ...options,
      attestations: [
        {
          ...options.attestations[0],
          body: options.attestations[0].body.replace('c91dddf6', 'a91dddf6'),
        },
      ],
    }),
    false,
  );
});
test('arbitrary HTTPS links and duplicate verdicts cannot serve as recording evidence', () => {
  for (const video of [
    'https://example.com/fake.mp4',
    'https://uploads.linear.app.evil.example/a/b/c',
    'https://uploads.linear.app/not-a-recording',
    recording + '#fake',
  ]) {
    const { issue, options } = verificationFixture(video);
    assert.equal(verificationPassed(issue, sha, options), false);
  }
  const { issue, options } = verificationFixture();
  issue.comments.nodes[0].body += '\nVERIFICATION_RESULT: BLOCKED';
  assert.equal(verificationPassed(issue, sha, options), false);
});
test('renewed Linear URL signatures preserve recording identity', () => {
  const { issue, options } = verificationFixture(
    recording + '?signature=expired',
  );
  options.attestations[0].body = options.attestations[0].body.replace(
    'signature=expired',
    'signature=renewed',
  );
  assert.equal(verificationPassed(issue, sha, options), true);
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
test('video N/A requires Cursor identity and exclusively delivery workflow files', () => {
  const { issue, options } = verificationFixture('NOT_APPLICABLE');
  const files = [
    '.github/workflows/ci.yml',
    'scripts/dispatch-plan.mjs',
    '.gitignore',
    'scripts/delivery-merge.mjs',
    'scripts/fable-review.test.mjs',
    'scripts/lane-guard.mjs',
    'scripts/lane-guard-rules.mjs',
    'scripts/lane-guard.test.mjs',
    'context/conventions.md',
  ];
  assert.equal(verificationPassed(issue, sha, { ...options, files }), true);
  assert.equal(
    verificationPassed(issue, sha, { ...options, files, attestations: [] }),
    false,
  );
  for (const otherFiles of [
    ['src/main/index.ts'],
    ['.gitignore', 'src/main/index.ts'],
    [],
    ['package.json'],
  ]) {
    assert.equal(
      verificationPassed(issue, sha, { ...options, files: otherFiles }),
      false,
    );
  }
});
