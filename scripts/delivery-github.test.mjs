import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GITHUB_ACTIONS_APP_ID,
  GITHUB_ACTIONS_APP_SLUG,
  TRUSTED_REVIEW_JOB_NAME,
  TRUSTED_WORKFLOW_FILE,
} from './delivery-constants.mjs';
import {
  enrichCheckPublisher,
  parseActionsRunJob,
  fetchCollaboratorPermission,
} from './delivery-github.mjs';

test('parseActionsRunJob keeps GitHub Actions run/job ids from html_url', () => {
  assert.deepEqual(
    parseActionsRunJob(
      'https://github.com/aaryandas/applied-research/actions/runs/34335523782/job/987654321',
    ),
    { runId: '34335523782', jobId: '987654321' },
  );
  assert.deepEqual(
    parseActionsRunJob(
      'https://github.com/aaryandas/applied-research/actions/runs/12',
    ),
    { runId: '12', jobId: null },
  );
  assert.equal(parseActionsRunJob('https://github.com/runs/1'), null);
});

test('enrichCheckPublisher requires GET run path and job name', async () => {
  const check = {
    name: 'Independent review / Cursor Cloud Grok 4.6 Extra High',
    html_url:
      'https://github.com/aaryandas/applied-research/actions/runs/1/job/2',
    app: { slug: GITHUB_ACTIONS_APP_SLUG, id: GITHUB_ACTIONS_APP_ID },
    output: { summary: 'githubRunId=1' },
  };
  const enriched = await enrichCheckPublisher(
    check,
    'aaryandas/applied-research',
    {
      token: 'ghs_test',
      fetchImpl: async (url) => {
        const href = String(url);
        const json = (body) => ({
          ok: true,
          status: 200,
          async json() {
            return body;
          },
        });
        if (href.endsWith('/actions/jobs/2')) {
          return json({ id: 2, name: TRUSTED_REVIEW_JOB_NAME, run_id: 1 });
        }
        if (href.endsWith('/actions/runs/1')) {
          return json({
            id: 1,
            path: TRUSTED_WORKFLOW_FILE,
            event: 'workflow_run',
            name: 'Independent review',
            head_branch: 'main',
            head_sha: 'a'.repeat(40),
          });
        }
        throw new Error(`unexpected ${href}`);
      },
    },
  );
  assert.equal(enriched.publisher.workflowPath, TRUSTED_WORKFLOW_FILE);
  assert.equal(enriched.publisher.jobName, TRUSTED_REVIEW_JOB_NAME);
  assert.equal(enriched.publisher.runId, '1');
  assert.equal(enriched.publisher.event, 'workflow_run');
});

test('collaborator permission 404 is none, not write', async () => {
  const none = await fetchCollaboratorPermission(
    'aaryandas/applied-research',
    'stranger',
    {
      token: 'ghs_test',
      fetchImpl: async () => ({
        ok: false,
        status: 404,
        async json() {
          return { message: 'Not Found' };
        },
      }),
    },
  );
  assert.equal(none.permission, 'none');
});
