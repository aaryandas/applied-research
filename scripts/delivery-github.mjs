import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  INDEPENDENT_REVIEW_LAUNCH_RECEIPT_FILE,
  INDEPENDENT_REVIEW_RECEIPT_FILE,
  MAX_INDEPENDENT_REVIEW_ARTIFACT_BYTES,
  MAX_INDEPENDENT_REVIEW_RECEIPT_CHARS,
  REVIEW_CHECK_NAME,
  TRUSTED_GITHUB_EVENTS,
  TRUSTED_LAUNCH_EVENT,
  TRUSTED_REVIEW_JOB_NAME,
  TRUSTED_WORKFLOW_FILE,
  independentReviewArtifactName,
  independentReviewLaunchArtifactName,
  redactSecrets,
} from './delivery-constants.mjs';
import {
  parseIndependentReviewReceipt,
  parseTrustedLaunchReceipt,
} from './delivery-trust.mjs';

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

export async function fetchCollaboratorPermission(
  repository,
  username,
  options,
) {
  const login = String(username ?? '').trim();
  if (!login) return { permission: 'none' };
  const path = `repos/${repository}/collaborators/${encodeURIComponent(login)}/permission`;
  const response = await (options.fetchImpl ?? fetch)(
    `https://api.github.com/${path}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${options.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (response.status === 404) return { permission: 'none' };
  if (!response.ok) {
    throw new Error(
      redactSecrets(`GitHub GET ${path} returned ${response.status}`),
    );
  }
  return payload;
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

export function parseNativeJobCheckRunId(checkRunUrl) {
  const match = String(checkRunUrl ?? '').match(/\/check-runs\/(\d+)(?:\/|$)/);
  return match ? Number(match[1]) : null;
}

export async function fetchWorkflowRun(repository, runId, options) {
  return githubJson(`repos/${repository}/actions/runs/${runId}`, options);
}

export async function fetchWorkflowRunJobs(repository, runId, options) {
  const payload = await githubJson(
    `repos/${repository}/actions/runs/${runId}/jobs?per_page=100`,
    options,
  );
  return payload?.jobs ?? [];
}

export async function listActionsArtifactsByName(repository, name, options) {
  const payload = await githubJson(
    `repos/${repository}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`,
    options,
  );
  return Array.isArray(payload?.artifacts) ? payload.artifacts : [];
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') {
    return headers.get(name);
  }
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

async function readBoundedBytes(response, maxBytes) {
  const declared = Number(headerValue(response.headers, 'content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('Independent-review artifact exceeds size bound');
  }
  let bytes;
  if (Buffer.isBuffer(response.body)) {
    bytes = response.body;
  } else if (response.body instanceof Uint8Array) {
    bytes = Buffer.from(response.body);
  } else if (typeof response.arrayBuffer === 'function') {
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error('Artifact download did not return bytes');
  }
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new Error('Independent-review artifact exceeds size bound');
  }
  return bytes;
}

export async function downloadActionsArtifactZip(
  repository,
  artifactId,
  {
    token,
    fetchImpl = fetch,
    maxBytes = MAX_INDEPENDENT_REVIEW_ARTIFACT_BYTES,
  } = {},
) {
  const path = `repos/${repository}/actions/artifacts/${artifactId}/zip`;
  const response = await fetchImpl(`https://api.github.com/${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'manual',
  });
  if (
    response.status === 301 ||
    response.status === 302 ||
    response.status === 307 ||
    response.status === 308
  ) {
    const location = headerValue(response.headers, 'location');
    if (!location) {
      throw new Error(
        redactSecrets(`GitHub GET ${path} redirect missing Location`),
      );
    }
    const redirected = await fetchImpl(location, { method: 'GET' });
    if (!redirected.ok) {
      throw new Error(
        redactSecrets(
          `GitHub GET ${path} artifact bytes returned ${redirected.status}`,
        ),
      );
    }
    return readBoundedBytes(redirected, maxBytes);
  }
  if (!response.ok) {
    throw new Error(
      redactSecrets(`GitHub GET ${path} returned ${response.status}`),
    );
  }
  return readBoundedBytes(response, maxBytes);
}

export function extractNamedFileFromZip(
  zipBuffer,
  fileName,
  { unzipBin = 'unzip' } = {},
) {
  const bytes = Buffer.isBuffer(zipBuffer)
    ? zipBuffer
    : Buffer.from(zipBuffer ?? []);
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_INDEPENDENT_REVIEW_ARTIFACT_BYTES
  ) {
    throw new Error('Independent-review artifact exceeds size bound');
  }
  const dir = mkdtempSync(join(tmpdir(), 'ar-review-artifact-'));
  const zipPath = join(dir, 'artifact.zip');
  try {
    writeFileSync(zipPath, bytes);
    const listed = spawnSync(unzipBin, ['-Z', '-1', zipPath], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: MAX_INDEPENDENT_REVIEW_ARTIFACT_BYTES,
    });
    if (listed.status !== 0) {
      throw new Error(
        'unzip could not list the Actions artifact; no JavaScript zip parser fallback',
      );
    }
    const names = listed.stdout
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    const match = names.find(
      (name) => name === fileName || name.endsWith(`/${fileName}`),
    );
    if (!match || names.length > 8) {
      throw new Error(
        'Artifact zip does not contain a bounded independent-review receipt file',
      );
    }
    const extracted = spawnSync(unzipBin, ['-p', zipPath, match], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: MAX_INDEPENDENT_REVIEW_RECEIPT_CHARS,
    });
    if (extracted.status !== 0) {
      throw new Error('unzip could not extract the independent-review receipt');
    }
    return extracted.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function failedBinding(reason) {
  return { ok: false, reason };
}

async function verifyIndependentReviewArtifact({
  artifact,
  check,
  repository,
  prNumber,
  headSha,
  defaultBranch,
  token,
  fetchImpl,
  extractZipFile,
}) {
  if (!artifact || artifact.expired === true) {
    return failedBinding('expired-artifact');
  }
  if (Number(artifact.size_in_bytes) > MAX_INDEPENDENT_REVIEW_ARTIFACT_BYTES) {
    return failedBinding('artifact-too-large');
  }
  const runId = artifact.workflow_run?.id;
  if (!/^\d+$/.test(String(runId ?? ''))) {
    return failedBinding('artifact-missing-workflow-run');
  }
  const github = { token, fetchImpl };
  const run = await fetchWorkflowRun(repository, runId, github);
  if (Number(run?.id) !== Number(runId)) {
    return failedBinding('run-id-mismatch');
  }
  if (run.path !== TRUSTED_WORKFLOW_FILE) {
    return failedBinding('wrong-workflow');
  }
  if (!TRUSTED_GITHUB_EVENTS.includes(run.event)) {
    return failedBinding('wrong-event');
  }
  if (
    run.event === 'workflow_dispatch' &&
    run.head_branch &&
    run.head_branch !== defaultBranch
  ) {
    return failedBinding('dispatch-not-default-branch');
  }
  const jobs = await fetchWorkflowRunJobs(repository, run.id, github);
  const job = (jobs ?? []).find(
    (entry) => entry.name === TRUSTED_REVIEW_JOB_NAME,
  );
  if (!job) {
    return failedBinding('missing-expected-job');
  }
  if (Number(job.run_id) !== Number(run.id)) {
    return failedBinding('job-run-mismatch');
  }
  if (job.status !== 'completed' || job.conclusion !== 'success') {
    return failedBinding('job-not-success');
  }
  const nativeJobCheckId = parseNativeJobCheckRunId(job.check_run_url);
  const zip = await downloadActionsArtifactZip(repository, artifact.id, github);
  const extract = extractZipFile ?? extractNamedFileFromZip;
  let raw;
  try {
    raw = extract(zip, INDEPENDENT_REVIEW_RECEIPT_FILE);
  } catch {
    return failedBinding('receipt-extract-failed');
  }
  const parsed = parseIndependentReviewReceipt(raw);
  if (!parsed.ok) {
    return failedBinding(parsed.reason);
  }
  const receipt = parsed.receipt;
  if (Number(receipt.customCheckId) !== Number(check.id)) {
    return failedBinding('custom-check-id-mismatch');
  }
  if (Number(receipt.prNumber) !== Number(prNumber)) {
    return failedBinding('receipt-wrong-pr');
  }
  if (receipt.headSha !== headSha || check.head_sha !== headSha) {
    return failedBinding('receipt-wrong-sha');
  }
  if (Number(receipt.githubRunId) !== Number(run.id)) {
    return failedBinding('receipt-wrong-run');
  }
  if (receipt.passed !== true) {
    return failedBinding('receipt-not-passed');
  }
  if (check.name !== REVIEW_CHECK_NAME) {
    return failedBinding('wrong-check-name');
  }
  return {
    ok: true,
    customCheckId: Number(check.id),
    githubRunId: String(run.id),
    workflowPath: run.path,
    event: run.event,
    jobName: job.name,
    jobId: String(job.id),
    nativeJobCheckId,
    headBranch: run.head_branch ?? null,
    runHeadSha: run.head_sha ?? null,
    passed: true,
    headSha,
    prNumber: Number(prNumber),
    criticAgentId: receipt.criticAgentId,
    criticRunId: receipt.criticRunId,
    artifactId: artifact.id,
  };
}

export async function bindIndependentReviewDisplay(
  check,
  {
    repository,
    prNumber,
    headSha,
    defaultBranch = 'main',
    token,
    fetchImpl = fetch,
    extractZipFile,
  } = {},
) {
  const fail = (reason) => ({
    ...check,
    independentReviewBinding: failedBinding(reason),
  });
  if (!check) return fail('missing-display-check');
  let artifactName;
  try {
    artifactName = independentReviewArtifactName(prNumber, headSha);
  } catch {
    return fail('invalid-artifact-name');
  }
  const artifacts = await listActionsArtifactsByName(repository, artifactName, {
    token,
    fetchImpl,
  });
  if (!artifacts.length) {
    return fail('missing-artifact');
  }
  let last = failedBinding('no-matching-receipt');
  for (const artifact of artifacts) {
    if (artifact.name && artifact.name !== artifactName) {
      last = failedBinding('artifact-name-mismatch');
      continue;
    }
    try {
      const binding = await verifyIndependentReviewArtifact({
        artifact,
        check,
        repository,
        prNumber,
        headSha,
        defaultBranch,
        token,
        fetchImpl,
        extractZipFile,
      });
      if (binding.ok) {
        return { ...check, independentReviewBinding: binding };
      }
      last = binding;
    } catch (error) {
      last = failedBinding(redactSecrets(error.message));
    }
  }
  return { ...check, independentReviewBinding: last };
}

async function verifyTrustedLaunchArtifact({
  artifact,
  repository,
  prNumber,
  headSha,
  defaultBranch,
  token,
  fetchImpl,
  extractZipFile,
}) {
  if (!artifact || artifact.expired === true) {
    return failedBinding('expired-artifact');
  }
  if (Number(artifact.size_in_bytes) > MAX_INDEPENDENT_REVIEW_ARTIFACT_BYTES) {
    return failedBinding('artifact-too-large');
  }
  const runId = artifact.workflow_run?.id;
  if (!/^\d+$/.test(String(runId ?? ''))) {
    return failedBinding('artifact-missing-workflow-run');
  }
  const github = { token, fetchImpl };
  const run = await fetchWorkflowRun(repository, runId, github);
  if (Number(run?.id) !== Number(runId)) {
    return failedBinding('run-id-mismatch');
  }
  if (run.path !== TRUSTED_WORKFLOW_FILE) {
    return failedBinding('wrong-workflow');
  }
  if (run.event !== TRUSTED_LAUNCH_EVENT) {
    return failedBinding('wrong-event');
  }
  if (!run.head_branch || run.head_branch !== defaultBranch) {
    return failedBinding('dispatch-not-default-branch');
  }
  const jobs = await fetchWorkflowRunJobs(repository, run.id, github);
  const job = (jobs ?? []).find(
    (entry) => entry.name === TRUSTED_REVIEW_JOB_NAME,
  );
  if (!job) {
    return failedBinding('missing-expected-job');
  }
  if (Number(job.run_id) !== Number(run.id)) {
    return failedBinding('job-run-mismatch');
  }
  if (job.status !== 'completed' || job.conclusion !== 'success') {
    return failedBinding('job-not-success');
  }
  const zip = await downloadActionsArtifactZip(repository, artifact.id, github);
  const extract = extractZipFile ?? extractNamedFileFromZip;
  let raw;
  try {
    raw = extract(zip, INDEPENDENT_REVIEW_LAUNCH_RECEIPT_FILE);
  } catch {
    return failedBinding('receipt-extract-failed');
  }
  const parsed = parseTrustedLaunchReceipt(raw);
  if (!parsed.ok) {
    return failedBinding(parsed.reason);
  }
  const receipt = parsed.receipt;
  if (Number(receipt.prNumber) !== Number(prNumber)) {
    return failedBinding('receipt-wrong-pr');
  }
  if (receipt.headSha !== headSha) {
    return failedBinding('receipt-wrong-sha');
  }
  if (Number(receipt.githubRunId) !== Number(run.id)) {
    return failedBinding('receipt-wrong-run');
  }
  if (receipt.githubWorkflowSha !== run.head_sha) {
    return failedBinding('receipt-wrong-workflow-sha');
  }
  if (receipt.githubEvent !== TRUSTED_LAUNCH_EVENT) {
    return failedBinding('receipt-wrong-event');
  }
  if (receipt.repository && receipt.repository !== repository) {
    return failedBinding('receipt-wrong-repo');
  }
  return {
    ok: true,
    reason: undefined,
    receipt,
    githubRunId: String(run.id),
    workflowPath: run.path,
    event: run.event,
    jobName: job.name,
    jobId: String(job.id),
    headBranch: run.head_branch ?? null,
    runHeadSha: run.head_sha ?? null,
    headSha,
    prNumber: Number(prNumber),
    agentId: receipt.agentId,
    runId: receipt.runId,
    artifactId: artifact.id,
  };
}

export async function bindTrustedLaunchReceipt({
  repository,
  prNumber,
  headSha,
  defaultBranch = 'main',
  token,
  fetchImpl = fetch,
  extractZipFile,
} = {}) {
  let artifactName;
  try {
    artifactName = independentReviewLaunchArtifactName(prNumber, headSha);
  } catch {
    return failedBinding('invalid-artifact-name');
  }
  const artifacts = await listActionsArtifactsByName(repository, artifactName, {
    token,
    fetchImpl,
  });
  if (!artifacts.length) {
    return failedBinding('missing-artifact');
  }
  let last = failedBinding('no-matching-receipt');
  for (const artifact of artifacts) {
    if (artifact.name && artifact.name !== artifactName) {
      last = failedBinding('artifact-name-mismatch');
      continue;
    }
    try {
      const binding = await verifyTrustedLaunchArtifact({
        artifact,
        repository,
        prNumber,
        headSha,
        defaultBranch,
        token,
        fetchImpl,
        extractZipFile,
      });
      if (binding.ok) {
        return binding;
      }
      last = binding;
    } catch (error) {
      last = failedBinding(redactSecrets(error.message));
    }
  }
  return last;
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
