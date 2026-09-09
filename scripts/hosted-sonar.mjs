#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CI_GATE_NAME,
  HOSTED_SONAR_WORKFLOW_FILE,
  githubActionsAppOk,
  isFullSha,
  redactSecrets,
} from './delivery-constants.mjs';
import {
  downloadActionsArtifactZip,
  fetchDefaultBranchSha,
  fetchWorkflowJob,
  fetchWorkflowRun,
  fetchWorkflowRunAttempt,
  fetchWorkflowRunAttemptJobs,
  githubJson,
  positiveInt,
} from './delivery-github.mjs';

export const HOSTED_SONAR_PROVENANCE_KIND = 'hosted-sonar-ci-coverage';
export const HOSTED_SONAR_PROVENANCE_SCHEMA_VERSION = 1;
export const HOSTED_SONAR_PROVENANCE_FILE = 'hosted-sonar-provenance.json';
export const CI_WORKFLOW_FILE = '.github/workflows/ci.yml';
export const CI_WORKFLOW_NAME = 'CI';
export const MACOS_VERIFY_JOB_NAME = 'checks / Verify (macos-latest)';
export const COVERAGE_ARTIFACT_NAME = 'coverage';
export const COVERAGE_ZIP_ENTRY = 'lcov.info';
export const COVERAGE_REPORT_PATH = 'coverage/lcov.info';
export const MAX_HOSTED_SONAR_ARTIFACT_BYTES = 5_000_000;
export const MAX_HOSTED_SONAR_LCOV_CHARS = 2_000_000;
export const TRUSTED_CONSUMER_EVENTS = Object.freeze([
  'workflow_run',
  'workflow_dispatch',
]);

function failed(reason) {
  return { ok: false, reason };
}

export function sha256Hex(bytes) {
  return createHash('sha256')
    .update(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []))
    .digest('hex');
}

export function parseArtifactDigest(digest) {
  const match = String(digest ?? '').match(/^sha256:([a-f0-9]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}

export function parseNativeCheckRunUrl(repository, url) {
  const repo = String(repository ?? '');
  if (!repo.includes('/')) return null;
  const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(url ?? '').match(
    new RegExp(
      `^https://api\\.github\\.com/repos/${escaped}/check-runs/(\\d+)$`,
    ),
  );
  return match ? Number(match[1]) : null;
}

export function isSafeCoverageZipEntry(name) {
  const value = String(name ?? '');
  if (!value || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || value.startsWith('./')) return false;
  const parts = value.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    return false;
  }
  return value === COVERAGE_ZIP_ENTRY || value === COVERAGE_REPORT_PATH;
}

export function validateLcovText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return failed('coverage-not-lcov');
  }
  if (text.length > MAX_HOSTED_SONAR_LCOV_CHARS) {
    return failed('coverage-too-large');
  }
  if (text.includes('\0') || text.startsWith('#!') || text.startsWith('PK')) {
    return failed('coverage-not-lcov');
  }
  if (!/^(?:TN:|SF:)/m.test(text) || !/^end_of_record\s*$/m.test(text)) {
    return failed('coverage-not-lcov');
  }
  return { ok: true };
}

export function extractCoverageLcovFromZip(
  zipBuffer,
  { unzipBin = 'unzip' } = {},
) {
  const bytes = Buffer.isBuffer(zipBuffer)
    ? zipBuffer
    : Buffer.from(zipBuffer ?? []);
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_HOSTED_SONAR_ARTIFACT_BYTES
  ) {
    return failed('artifact-too-large');
  }
  const dir = mkdtempSync(join(tmpdir(), 'ar-hosted-sonar-artifact-'));
  const zipPath = join(dir, 'artifact.zip');
  try {
    writeFileSync(zipPath, bytes);
    const listed = spawnSync(unzipBin, ['-Z', '-1', zipPath], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: MAX_HOSTED_SONAR_ARTIFACT_BYTES,
    });
    if (listed.status !== 0) {
      return failed('artifact-unzip-failed');
    }
    const names = listed.stdout
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length !== 1) {
      return failed('unexpected-artifact-entry');
    }
    const entry = names[0];
    if (!isSafeCoverageZipEntry(entry)) {
      return failed('unexpected-artifact-entry');
    }
    const extracted = spawnSync(unzipBin, ['-p', zipPath, entry], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: MAX_HOSTED_SONAR_LCOV_CHARS,
    });
    if (extracted.status !== 0) {
      return failed('artifact-unzip-failed');
    }
    const lcovCheck = validateLcovText(extracted.stdout);
    if (!lcovCheck.ok) return lcovCheck;
    return {
      ok: true,
      entry,
      lcov: extracted.stdout,
      coverageSha256: sha256Hex(extracted.stdout),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function repoFullName(value) {
  if (typeof value === 'string' && value.includes('/')) return value;
  return value?.full_name ?? null;
}

function repoId(value) {
  return positiveInt(value?.id ?? value);
}

function isoMs(value) {
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? ms : null;
}

function uniqueNamedJob(jobs, name, runId, attempt) {
  const matches = (jobs ?? []).filter(
    (entry) =>
      entry?.name === name &&
      Number(entry.run_id) === Number(runId) &&
      Number(entry.run_attempt) === Number(attempt),
  );
  if (matches.length === 0) return failed(`missing-job:${name}`);
  if (matches.length !== 1) return failed(`ambiguous-job:${name}`);
  return { ok: true, job: matches[0] };
}

async function fetchRepository(repository, options) {
  return githubJson(`repos/${repository}`, options);
}

async function fetchCheckRun(repository, checkRunId, options) {
  const id = positiveInt(checkRunId);
  if (!id) {
    throw new Error('Check run id must be a positive integer');
  }
  return githubJson(`repos/${repository}/check-runs/${id}`, options);
}

async function fetchArtifact(repository, artifactId, options) {
  const id = positiveInt(artifactId);
  if (!id) {
    throw new Error('Artifact id must be a positive integer');
  }
  return githubJson(`repos/${repository}/actions/artifacts/${id}`, options);
}

async function fetchWorkflowRunArtifacts(repository, runId, options) {
  const payload = await githubJson(
    `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`,
    options,
  );
  return Array.isArray(payload?.artifacts) ? payload.artifacts : [];
}

async function fetchRunsForSha(repository, sha, options) {
  const payload = await githubJson(
    `repos/${repository}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=100`,
    options,
  );
  return Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
}

function sameRepo(entity, repository, expectedId) {
  return (
    repoFullName(entity) === repository &&
    (!expectedId || repoId(entity) === expectedId)
  );
}

async function authenticateRunAttempt({
  repository,
  runId,
  attemptNumber,
  expectedPath,
  expectedName,
  expectedEvents,
  expectedHeadSha,
  expectedBranch,
  expectedRepoId,
  requireCompletedSuccess,
  token,
  fetchImpl,
}) {
  const attempt = positiveInt(attemptNumber);
  const run = positiveInt(runId);
  if (!attempt || !run) return failed('invalid-run-attempt');
  const github = { token, fetchImpl };
  const attemptRun = await fetchWorkflowRunAttempt(
    repository,
    run,
    attempt,
    github,
  );
  if (Number(attemptRun?.id) !== run) return failed('attempt-run-mismatch');
  if (Number(attemptRun?.run_attempt) !== attempt) {
    return failed('attempt-number-mismatch');
  }
  if (attemptRun.path !== expectedPath) return failed('wrong-workflow');
  if (expectedName && attemptRun.name !== expectedName) {
    return failed('wrong-workflow');
  }
  if (
    Array.isArray(expectedEvents) &&
    !expectedEvents.includes(attemptRun.event)
  ) {
    return failed(
      expectedEvents.includes('push') && attemptRun.event === 'pull_request'
        ? 'source-pull-request'
        : 'wrong-event',
    );
  }
  if (attemptRun.head_sha !== expectedHeadSha) return failed('wrong-sha');
  if (expectedBranch && attemptRun.head_branch !== expectedBranch) {
    return failed('wrong-branch');
  }
  if (!sameRepo(attemptRun.repository, repository, expectedRepoId)) {
    return failed('wrong-repo');
  }
  if (!sameRepo(attemptRun.head_repository, repository, expectedRepoId)) {
    return failed('wrong-repo');
  }
  if (requireCompletedSuccess) {
    if (attemptRun.status !== 'completed') return failed('source-not-success');
    if (attemptRun.conclusion !== 'success')
      return failed('source-not-success');
  }
  return { ok: true, attemptRun };
}

async function authenticateNativeJob({
  repository,
  runId,
  attemptNumber,
  jobHint,
  expectedName,
  expectedHeadSha,
  expectedLabels,
  token,
  fetchImpl,
}) {
  const jobId = positiveInt(jobHint?.id);
  if (!jobId) return failed(`missing-job:${expectedName}`);
  const job = await fetchWorkflowJob(repository, jobId, {
    token,
    fetchImpl,
  });
  if (Number(job?.id) !== jobId)
    return failed(`job-id-mismatch:${expectedName}`);
  if (Number(job.run_id) !== Number(runId)) return failed('job-run-mismatch');
  if (Number(job.run_attempt) !== Number(attemptNumber)) {
    return failed('wrong-rerun-attempt');
  }
  if (job.name !== expectedName) return failed(`missing-job:${expectedName}`);
  if (job.status !== 'completed' || job.conclusion !== 'success') {
    return expectedName === MACOS_VERIFY_JOB_NAME
      ? failed('failed-macos')
      : failed('failed-gate');
  }
  if (
    Array.isArray(expectedLabels) &&
    !expectedLabels.every((label) => (job.labels ?? []).includes(label))
  ) {
    return failed('failed-macos');
  }
  const checkRunId = parseNativeCheckRunUrl(repository, job.check_run_url);
  if (!checkRunId) return failed('forged-check-url');
  const check = await fetchCheckRun(repository, checkRunId, {
    token,
    fetchImpl,
  });
  if (Number(check?.id) !== checkRunId) return failed('forged-check-url');
  if (check.name !== expectedName) return failed('forged-check-url');
  if (check.head_sha !== expectedHeadSha) return failed('wrong-sha');
  if (check.status !== 'completed' || check.conclusion !== 'success') {
    return expectedName === MACOS_VERIFY_JOB_NAME
      ? failed('failed-macos')
      : failed('failed-gate');
  }
  if (!githubActionsAppOk(check)) return failed('forged-check-url');
  return { ok: true, job, check, checkRunId };
}

function selectCoverageArtifact({
  artifacts,
  runId,
  headSha,
  repositoryId,
  macosJob,
}) {
  const started = isoMs(macosJob.started_at);
  const completed = isoMs(macosJob.completed_at);
  if (!started || !completed) return failed('failed-macos');
  const matches = [];
  for (const artifact of artifacts ?? []) {
    if (artifact?.name && artifact.name !== COVERAGE_ARTIFACT_NAME) continue;
    if (artifact?.expired === true) continue;
    const expires = isoMs(artifact?.expires_at);
    if (expires !== null && expires <= Date.now()) continue;
    if (Number(artifact?.workflow_run?.id) !== Number(runId)) continue;
    if (artifact?.workflow_run?.head_sha !== headSha) continue;
    if (
      repositoryId &&
      Number(artifact?.workflow_run?.repository_id) !== Number(repositoryId)
    ) {
      continue;
    }
    if (
      repositoryId &&
      artifact?.workflow_run?.head_repository_id != null &&
      Number(artifact.workflow_run.head_repository_id) !== Number(repositoryId)
    ) {
      continue;
    }
    const created = isoMs(artifact?.created_at);
    if (!created || created < started || created > completed) continue;
    matches.push(artifact);
  }
  const expiredNamed = (artifacts ?? []).filter(
    (artifact) =>
      artifact?.name === COVERAGE_ARTIFACT_NAME &&
      (artifact.expired === true ||
        (isoMs(artifact?.expires_at) !== null &&
          isoMs(artifact.expires_at) <= Date.now())),
  );
  if (!matches.length && expiredNamed.length) return failed('expired-artifact');
  if (!matches.length) return failed('missing-artifact');
  if (matches.length !== 1) return failed('ambiguous-artifact');
  const artifact = matches[0];
  if (!parseArtifactDigest(artifact.digest)) {
    return failed('artifact-missing-digest');
  }
  const size = Number(artifact.size_in_bytes);
  if (!Number.isInteger(size) || size <= 0) return failed('missing-artifact');
  if (size > MAX_HOSTED_SONAR_ARTIFACT_BYTES) {
    return failed('artifact-too-large');
  }
  return { ok: true, artifact };
}

async function resolveSourceRunId({
  eventName,
  sourceRunId,
  repository,
  expectedHeadSha,
  expectedBranch,
  token,
  fetchImpl,
}) {
  const claimed = positiveInt(sourceRunId);
  if (claimed) return { ok: true, runId: claimed };
  if (eventName !== 'workflow_dispatch') return failed('missing-source-run');
  const runs = await fetchRunsForSha(repository, expectedHeadSha, {
    token,
    fetchImpl,
  });
  const matches = runs.filter(
    (run) =>
      run?.path === CI_WORKFLOW_FILE &&
      run?.name === CI_WORKFLOW_NAME &&
      run?.event === 'push' &&
      run?.head_branch === expectedBranch &&
      run?.head_sha === expectedHeadSha &&
      run?.status === 'completed' &&
      run?.conclusion === 'success',
  );
  const ids = [...new Set(matches.map((run) => Number(run.id)))];
  if (!ids.length) return failed('missing-source-run');
  if (ids.length !== 1) return failed('ambiguous-source-run');
  return {
    ok: true,
    runId: ids[0],
    attemptNumber: positiveInt(matches[0].run_attempt),
  };
}

export function persistHostedSonarProvenance(
  provenance,
  {
    githubOutput,
    provenancePath = HOSTED_SONAR_PROVENANCE_FILE,
    writeFile = writeFileSync,
    appendOutput = appendFileSync,
  } = {},
) {
  writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
  if (githubOutput) {
    const values = {
      analyzed_sha: provenance.analyzedSha,
      source_run_id: String(provenance.sourceRunId),
      source_run_attempt: String(provenance.sourceRunAttempt),
      artifact_id: String(provenance.artifactId),
      coverage_sha256: provenance.coverageSha256,
      provenance_file: provenancePath,
    };
    const lines = Object.entries(values)
      .map(([key, value]) => `${key}=${String(value).replaceAll('\n', '')}`)
      .join('\n');
    appendOutput(githubOutput, `${lines}\n`);
  }
  return provenancePath;
}

export function collectCoverageFiles(downloadDir) {
  const root = String(downloadDir ?? '');
  if (!root) return failed('missing-artifact');
  let rootStat;
  try {
    rootStat = lstatSync(root);
  } catch {
    return failed('missing-artifact');
  }
  if (rootStat.isSymbolicLink()) return failed('unexpected-artifact-entry');
  const files = [];
  const visit = (current) => {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      files.push({ path: current, symlink: true });
      return;
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        visit(join(current, entry));
      }
      return;
    }
    files.push({ path: current, symlink: false, size: stat.size });
  };
  if (rootStat.isFile()) {
    files.push({ path: root, symlink: false, size: rootStat.size });
  } else {
    visit(root);
  }
  if (files.some((entry) => entry.symlink)) {
    return failed('unexpected-artifact-entry');
  }
  const relativeNames = files.map((entry) =>
    relative(rootStat.isFile() ? dirname(root) : root, entry.path)
      .split(sep)
      .join('/'),
  );
  if (relativeNames.length !== 1) return failed('unexpected-artifact-entry');
  const name = relativeNames[0];
  if (!isSafeCoverageZipEntry(name)) return failed('unexpected-artifact-entry');
  return { ok: true, filePath: files[0].path, name };
}

export function verifyExtractedCoverage({
  downloadDir,
  destinationPath = COVERAGE_REPORT_PATH,
  provenance,
  readFile = readFileSync,
  mkdir = mkdirSync,
  copyFile = copyFileSync,
} = {}) {
  if (provenance?.kind !== HOSTED_SONAR_PROVENANCE_KIND) {
    return failed('missing-provenance');
  }
  const collected = collectCoverageFiles(downloadDir);
  if (!collected.ok) return collected;
  let text;
  try {
    text = readFile(collected.filePath, 'utf8');
  } catch {
    return failed('missing-artifact');
  }
  const lcovCheck = validateLcovText(text);
  if (!lcovCheck.ok) return lcovCheck;
  const digest = sha256Hex(text);
  if (digest !== provenance.coverageSha256) {
    return failed('artifact-digest-mismatch');
  }
  mkdir(dirname(destinationPath), { recursive: true });
  copyFile(collected.filePath, destinationPath);
  return { ok: true, coveragePath: destinationPath, coverageSha256: digest };
}

export async function authenticateHostedSonarCoverage(
  env = {},
  { fetchImpl = fetch, unzipBin = 'unzip' } = {},
) {
  const token = env.GITHUB_TOKEN;
  const repository = env.REPOSITORY;
  const defaultBranch = env.DEFAULT_BRANCH || 'main';
  const consumerSha = env.CONSUMER_SHA || env.GITHUB_SHA;
  const consumerRef = env.CONSUMER_REF || env.GITHUB_REF;
  const eventName = env.CONSUMER_EVENT || env.GITHUB_EVENT_NAME;
  const consumerRunId = env.GITHUB_RUN_ID;
  const consumerAttempt = env.GITHUB_RUN_ATTEMPT;
  if (!token || !repository) return failed('missing-github-auth');
  if (!isFullSha(consumerSha)) return failed('wrong-sha');
  if (consumerRef !== `refs/heads/${defaultBranch}`) {
    return failed('consumer-not-default-branch');
  }
  if (!TRUSTED_CONSUMER_EVENTS.includes(eventName)) {
    return failed('wrong-event');
  }

  const github = { token, fetchImpl };
  const repo = await fetchRepository(repository, github);
  const expectedRepoId = repoId(repo);
  if (!expectedRepoId || repoFullName(repo) !== repository) {
    return failed('wrong-repo');
  }
  const currentMain = await fetchDefaultBranchSha(
    repository,
    defaultBranch,
    github,
  );
  if (!isFullSha(currentMain)) return failed('wrong-sha');
  if (currentMain !== consumerSha) return failed('main-advanced');

  const consumerAuth = await authenticateRunAttempt({
    repository,
    runId: consumerRunId,
    attemptNumber: consumerAttempt,
    expectedPath: HOSTED_SONAR_WORKFLOW_FILE,
    expectedName: 'Sonar (main only)',
    expectedEvents: TRUSTED_CONSUMER_EVENTS,
    expectedHeadSha: consumerSha,
    expectedBranch: defaultBranch,
    expectedRepoId,
    requireCompletedSuccess: false,
    token,
    fetchImpl,
  });
  if (!consumerAuth.ok) return consumerAuth;

  const resolved = await resolveSourceRunId({
    eventName,
    sourceRunId: env.SOURCE_RUN_ID,
    repository,
    expectedHeadSha: consumerSha,
    expectedBranch: defaultBranch,
    token,
    fetchImpl,
  });
  if (!resolved.ok) return resolved;
  const sourceAttempt =
    positiveInt(env.SOURCE_RUN_ATTEMPT) ?? resolved.attemptNumber;
  if (!sourceAttempt) return failed('invalid-run-attempt');

  const sourceLatest = await fetchWorkflowRun(
    repository,
    resolved.runId,
    github,
  );
  if (Number(sourceLatest?.id) !== Number(resolved.runId)) {
    return failed('attempt-run-mismatch');
  }

  const sourceAuth = await authenticateRunAttempt({
    repository,
    runId: resolved.runId,
    attemptNumber: sourceAttempt,
    expectedPath: CI_WORKFLOW_FILE,
    expectedName: CI_WORKFLOW_NAME,
    expectedEvents: ['push'],
    expectedHeadSha: consumerSha,
    expectedBranch: defaultBranch,
    expectedRepoId,
    requireCompletedSuccess: true,
    token,
    fetchImpl,
  });
  if (!sourceAuth.ok) return sourceAuth;
  const sourceRun = sourceAuth.attemptRun;

  const jobs = await fetchWorkflowRunAttemptJobs(
    repository,
    resolved.runId,
    sourceAttempt,
    github,
  );
  const macosHint = uniqueNamedJob(
    jobs,
    MACOS_VERIFY_JOB_NAME,
    resolved.runId,
    sourceAttempt,
  );
  if (!macosHint.ok) return macosHint;
  const gateHint = uniqueNamedJob(
    jobs,
    CI_GATE_NAME,
    resolved.runId,
    sourceAttempt,
  );
  if (!gateHint.ok) return gateHint;

  const macos = await authenticateNativeJob({
    repository,
    runId: resolved.runId,
    attemptNumber: sourceAttempt,
    jobHint: macosHint.job,
    expectedName: MACOS_VERIFY_JOB_NAME,
    expectedHeadSha: consumerSha,
    expectedLabels: ['macos-latest'],
    token,
    fetchImpl,
  });
  if (!macos.ok) return macos;
  const gate = await authenticateNativeJob({
    repository,
    runId: resolved.runId,
    attemptNumber: sourceAttempt,
    jobHint: gateHint.job,
    expectedName: CI_GATE_NAME,
    expectedHeadSha: consumerSha,
    token,
    fetchImpl,
  });
  if (!gate.ok) return gate;

  const artifacts = await fetchWorkflowRunArtifacts(
    repository,
    resolved.runId,
    github,
  );
  const selected = selectCoverageArtifact({
    artifacts,
    runId: resolved.runId,
    headSha: consumerSha,
    repositoryId: expectedRepoId,
    macosJob: macos.job,
  });
  if (!selected.ok) return selected;

  const artifact = await fetchArtifact(
    repository,
    selected.artifact.id,
    github,
  );
  if (Number(artifact?.id) !== Number(selected.artifact.id)) {
    return failed('missing-artifact');
  }
  if (artifact.name !== COVERAGE_ARTIFACT_NAME)
    return failed('missing-artifact');
  if (artifact.expired === true) return failed('expired-artifact');
  if (Number(artifact.workflow_run?.id) !== Number(resolved.runId)) {
    return failed('missing-artifact');
  }
  if (artifact.workflow_run?.head_sha !== consumerSha) {
    return failed('wrong-sha');
  }
  const expectedDigest = parseArtifactDigest(artifact.digest);
  if (!expectedDigest) return failed('artifact-missing-digest');

  const zip = await downloadActionsArtifactZip(repository, artifact.id, {
    token,
    fetchImpl,
    maxBytes: MAX_HOSTED_SONAR_ARTIFACT_BYTES,
  });
  if (sha256Hex(zip) !== expectedDigest) {
    return failed('artifact-digest-mismatch');
  }
  const extracted = extractCoverageLcovFromZip(zip, { unzipBin });
  if (!extracted.ok) return extracted;

  const provenance = {
    kind: HOSTED_SONAR_PROVENANCE_KIND,
    schemaVersion: HOSTED_SONAR_PROVENANCE_SCHEMA_VERSION,
    repository,
    analyzedSha: consumerSha,
    sourceRunId: Number(resolved.runId),
    sourceRunAttempt: Number(sourceAttempt),
    sourceWorkflowPath: sourceRun.path,
    sourceEvent: sourceRun.event,
    macosJobId: Number(macos.job.id),
    macosCheckRunId: Number(macos.checkRunId),
    gateJobId: Number(gate.job.id),
    gateCheckRunId: Number(gate.checkRunId),
    artifactId: Number(artifact.id),
    artifactDigest: `sha256:${expectedDigest}`,
    coverageEntry: extracted.entry,
    coverageSha256: extracted.coverageSha256,
    consumerRunId: Number(consumerRunId),
    consumerRunAttempt: Number(consumerAttempt),
    consumerWorkflowPath: HOSTED_SONAR_WORKFLOW_FILE,
    consumerEvent: eventName,
  };
  return { ok: true, provenance, lcov: extracted.lcov };
}

export async function main(
  command,
  env = process.env,
  { log = console, fetchImpl = fetch, unzipBin = 'unzip' } = {},
) {
  if (command === 'authenticate') {
    const result = await authenticateHostedSonarCoverage(env, {
      fetchImpl,
      unzipBin,
    });
    if (!result.ok) {
      log.error(redactSecrets(result.reason));
      return result;
    }
    persistHostedSonarProvenance(result.provenance, {
      githubOutput: env.GITHUB_OUTPUT,
      provenancePath: env.PROVENANCE_PATH || HOSTED_SONAR_PROVENANCE_FILE,
    });
    log.log(
      JSON.stringify({
        ok: true,
        analyzedSha: result.provenance.analyzedSha,
        sourceRunId: result.provenance.sourceRunId,
        sourceRunAttempt: result.provenance.sourceRunAttempt,
        artifactId: result.provenance.artifactId,
        macosCheckRunId: result.provenance.macosCheckRunId,
        gateCheckRunId: result.provenance.gateCheckRunId,
        coverageSha256: result.provenance.coverageSha256,
      }),
    );
    return result;
  }
  if (command === 'verify-coverage') {
    const provenancePath = env.PROVENANCE_PATH || HOSTED_SONAR_PROVENANCE_FILE;
    let provenance;
    try {
      provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
    } catch {
      const result = failed('missing-provenance');
      log.error(result.reason);
      return result;
    }
    const result = verifyExtractedCoverage({
      downloadDir: env.COVERAGE_DOWNLOAD_DIR,
      destinationPath: env.COVERAGE_DEST || COVERAGE_REPORT_PATH,
      provenance,
    });
    if (!result.ok) {
      log.error(result.reason);
      return result;
    }
    log.log(
      JSON.stringify({
        ok: true,
        coveragePath: result.coveragePath,
        coverageSha256: result.coverageSha256,
      }),
    );
    return result;
  }
  log.error('Unknown hosted-sonar command');
  return failed('unknown-command');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv[2], process.env).then((result) => {
    if (!result?.ok) process.exitCode = 1;
  });
}
