import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  changedLines,
  findingsOnDiff,
  validateAnalysis,
  stageCoverage,
} from './hosted-sonar-rules.mjs';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sha = 'a'.repeat(40);
test('changed lines exclude unchanged context and deleted lines', () => {
  const lines = changedLines(
    '@@ -2,3 +2,4 @@\n unchanged\n-old\n+new\n+extra\n same',
  );
  assert.deepEqual([...lines], [3, 4]);
});

test('untrusted coverage cannot redirect writes into trusted scripts', () => {
  const root = mkdtempSync(join(tmpdir(), 'sonar-coverage-'));
  const candidate = join(root, 'candidate');
  const coveragePath = join(root, 'artifact');
  const trusted = join(root, 'scripts');
  for (const path of [candidate, coveragePath, trusted]) mkdirSync(path);
  writeFileSync(
    join(coveragePath, 'lcov.info'),
    'SF:src/a.ts\nend_of_record\n',
  );
  writeFileSync(join(trusted, 'lcov.info'), 'trusted');
  try {
    symlinkSync(trusted, join(candidate, 'coverage'), 'dir');
    assert.throws(() => stageCoverage({ candidate, coveragePath }), /symlinks/);
    assert.equal(readFileSync(join(trusted, 'lcov.info'), 'utf8'), 'trusted');
    rmSync(join(candidate, 'coverage'));
    stageCoverage({ candidate, coveragePath });
    assert.equal(
      readFileSync(join(candidate, 'coverage/lcov.info'), 'utf8'),
      'SF:src/a.ts\nend_of_record\n',
    );
    rmSync(join(coveragePath, 'lcov.info'));
    symlinkSync(join(trusted, 'lcov.info'), join(coveragePath, 'lcov.info'));
    assert.throws(() => stageCoverage({ candidate, coveragePath }), /symlinks/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
