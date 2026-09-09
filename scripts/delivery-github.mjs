import {
  redactSecrets,
  TRUSTED_REVIEW_JOB_NAME,
} from './delivery-constants.mjs';

export async function githubJson(
  path,
  { token, method = 'GET', body, accept, fetchImpl = fetch } = {},
) {
  const response = await fetchImpl(`https://api.github.com/${path}`, {
    method,
    headers: {
      Accept: accept ?? 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      redactSecrets(`GitHub ${method} ${path} returned ${response.status}`),
    );
  }
  return payload;
}

export async function fetchPullRequest(repository, prNumber, options) {
  return githubJson(`repos/${repository}/pulls/${prNumber}`, options);
}

export async function fetchPullFiles(repository, prNumber, options) {
  const files = [];
  let page = 1;
  for (;;) {
    const batch = await githubJson(
      `repos/${repository}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      options,
    );
    files.push(...(Array.isArray(batch) ? batch : []));
    if (!Array.isArray(batch) || batch.length < 100) break;
    page += 1;
    if (page > 20) break;
  }
  return files.map((file) => file.filename).filter(Boolean);
}

export async function fetchDefaultBranchSha(
  repository,
  defaultBranch,
  options,
) {
  const ref = await githubJson(
    `repos/${repository}/git/ref/heads/${encodeURIComponent(defaultBranch)}`,
    options,
  );
  return ref?.object?.sha;
}

export async function fetchCompare(repository, base, head, options) {
  return githubJson(`repos/${repository}/compare/${base}...${head}`, options);
}

export async function fetchCommitCheckRuns(repository, sha, options) {
  const checks = [];
  let page = 1;
  for (;;) {
    const payload = await githubJson(
      `repos/${repository}/commits/${sha}/check-runs?per_page=100&page=${page}`,
      options,
    );
    checks.push(...(payload?.check_runs ?? []));
    if ((payload?.check_runs ?? []).length < 100) break;
    page += 1;
    if (page > 10) break;
  }
  return checks.map((check) => ({
    id: check.id,
    name: check.name,
    head_sha: check.head_sha,
    status: check.status,
    conclusion: check.conclusion,
    html_url: check.html_url,
    details_url: check.details_url,
    external_id: check.external_id,
    check_suite_id: check.check_suite?.id,
    app: check.app ? { slug: check.app.slug, id: check.app.id } : undefined,
    output: check.output
      ? { title: check.output.title, summary: check.output.summary }
      : undefined,
  }));
}

export function parseActionsRunJob(url) {
  const raw = String(url ?? '');
  const withJob = raw.match(/\/actions\/runs\/(\d+)\/(?:jobs?\/)?(\d+)/);
  if (withJob) return { runId: withJob[1], jobId: withJob[2] };
  const runOnly = raw.match(/\/actions\/runs\/(\d+)(?:\/|$)/);
  return runOnly ? { runId: runOnly[1], jobId: null } : null;
}

export async function fetchWorkflowRun(repository, runId, options) {
  return githubJson(`repos/${repository}/actions/runs/${runId}`, options);
}

export async function fetchActionsJob(repository, jobId, options) {
  return githubJson(`repos/${repository}/actions/jobs/${jobId}`, options);
}

export async function fetchWorkflowRunJobs(repository, runId, options) {
  const payload = await githubJson(
    `repos/${repository}/actions/runs/${runId}/jobs?per_page=100`,
    options,
  );
  return payload?.jobs ?? [];
}

export async function fetchWorkflowRunsForCheckSuite(
  repository,
  checkSuiteId,
  options,
) {
  const payload = await githubJson(
    `repos/${repository}/actions/runs?check_suite_id=${checkSuiteId}&per_page=1`,
    options,
  );
  return payload?.workflow_runs?.[0] ?? null;
}

export async function enrichCheckPublisher(check, repository, options) {
  const ids =
    parseActionsRunJob(check?.html_url) ??
    parseActionsRunJob(check?.details_url);
  let run = null;
  let job = null;
  if (ids?.runId) {
    run = await fetchWorkflowRun(repository, ids.runId, options);
  } else if (check?.check_suite_id) {
    run = await fetchWorkflowRunsForCheckSuite(
      repository,
      check.check_suite_id,
      options,
    );
  }
  if (ids?.jobId) {
    job = await fetchActionsJob(repository, ids.jobId, options);
  } else if (run?.id) {
    const jobs = await fetchWorkflowRunJobs(repository, run.id, options);
    job =
      jobs.find((entry) => entry.name === TRUSTED_REVIEW_JOB_NAME) ??
      jobs.find((entry) => entry.name === check?.name) ??
      null;
  }
  if (!run) {
    return { ...check, publisher: null };
  }
  return {
    ...check,
    publisher: {
      appId: check.app?.id,
      appSlug: check.app?.slug,
      runId: String(run.id),
      workflowPath: run.path,
      workflowName: run.name,
      event: run.event,
      jobName: job?.name ?? null,
      jobId: job?.id != null ? String(job.id) : (ids?.jobId ?? null),
      headBranch: run.head_branch,
      runHeadSha: run.head_sha,
    },
  };
}

export async function fetchReviewThreads(repository, prNumber, options) {
  const [owner, repo] = repository.split('/');
  const payload = await githubJson('graphql', {
    ...options,
    method: 'POST',
    body: {
      query: `query ($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) { nodes { isResolved } }
          }
        }
      }`,
      variables: { owner, repo, number: Number(prNumber) },
    },
  });
  return payload?.data?.repository?.pullRequest?.reviewThreads ?? { nodes: [] };
}

export async function fetchCommitPulls(repository, sha, options) {
  return githubJson(`repos/${repository}/commits/${sha}/pulls`, {
    ...options,
    accept: 'application/vnd.github+json',
  });
}

export async function listWorkflowFilesAtRef(repository, ref, options) {
  const listing = await githubJson(
    `repos/${repository}/contents/.github/workflows?ref=${encodeURIComponent(ref)}`,
    options,
  );
  const files = [];
  for (const entry of Array.isArray(listing) ? listing : []) {
    if (entry.type !== 'file' || !/\.ya?ml$/i.test(entry.name)) continue;
    const content = await githubJson(
      `repos/${repository}/contents/${entry.path}?ref=${encodeURIComponent(ref)}`,
      options,
    );
    const decoded = Buffer.from(content.content ?? '', 'base64').toString(
      'utf8',
    );
    files.push({ path: entry.path, content: decoded });
  }
  return files;
}

export async function postCheckRun(repository, body, options) {
  return githubJson(`repos/${repository}/check-runs`, {
    ...options,
    method: 'POST',
    body,
  });
}

export async function postIssueComment(repository, issueNumber, body, options) {
  return githubJson(`repos/${repository}/issues/${issueNumber}/comments`, {
    ...options,
    method: 'POST',
    body: { body },
  });
}
