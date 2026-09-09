import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMetadata } from './conventional-metadata.mjs';

test('accepts conventional PR titles and commit subjects with an AR ticket', () => {
  assert.deepEqual(
    validateMetadata({
      title: 'fix(ci): AR-41 make platform checks portable',
      subjects: [
        'fix(ci): AR-41 make platform checks portable',
        'docs(workflow): AR-41 document metadata requirements',
      ],
    }),
    [],
  );
});

test('rejects jumbled titles and subjects', () => {
  assert.deepEqual(
    validateMetadata({
      title: 'AR-41 CI fixes',
      subjects: ['Fix Windows tests', 'feat: add sourcing'],
    }),
    [
      'PR title must match type(scope): AR-NN description; received "AR-41 CI fixes"',
      'commit 1 must match type(scope): AR-NN description; received "Fix Windows tests"',
      'commit 2 must match type(scope): AR-NN description; received "feat: add sourcing"',
    ],
  );
});
