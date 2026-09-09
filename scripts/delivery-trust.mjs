import { createHash } from 'node:crypto';
import {
  AGENT_ID,
  LAUNCH_RECEIPT_KIND,
  LAUNCH_RECEIPT_SCHEMA_VERSION,
  MISSING_ISOLATION_VARS,
  REQUIRED_MODEL_ID,
  REQUIRED_MODEL_PARAMS,
  RUN_ID,
  TRUSTED_DEFAULT_BRANCH_ENV,
  TRUSTED_GITHUB_EVENTS,
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

export function launchReceiptFailures(
  receipt,
  { expectedHeadSha, agent, run } = {},
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
  return failures;
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
