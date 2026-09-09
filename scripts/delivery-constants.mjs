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

export const MISSING_CURSOR_API_KEY = [
  'CURSOR_API_KEY is not a GitHub Actions secret, so this workflow cannot retrieve or launch Cursor Cloud agents.',
  `Add a user or service-account key from ${CURSOR_API_KEYS_URL} as repository secret CURSOR_API_KEY.`,
  'Until then independent review stays fail-closed pending authentic GET https://api.cursor.com/v1/agents evidence.',
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
