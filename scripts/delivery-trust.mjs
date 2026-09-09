import { createHash } from 'node:crypto';
import {
  AGENT_ID,
  AUTOMATED_LAUNCH_ACTOR,
  COORDINATOR_DISPATCH_RECEIPT_SOURCE,
  INDEPENDENT_REVIEW_RECEIPT_KIND,
  INDEPENDENT_REVIEW_RECEIPT_SCHEMA_VERSION,
  LAUNCH_RECEIPT_KIND,
  LAUNCH_RECEIPT_SCHEMA_VERSION,
  LAUNCH_REPO_PERMISSIONS,
  MAX_INDEPENDENT_REVIEW_RECEIPT_CHARS,
  MISSING_ISOLATION_VARS,
  REQUIRED_MODEL_ID,
  REQUIRED_MODEL_PARAMS,
  RUN_ID,
  TRUSTED_DEFAULT_BRANCH_ENV,
  TRUSTED_GITHUB_EVENTS,
  TRUSTED_LAUNCH_EVENT,
  TRUSTED_LAUNCH_RECEIPT_SOURCE,
  TRUSTED_REVIEW_JOB_NAME,
  TRUSTED_WORKFLOW_FILE,
  UNTRUSTED_CURSOR_CREDENTIAL,
  UNTRUSTED_GITHUB_EVENTS,
  isFullSha,
  modelParamsMatch,
} from './delivery-constants.mjs';

const URL_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function uuidv5(name, namespace) {
  const ns = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function githubEventName(env = {}) {
  return env.EVENT_NAME ?? env.GITHUB_EVENT_NAME ?? '';
}

export function isUntrustedGithubEvent(env = {}) {
  return UNTRUSTED_GITHUB_EVENTS.includes(githubEventName(env));
}

export function defaultBranchRef(env = {}) {
  const branch = env.GITHUB_DEFAULT_BRANCH ?? 'main';
  return `refs/heads/${branch}`;
}

export function cursorCredentialUseAllowed(env = {}) {
  if (env[TRUSTED_DEFAULT_BRANCH_ENV] !== 'true') return false;
  if (isUntrustedGithubEvent(env)) return false;
  const event = githubEventName(env);
  if (event && !TRUSTED_GITHUB_EVENTS.includes(event)) return false;
  if (event === 'workflow_dispatch') {
    const ref = env.GITHUB_REF ?? '';
    if (ref && ref !== defaultBranchRef(env)) return false;
  }
  return true;
}

export function assertTrustedCursorInvocation(env = {}) {
  if (!cursorCredentialUseAllowed(env)) {
    throw new Error(UNTRUSTED_CURSOR_CREDENTIAL);
  }
}

export function assertUntrustedMustNotCarryCursorKey(env = {}) {
  if (env.CURSOR_API_KEY?.trim()) {
    throw new Error(UNTRUSTED_CURSOR_CREDENTIAL);
  }
}

export function requiredIsolationIds(env = {}) {
  const implementerAgentId = env.IMPLEMENTER_AGENT_ID?.trim();
  const verifierAgentId = env.VERIFIER_AGENT_ID?.trim();
  const recorderAgentId = env.RECORDER_AGENT_ID?.trim();
  const missing = [
    ['IMPLEMENTER_AGENT_ID', implementerAgentId],
    ['VERIFIER_AGENT_ID', verifierAgentId],
    ['RECORDER_AGENT_ID', recorderAgentId],
  ].filter(([, value]) => !AGENT_ID.test(value ?? ''));
  if (missing.length) {
    throw new Error(MISSING_ISOLATION_VARS);
  }
  return { implementerAgentId, verifierAgentId, recorderAgentId };
}

export function reviewIdempotencyKey({ repository, prNumber, headSha }) {
  return `independent-review:${repository}:${prNumber}:${headSha}`;
}

export function idempotentReviewAgentId({ repository, prNumber, headSha }) {
  return `bc-${uuidv5(reviewIdempotencyKey({ repository, prNumber, headSha }), URL_NAMESPACE)}`;
}

export function parseLaunchReceipt(raw) {
  if (raw == null || raw === '') return null;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Launch receipt JSON is not parseable');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Launch receipt must be a JSON object');
  }
  return parsed;
}

export function untrustedEnvLaunchReceipt(raw) {
  const parsed = parseLaunchReceipt(raw);
  return {
    ...parsed,
    source: COORDINATOR_DISPATCH_RECEIPT_SOURCE,
  };
}

export function launchActorIdentities(env = {}) {
  return {
    actor: String(env.GITHUB_ACTOR ?? '').trim(),
    triggeringActor: String(env.GITHUB_TRIGGERING_ACTOR ?? '').trim(),
  };
}

function launchSubjectFailures(role, login, permission) {
  const failures = [];
  if (!login) {
    failures.push(`Launch requires ${role}`);
    return failures;
  }
  const granted = permission?.permission ?? permission;
  if (!LAUNCH_REPO_PERMISSIONS.includes(granted)) {
    failures.push(
      `${role} ${login} must have repository write, maintain, or admin permission (saw ${granted ?? 'missing'})`,
    );
  }
  return failures;
}

export function launchMintFailures({
  eventName,
  trustedDefaultBranch,
  launchEnabled,
  expectedHeadSha,
  liveHeadSha,
  repository,
  pr,
  actorLogin,
  triggeringActorLogin,
  actorPermission,
  triggeringActorPermission,
} = {}) {
  const failures = [];
  const fail = (reason) => failures.push(reason);
  if (launchEnabled !== true && launchEnabled !== 'true') {
    fail(
      'CURSOR_REVIEW_LAUNCH must be true on an explicit trusted default-branch workflow_dispatch',
    );
  }
  if (trustedDefaultBranch !== 'true') {
    fail('Launch requires TRUSTED_DEFAULT_BRANCH=true');
  }
  if (eventName !== TRUSTED_LAUNCH_EVENT) {
    fail(
      'Automated workflow_run may evaluate receipts but must not mint a write-capable Cursor agent; fresh launch requires explicit default-branch workflow_dispatch for one PR number and expected SHA',
    );
  }
  const actor = String(actorLogin ?? '').trim();
  const triggering = String(triggeringActorLogin ?? '').trim();
  failures.push(
    ...launchSubjectFailures('github.actor', actor, actorPermission),
  );
  failures.push(
    ...launchSubjectFailures(
      'github.triggering_actor',
      triggering,
      triggeringActorPermission,
    ),
  );
  const humans = [actor, triggering].filter(
    (login) => login && login !== AUTOMATED_LAUNCH_ACTOR,
  );
  if (actor && triggering && humans.length === 0) {
    fail(
      'Launch requires an authenticated dispatch actor with repository write access, not only github-actions[bot]',
    );
  }
  if (!pr) {
    fail('Launch requires a live GitHub pull request for that number');
    return failures;
  }
  const state = String(pr.state ?? '').toLowerCase();
  if (state !== 'open') {
    fail(
      `Launch rejects closed or missing PRs (state ${pr.state ?? 'missing'})`,
    );
  }
  if (pr.draft === true || pr.isDraft === true) {
    fail('Launch rejects draft PRs; mark ready then dispatch the frozen SHA');
  }
  const headRepo = pr.head?.repo?.full_name;
  const baseRepo = pr.base?.repo?.full_name;
  if (!headRepo || !baseRepo || headRepo !== baseRepo) {
    fail('Launch rejects fork or foreign-repository PRs');
  } else if (repository && baseRepo !== repository) {
    fail(
      `Launch rejects PRs whose base repository ${baseRepo} is not ${repository}`,
    );
  }
  const prHead = pr.head?.sha;
  if (!isFullSha(expectedHeadSha)) {
    fail('Launch requires the exact 40-character frozen head SHA');
  } else if (isFullSha(liveHeadSha) && expectedHeadSha !== liveHeadSha) {
    fail(
      `Frozen head ${expectedHeadSha} does not match live PR head ${liveHeadSha}; recheck before launch`,
    );
  } else if (isFullSha(prHead) && prHead !== expectedHeadSha) {
    fail(`Live PR head ${prHead} does not match frozen SHA ${expectedHeadSha}`);
  } else if (!isFullSha(liveHeadSha) && !isFullSha(prHead)) {
    fail('Launch requires a rechecked live PR head SHA');
  }
  return failures;
}

export function launchReceiptFailures(
  receipt,
  { expectedHeadSha, agent, run, actionsRun } = {},
) {
  const failures = [];
  const fail = (reason) => failures.push(reason);
  if (!receipt) {
    fail(
      'Launch receipt is required; documented V1Agent/V1Run have no model fields',
    );
    return failures;
  }
  if (receipt.schemaVersion !== LAUNCH_RECEIPT_SCHEMA_VERSION) {
    fail(
      `Launch receipt schemaVersion must be ${LAUNCH_RECEIPT_SCHEMA_VERSION}`,
    );
  }
  if (receipt.kind !== LAUNCH_RECEIPT_KIND) {
    fail(`Launch receipt kind must be ${LAUNCH_RECEIPT_KIND}`);
  }
  if (!AGENT_ID.test(receipt.agentId ?? '')) {
    fail('Launch receipt agentId is not a documented bc- UUID');
  }
  if (
    !RUN_ID.test(receipt.runId ?? '') &&
    !String(receipt.runId ?? '').startsWith('run-')
  ) {
    fail('Launch receipt runId is not a documented run id');
  }
  if (!isFullSha(receipt.headSha)) {
    fail('Launch receipt headSha must be the exact 40-character PR head');
  }
  if (receipt.modelId !== REQUIRED_MODEL_ID) {
    fail(
      `Launch receipt modelId must be ${REQUIRED_MODEL_ID}; documented GET agent/run do not report a model`,
    );
  }
  if (!modelParamsMatch(receipt.modelParams ?? [])) {
    fail(
      `Launch receipt modelParams must be effort=xhigh and fast=false (${JSON.stringify(REQUIRED_MODEL_PARAMS)})`,
    );
  }
  if (receipt.source !== TRUSTED_LAUNCH_RECEIPT_SOURCE) {
    fail(
      'Launch receipt source must be trusted-launch-job; coordinator or self-authored JSON cannot relabel an arbitrary authenticated agent as model proof',
    );
  }
  if (!/^\d+$/.test(String(receipt.githubRunId ?? ''))) {
    fail(
      'Launch receipt githubRunId must be the GitHub Actions run that owned the trusted launch',
    );
  }
  if (!isFullSha(receipt.githubWorkflowSha)) {
    fail(
      'Launch receipt githubWorkflowSha must be the trusted default-branch workflow SHA',
    );
  }
  if (receipt.workflowPath !== TRUSTED_WORKFLOW_FILE) {
    fail(`Launch receipt workflowPath must be ${TRUSTED_WORKFLOW_FILE}`);
  }
  if (!TRUSTED_GITHUB_EVENTS.includes(receipt.githubEvent)) {
    fail(
      'Launch receipt githubEvent must be workflow_run or default-branch workflow_dispatch',
    );
  }
  if (expectedHeadSha && receipt.headSha !== expectedHeadSha) {
    fail(
      `Launch receipt headSha ${receipt.headSha} does not match live PR head ${expectedHeadSha}`,
    );
  }
  if (agent?.id && receipt.agentId !== agent.id) {
    fail('Launch receipt agentId is not bound to the authenticated GET agent');
  }
  if (run?.id && receipt.runId !== run.id) {
    fail('Launch receipt runId is not bound to the authenticated GET run');
  }
  if (!actionsRun) {
    fail(
      'Launch receipt must be bound to GET /repos/.../actions/runs/{githubRunId}; missing GET is not permission to trust self-authored githubRunId',
    );
  } else {
    if (String(actionsRun.id) !== String(receipt.githubRunId)) {
      fail(
        'Launch receipt githubRunId is not the authenticated GitHub Actions run',
      );
    }
    if (actionsRun.path !== TRUSTED_WORKFLOW_FILE) {
      fail(
        'Launch receipt is not from the trusted independent-review workflow path',
      );
    }
    if (!TRUSTED_GITHUB_EVENTS.includes(actionsRun.event)) {
      fail(
        'Launch receipt Actions run event is not workflow_run or workflow_dispatch',
      );
    }
  }
  return failures;
}

export function createIndependentReviewRunReceipt({
  prNumber,
  headSha,
  customCheckId,
  githubRunId,
  criticAgentId = null,
  criticRunId = null,
  passed,
  status,
} = {}) {
  return {
    kind: INDEPENDENT_REVIEW_RECEIPT_KIND,
    schemaVersion: INDEPENDENT_REVIEW_RECEIPT_SCHEMA_VERSION,
    prNumber: Number(prNumber),
    headSha,
    customCheckId: Number(customCheckId),
    githubRunId: Number(githubRunId),
    workflowPath: TRUSTED_WORKFLOW_FILE,
    jobName: TRUSTED_REVIEW_JOB_NAME,
    criticAgentId: criticAgentId ?? null,
    criticRunId: criticRunId ?? null,
    passed: Boolean(passed),
    status: String(status ?? ''),
  };
}

export function parseIndependentReviewReceipt(raw) {
  if (raw == null || raw === '') {
    return { ok: false, reason: 'missing-receipt' };
  }
  if (
    typeof raw === 'string' &&
    raw.length > MAX_INDEPENDENT_REVIEW_RECEIPT_CHARS
  ) {
    return { ok: false, reason: 'receipt-too-large' };
  }
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'receipt-not-json' };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'receipt-not-object' };
  }
  if (parsed.kind !== INDEPENDENT_REVIEW_RECEIPT_KIND) {
    return { ok: false, reason: 'receipt-kind' };
  }
  if (parsed.schemaVersion !== INDEPENDENT_REVIEW_RECEIPT_SCHEMA_VERSION) {
    return { ok: false, reason: 'receipt-schema' };
  }
  const prNumber = Number(parsed.prNumber);
  const customCheckId = Number(parsed.customCheckId);
  const githubRunId = Number(parsed.githubRunId);
  const headSha = String(parsed.headSha ?? '');
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return { ok: false, reason: 'receipt-prNumber' };
  }
  if (!Number.isInteger(customCheckId) || customCheckId <= 0) {
    return { ok: false, reason: 'receipt-customCheckId' };
  }
  if (!Number.isInteger(githubRunId) || githubRunId <= 0) {
    return { ok: false, reason: 'receipt-githubRunId' };
  }
  if (!isFullSha(headSha)) {
    return { ok: false, reason: 'receipt-headSha' };
  }
  if (parsed.workflowPath !== TRUSTED_WORKFLOW_FILE) {
    return { ok: false, reason: 'receipt-workflowPath' };
  }
  if (parsed.jobName !== TRUSTED_REVIEW_JOB_NAME) {
    return { ok: false, reason: 'receipt-jobName' };
  }
  if (typeof parsed.passed !== 'boolean') {
    return { ok: false, reason: 'receipt-passed' };
  }
  const criticAgentId =
    parsed.criticAgentId == null ? null : String(parsed.criticAgentId);
  const criticRunId =
    parsed.criticRunId == null ? null : String(parsed.criticRunId);
  if (parsed.passed === true) {
    if (!AGENT_ID.test(criticAgentId ?? '')) {
      return { ok: false, reason: 'receipt-criticAgentId' };
    }
    if (
      !RUN_ID.test(criticRunId ?? '') &&
      !String(criticRunId ?? '').startsWith('run-')
    ) {
      return { ok: false, reason: 'receipt-criticRunId' };
    }
  }
  return {
    ok: true,
    receipt: {
      kind: parsed.kind,
      schemaVersion: parsed.schemaVersion,
      prNumber,
      customCheckId,
      githubRunId,
      headSha,
      workflowPath: parsed.workflowPath,
      jobName: parsed.jobName,
      passed: parsed.passed,
      criticAgentId,
      criticRunId,
      status: String(parsed.status ?? ''),
    },
  };
}

export function workflowMentionsCursorSecret(yaml) {
  return /secrets\.CURSOR_API_KEY/.test(String(yaml ?? ''));
}

export function forbiddenCursorSecretWorkflows(files = []) {
  return files.filter((file) => {
    if (!file?.path || !/\.ya?ml$/i.test(file.path)) return false;
    if (file.path === TRUSTED_WORKFLOW_FILE) return false;
    return workflowMentionsCursorSecret(file.content);
  });
}

export { URL_NAMESPACE as REVIEW_AGENT_NAMESPACE };
