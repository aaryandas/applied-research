const REPOSITORY = 'aaryandas/applied-research';
const WORKFLOWS = {
  'Fable review': {
    path: '.github/workflows/claude-review.yml',
    events: ['pull_request_target', 'issue_comment'],
  },
  'Linear gate': {
    path: '.github/workflows/linear-gate.yml',
    events: [
      'pull_request_target',
      'schedule',
      'workflow_dispatch',
      'repository_dispatch',
    ],
  },
  'Sonar gate': {
    path: '.github/workflows/sonar.yml',
    events: ['workflow_run', 'schedule', 'workflow_dispatch'],
  },
};

export function gateRunId(status) {
  try {
    const url = new URL(status.target_url);
    const match = url.pathname.match(
      /^\/aaryandas\/applied-research\/actions\/runs\/(\d+)$/,
    );
    return url.origin === 'https://github.com' &&
      !url.search &&
      !url.hash &&
      match
      ? Number(match[1])
      : null;
  } catch {
    return null;
  }
}

export function trustedGateRun(status, run, sha) {
  const workflow = WORKFLOWS[status.context];
  return Boolean(
    workflow &&
    gateRunId(status) === run?.id &&
    status.creator?.login === 'github-actions[bot]' &&
    run.repository?.full_name === REPOSITORY &&
    run.path === workflow.path &&
    // PR-target workflow code comes from its base, not necessarily main.
    // Only GitHub's run metadata can establish that base; receipts are untrusted
    // until this check passes. workflow_run always uses the default workflow.
    (run.event === 'pull_request_target'
      ? /^[a-f0-9]{40}$/.test(sha ?? '') &&
        Array.isArray(run.pull_requests) &&
        run.pull_requests.some(
          (pr) => pr.base?.ref === 'main' && pr.head?.sha === sha,
        )
      : run.head_branch === 'main' || run.event === 'workflow_run') &&
    workflow.events.includes(run.event),
  );
}

export function trustedGateStatus({ sha, status, run, receipt }) {
  if (!trustedGateRun(status, run, sha)) return false;
  if (status.state === 'pending') return run.status !== 'completed';
  const completed =
    run.status === 'completed' &&
    (run.conclusion === 'success' ||
      (status.state !== 'success' && run.conclusion === 'failure'));
  return (
    completed &&
    receipt?.runId === String(run.id) &&
    receipt.context === status.context &&
    receipt.sha === sha &&
    receipt.state === status.state &&
    receipt.workflowRef ===
      `${REPOSITORY}/${WORKFLOWS[status.context].path}@refs/heads/main` &&
    /^[a-f0-9]{40}$/.test(receipt.workflowSha ?? '')
  );
}

export function gateReceiptFilename(context, sha) {
  return `${context.toLowerCase().replace(/[^a-z0-9]+/g, '-')}--${sha}.json`;
}
