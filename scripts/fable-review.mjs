import { appendFileSync } from 'node:fs';
import { event, github, publishStatus, repository } from './workflow-api.mjs';
import { reviewPassed } from './workflow-gates.mjs';

const number =
  event.pull_request?.number ??
  event.issue?.number ??
  Number(process.env.PR_NUMBER);
if (!Number.isSafeInteger(number) || number < 1)
  throw new Error('Missing pull request number');
const pr = await github(`pulls/${number}`);
const context = 'Fable review';
if (pr.base?.ref !== 'main')
  throw new Error('Review requires a PR targeting main');
if (pr.user?.type !== 'User' || pr.head.repo?.full_name !== repository)
  throw new Error('Review requires a human-authored same-repository PR');
if (process.argv[2] === 'begin') {
  if (pr.draft || pr.state !== 'open')
    throw new Error('Review requires an open, ready PR');
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `sha=${pr.head.sha}\nnumber=${number}\n`,
  );
  await publishStatus(pr.head.sha, {
    context,
    state: 'pending',
    description: 'Fable 5.1 reviewing this exact revision',
  });
} else {
  const sha = process.env.REVIEW_SHA;
  if (!/^[a-f0-9]{40}$/.test(sha ?? ''))
    throw new Error('Missing frozen review SHA');
  let review = null;
  try {
    review = JSON.parse(process.env.REVIEW_OUTPUT ?? '');
  } catch {
    /* Invalid model output fails closed below. */
  }
  const passed =
    process.env.REVIEW_JOB_RESULT === 'success' &&
    process.env.REVIEW_OUTCOME === 'success' &&
    pr.state === 'open' &&
    !pr.draft &&
    pr.head.sha === sha &&
    reviewPassed(review, sha);
  await publishStatus(sha, {
    context,
    state: passed ? 'success' : 'failure',
    description: passed
      ? 'Fable 5.1: standards PASS, spec PASS, no required fixes'
      : 'Fable review failed, incomplete, stale, or requires fixes',
  });
  await github(`issues/${number}/comments`, {
    body: `Independent Fable 5.1 review of ${sha}: **${passed ? 'PASS' : 'CHANGES_REQUIRED / BLOCKED'}**\n\n${review?.summary ?? 'No valid structured review was returned; inspect the workflow run.'}\n\n${Array.isArray(review?.required_fixes) ? review.required_fixes.map((fix) => `- ${fix}`).join('\n') : ''}`,
  });
  if (!passed) process.exitCode = 1;
}
