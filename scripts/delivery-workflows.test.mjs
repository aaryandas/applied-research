import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { REVIEW_CHECK_NAME } from './delivery-constants.mjs';

const untrusted = readFileSync('.github/workflows/claude-review.yml', 'utf8');
const trusted = readFileSync(
  '.github/workflows/independent-review-trusted.yml',
  'utf8',
);
const queue = readFileSync('.github/workflows/delivery-queue.yml', 'utf8');
const verify = readFileSync('.github/workflows/verify.yml', 'utf8');

test('F1: untrusted pull_request workflow never references CURSOR_API_KEY', () => {
  assert.equal(untrusted.includes('secrets.CURSOR_API_KEY'), false);
  assert.equal(untrusted.includes('CURSOR_API_KEY'), false);
  assert.match(untrusted, /Independent review \(untrusted pending\)/);
  assert.match(untrusted, /node scripts\/delivery-review\.mjs untrusted/);
  assert.equal(untrusted.includes('anthropics/claude-code-action'), false);
  assert.equal(untrusted.includes('claude-fable-5-1'), false);
  assert.equal(untrusted.includes('allowed_bots'), false);
});

test('trusted evaluator checks out the default branch only and pins starting evaluation', () => {
  assert.match(trusted, /environment: trusted-cursor/);
  assert.match(
    trusted,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/,
  );
  assert.match(trusted, /persist-credentials: false/);
  assert.match(trusted, /workflow_run:/);
  assert.match(trusted, /Independent review \(untrusted pending\)/);
  assert.match(trusted, /- CI/);
  assert.match(trusted, /github\.event\.workflow_run\.event == 'pull_request'/);
  assert.match(trusted, /workflow_dispatch:/);
  assert.match(trusted, /secrets\.CURSOR_API_KEY/);
  assert.match(trusted, /node scripts\/delivery-review\.mjs evaluate/);
  assert.match(
    trusted,
    /github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/,
  );
  assert.equal(trusted.includes('claude-fable-5-1'), false);
});

test('F5: queue pull_request job is notice-only; live job is default-branch dispatch', () => {
  assert.match(queue, /node scripts\/delivery-queue\.mjs untrusted/);
  assert.match(queue, /node scripts\/delivery-queue\.mjs evaluate/);
  assert.match(queue, /group: delivery-queue-live/);
  assert.match(queue, /cancel-in-progress: false/);
  const untrustedJob = queue.split('trusted-evaluate:')[0];
  assert.equal(untrustedJob.includes('LINEAR_API_KEY'), false);
  assert.equal(untrustedJob.includes('CURSOR_API_KEY'), false);
  assert.match(queue, /LINEAR_API_KEY/);
});

test('verify.yml uploads coverage from macOS and does not invoke Fable', () => {
  assert.match(verify, /if: runner\.os == 'macOS'/);
  assert.equal(/Save coverage[\s\S]*runner\.os == 'Linux'/.test(verify), false);
  assert.match(verify, /npm run test:delivery/);
  assert.equal(verify.includes('claude-fable'), false);
});

test('review check name stays the exact-head gate name', () => {
  assert.equal(
    REVIEW_CHECK_NAME,
    'Independent review / Cursor Cloud Grok 4.6 Extra High',
  );
  assert.match(trusted, /name: Independent review\n/);
  assert.match(trusted, /name: Cursor Cloud Grok 4\.6 Extra High/);
});
