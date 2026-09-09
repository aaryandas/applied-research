import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  changedLines,
  findingsOnDiff,
  validateAnalysis,
} from './hosted-sonar-rules.mjs';

const sha = 'a'.repeat(40);
test('changed lines exclude unchanged context and deleted lines', () => {
  const lines = changedLines(
    '@@ -2,3 +2,4 @@\n unchanged\n-old\n+new\n+extra\n same',
  );
  assert.deepEqual([...lines], [3, 4]);
});
test('new findings are scoped to changed source lines; file-level findings fail closed', () => {
  const files = [
    {
      filename: 'src/a.ts',
      status: 'modified',
      patch: '@@ -1 +1 @@\n-old\n+new',
    },
  ];
  const issues = [
    { key: 'introduced', component: 'project:src/a.ts', line: 1 },
    { key: 'legacy', component: 'project:src/a.ts', line: 10 },
    { key: 'file-level', component: 'project:src/a.ts' },
    { key: 'other', component: 'project:src/b.ts', line: 1 },
  ];
  assert.deepEqual(
    findingsOnDiff(issues, files).map((issue) => issue.key),
    ['introduced', 'file-level'],
  );
  assert.throws(() =>
    findingsOnDiff([], [{ filename: 'src/a.ts', status: 'modified' }]),
  );
});
test('Sonar receipt binds completed server task, quality gate and analysis revision', () => {
  const evidence = {
    sha,
    task: { status: 'SUCCESS', analysisId: 'analysis-1' },
    analysis: { key: 'analysis-1', revision: sha },
    gate: { status: 'OK' },
    findings: [],
  };
  assert.equal(validateAnalysis(evidence), true);
  assert.equal(
    validateAnalysis({
      ...evidence,
      analysis: { key: 'analysis-1', revision: 'b'.repeat(40) },
    }),
    false,
  );
  assert.equal(
    validateAnalysis({ ...evidence, gate: { status: 'ERROR' } }),
    false,
  );
  assert.equal(
    validateAnalysis({ ...evidence, findings: [{ key: 'introduced' }] }),
    false,
  );
  assert.equal(
    validateAnalysis({ ...evidence, task: { status: 'PENDING' } }),
    false,
  );
});
