// Shared delivery-orchestration contracts. No credentials, network, or GitHub I/O.

export const CURSOR_API_ORIGIN = 'https://api.cursor.com';
export const CURSOR_AGENT_ORIGIN = 'https://cursor.com';
export const CURSOR_API_KEYS_URL = 'https://cursor.com/dashboard/api';
export const REPOSITORY = 'aaryandas/applied-research';
export const REPO_URL = `https://github.com/${REPOSITORY}`;

export const FULL_SHA = /^[a-f0-9]{40}$/;
export const AGENT_ID =
  /^bc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RUN_ID =
  /^run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INDEPENDENT_REVIEWER = 'independent-reviewer';
export const INDEPENDENT_REVIEW_NAME = /^Independent review\b/i;
export const FORBIDDEN_REVIEW_ROLES = Object.freeze([
  'implementer',
  'verifier',
  'recorder',
  'coordinator',
]);

export const REVIEW_CHECK_NAME =
  'Independent review / Cursor Cloud Grok 4.6 Extra High';
export const CI_GATE_NAME = 'checks / CI gate';
export const LANE_GUARD_NAME = 'Lane guard';
export const LINEAR_GATE_NAME = 'Linear gate';
export const HOSTED_SONAR_NAMES = Object.freeze([
  'Sonar gate',
  'Sonar (main only) / analyze',
]);

export const REQUIRED_REVIEW_DISPLAY = 'Cursor Cloud Grok 4.6 Extra High';
export const REQUIRED_MODEL_ID = 'grok-4.6';
export const REQUIRED_MODEL_PARAMS = Object.freeze([
  { id: 'effort', value: 'xhigh' },
  { id: 'fast', value: 'false' },
]);

export const LAUNCH_RECEIPT_KIND = 'cursor-cloud-independent-review-launch';
export const LAUNCH_RECEIPT_SCHEMA_VERSION = 1;
export const TRUSTED_DEFAULT_BRANCH_ENV = 'TRUSTED_DEFAULT_BRANCH';
export const LAUNCH_RECEIPT_ENV = 'CURSOR_LAUNCH_RECEIPT_JSON';
export const UNTRUSTED_GITHUB_EVENTS = Object.freeze([
  'pull_request',
  'pull_request_target',
  'issue_comment',
  'pull_request_review',
  'pull_request_review_comment',
]);
export const TRUSTED_GITHUB_EVENTS = Object.freeze([
  'workflow_dispatch',
  'workflow_run',
]);
export const TRUSTED_WORKFLOW_FILE =
  '.github/workflows/independent-review-trusted.yml';
export const UNTRUSTED_REVIEW_WORKFLOW_NAME =
  'Independent review (untrusted pending)';
export const TRUSTED_GITHUB_ENVIRONMENT = 'trusted-main';
export const TRUSTED_ENVIRONMENT_BRANCH_POLICY = Object.freeze({
  type: 'branch',
  name: 'main',
});
export const LEGACY_FABLE_WORKFLOW = Object.freeze({
  path: '.github/workflows/claude-review.yml',
  id: 353522718,
  actionsName: 'Independent review (Claude)',
  state: 'disabled_manually',
});
export const LINEAR_MERGE_STATE = 'In Review';
export const LINEAR_DRAFT_PR_STATE = 'In Development';
export const LINEAR_READY_PR_STATE = 'In Testing';
export const LINEAR_STATUS_AUTOMATION_GAP = [
  'GitHub↔Linear status automation gap: next-run.md documents Linear GitHub integration PR opened → In Development and ready → In Testing, but that did not fire when GitHub PR #45 (AR-52) and PR #46 (AR-53) opened as drafts against the walkthrough candidate.',
  'Both tickets remained Backlog with the PR URL attached (startedAt null) after those PRs existed.',
  'Owned delivery mapping does not treat Backlog as In Review and does not move Linear status.',
].join(' ');

export const UNTRUSTED_CURSOR_CREDENTIAL = [
  'This GitHub event is untrusted pull-request code and must not receive or use CURSOR_API_KEY.',
  'Independent review runs only from default-branch workflow code (workflow_run / workflow_dispatch on the default branch),',
  'checking out that ref as executable code and passing the PR number and SHA as data.',
  'Do not treat GitHub comments, cursor[bot] text, or self-authored marker strings as a PASS.',
].join(' ');

export const MISSING_LAUNCH_RECEIPT = [
  'Documented GET /v1/agents and GET /v1/agents/{id}/runs do not include model or originalModelName.',
  'PASS requires a coordinator or trusted-launch receipt bound to authenticated agentId, runId, and repos[0].startingRef.',
  'Do not accept verdict.model, agent.model, or undocumented fields as picker/runtime proof.',
].join(' ');

export const MISSING_ISOLATION_VARS = [
  'IMPLEMENTER_AGENT_ID, VERIFIER_AGENT_ID, and RECORDER_AGENT_ID must be non-empty documented bc- UUIDs.',
  'Role is taken from authenticated agent.id isolation plus agent.name matching /^Independent review\\b/i, not from run.result JSON.',
].join(' ');

export const MISSING_CURSOR_API_KEY = [
  'Trusted default-branch evaluation has no CURSOR_API_KEY in this job environment.',
  `The authorized key already lives on existing GitHub Environment ${TRUSTED_GITHUB_ENVIRONMENT} (deployment branch policy: type=${TRUSTED_ENVIRONMENT_BRANCH_POLICY.type}, name=${TRUSTED_ENVIRONMENT_BRANCH_POLICY.name}).`,
  'The repository-level CURSOR_API_KEY was removed after that protected copy was verified. Do not create a new secret or environment.',
  `This job must bind environment: ${TRUSTED_GITHUB_ENVIRONMENT} on an allowed default-branch ref. Until it can authenticate, independent review stays fail-closed.`,
  'Do not treat GitHub comments, cursor[bot] text, or self-authored marker strings as a PASS.',
].join(' ');

export const PARTIAL_ACCEPTANCE = Object.freeze({
  'AR-17':
    'Existing AR-17 recording had disabled insight save. That attachment is partial proof, not PASS; require insight save at the exact current revision.',
  'AR-24':
    'Existing AR-24 recording lacked WebGL orbit/picking/Capture. That attachment is partial proof, not PASS; require those criteria at the exact current revision.',
  'AR-19':
    'Existing AR-19 recording showed only empty activity. That attachment is partial proof, not PASS; require a nonempty activity journey at the exact current revision.',
});

export function isFullSha(value) {
  return typeof value === 'string' && FULL_SHA.test(value);
}

export function isSyntheticMergeRef(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  return (
    /refs\/pull\/\d+\/(?:merge|head)/.test(value) ||
    /\/merge$/.test(value) ||
    value === 'merge'
  );
}

export function ticketFromBranchOrBody(branch = '', body = '') {
  const match =
    String(branch).match(/\bar-(\d+)\b/i) ??
    String(body).match(/^Linear:\s*AR-(\d+)\s*$/im);
  return match ? `AR-${match[1]}` : null;
}

export function expectedLinearStateFromPr(pr) {
  if (!pr || String(pr.state).toUpperCase() !== 'OPEN') return null;
  return pr.isDraft ? LINEAR_DRAFT_PR_STATE : LINEAR_READY_PR_STATE;
}

export function explainLinearLifecycleGap({ pr, linear, ticket } = {}) {
  const actual = linear?.state ?? 'unknown';
  if (actual === LINEAR_MERGE_STATE) return null;
  const identifier = ticket ?? linear?.identifier ?? 'the ticket';
  const expected = expectedLinearStateFromPr(pr);
  const parts = [
    `Linear ${identifier} must be ${LINEAR_MERGE_STATE} (current: ${actual}).`,
  ];
  if (expected) {
    parts.push(
      `Owned mapping from this GitHub PR: ${expected} (open draft → ${LINEAR_DRAFT_PR_STATE}; open ready → ${LINEAR_READY_PR_STATE}).`,
    );
  }
  if (actual === 'Backlog' && expected) {
    parts.push(LINEAR_STATUS_AUTOMATION_GAP);
  } else {
    parts.push(
      'Do not treat this Linear state as In Review. This workflow does not move Linear status.',
    );
  }
  return parts.join(' ');
}

export function redactSecrets(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value
      .replace(/^(Authorization:\s*).*$/gim, '$1[redacted]')
      .replace(/(CURSOR_API_KEY[=:]\s*)\S+/gi, '$1[redacted]')
      .replace(/\bcursor_[A-Za-z0-9_-]+/g, 'cursor_[redacted]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === 'object') {
    const copy = {};
    for (const [key, entry] of Object.entries(value)) {
      copy[key] = /authorization|api[_-]?key|secret|token|password/i.test(key)
        ? '[redacted]'
        : redactSecrets(entry);
    }
    return copy;
  }
  return value;
}

export function isDeliveryOnlyPath(file) {
  return (
    file.startsWith('scripts/') ||
    file.startsWith('context/') ||
    file.startsWith('.github/') ||
    file.endsWith('.md') ||
    file === 'package.json' ||
    file === 'package-lock.json'
  );
}

export function touchesApplication(files = []) {
  return files.some(
    (file) =>
      file.startsWith('src/') ||
      file.startsWith('drizzle/') ||
      file.startsWith('tests/e2e/') ||
      file.startsWith('tests/integration/'),
  );
}

export function isSonarWorkflowPath(file) {
  return (
    file === '.github/workflows/sonar.yml' ||
    file.startsWith('scripts/hosted-sonar')
  );
}

export function modelParamsMatch(
  actual = [],
  required = REQUIRED_MODEL_PARAMS,
) {
  return required.every((need) =>
    actual.some((item) => item?.id === need.id && item?.value === need.value),
  );
}
