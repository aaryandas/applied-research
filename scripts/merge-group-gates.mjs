import { event, github, paginate, publishStatus } from './workflow-api.mjs';
import { queuePulls } from './workflow-gates.mjs';

const context = process.env.GATE_CONTEXT;
if (!['Lane guard', 'Fable review'].includes(context))
  throw new Error('Unknown gate');
const group = event.merge_group;
if (!group) throw new Error('Expected merge_group event');
let result;
try {
  const comparison = await github(
    `compare/${group.base_sha}...${group.head_sha}?per_page=100`,
  );
  if (comparison.total_commits > comparison.commits.length)
    throw new Error('Merge group comparison truncated');
  const pulls = queuePulls(
    await paginate('pulls?state=open'),
    comparison.commits.map((commit) => commit.sha),
    group.head_ref,
  );
  for (const pr of pulls) {
    if (context === 'Fable review') {
      const statuses = await github(`commits/${pr.head.sha}/status`);
      if (
        statuses.statuses.find((status) => status.context === context)
          ?.state !== 'success'
      )
        throw new Error(
          `PR #${pr.number}: Fable review is not passing at current head`,
        );
    } else {
      const checks = await github(
        `commits/${pr.head.sha}/check-runs?filter=latest&per_page=100`,
      );
      if (
        !checks.check_runs.some(
          (check) =>
            check.name === context &&
            check.app.slug === 'github-actions' &&
            check.conclusion === 'success',
        )
      )
        throw new Error(
          `PR #${pr.number}: Lane guard is not passing at current head`,
        );
    }
  }
  result = {
    state: 'success',
    description: `All merge-group PRs have passing ${context}`,
  };
} catch (error) {
  result = { state: 'failure', description: error.message.slice(0, 140) };
}
await publishStatus(group.head_sha, { context, ...result });
if (result.state !== 'success') process.exitCode = 1;
