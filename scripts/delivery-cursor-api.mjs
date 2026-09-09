import {
  AGENT_ID,
  CURSOR_API_ORIGIN,
  TRUSTED_LAUNCH_RECEIPT_SOURCE,
  redactSecrets,
} from './delivery-constants.mjs';
import { assertTrustedCursorInvocation } from './delivery-trust.mjs';

function assertSafeCursorUrl(url) {
  if (url.origin !== CURSOR_API_ORIGIN) {
    throw new Error(
      `Refusing non-documented Cursor origin ${url.origin}; use ${CURSOR_API_ORIGIN}`,
    );
  }
  if (!url.pathname.startsWith('/v1/')) {
    throw new Error(
      `Refusing undocumented Cursor path ${url.pathname}; only /v1/* is used`,
    );
  }
}

export function cursorAuthHeaders(apiKey) {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('CURSOR_API_KEY is missing');
  }
  const basic = Buffer.from(`${apiKey.trim()}:`, 'utf8').toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    Accept: 'application/json',
  };
}

export async function cursorRequest(
  path,
  {
    apiKey,
    method = 'GET',
    body,
    headers = {},
    fetchImpl = fetch,
    trustedEnv,
    env,
  } = {},
) {
  const invocation = trustedEnv ?? env;
  if (invocation) {
    assertTrustedCursorInvocation(invocation);
  }
  const url = new URL(path, CURSOR_API_ORIGIN);
  assertSafeCursorUrl(url);
  const response = await fetchImpl(url, {
    method,
    headers: {
      ...cursorAuthHeaders(apiKey),
      ...headers,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 300) };
    }
  }
  if (!response.ok) {
    const error = new Error(
      redactSecrets(
        `Cursor API ${method} ${url.pathname} returned ${response.status}`,
      ),
    );
    error.status = response.status;
    error.payload = redactSecrets(payload);
    throw error;
  }
  return payload;
}

function requestOptions(options = {}) {
  const { env, ...rest } = options;
  return {
    ...rest,
    trustedEnv: env,
  };
}

export async function listModels(options) {
  return cursorRequest('/v1/models', requestOptions(options));
}

export async function listAgents(options = {}) {
  const query = new URLSearchParams({
    includeArchived: 'false',
    limit: '100',
  });
  if (options.prUrl) query.set('prUrl', options.prUrl);
  const items = [];
  let cursor;
  do {
    if (cursor) query.set('cursor', cursor);
    const page = await cursorRequest(
      `/v1/agents?${query}`,
      requestOptions(options),
    );
    items.push(...(page?.items ?? []));
    cursor = page?.nextCursor;
  } while (cursor);
  return items;
}

export async function getAgent(agentId, options) {
  if (!AGENT_ID.test(agentId ?? '')) {
    throw new Error('Agent id is not a documented bc- UUID');
  }
  return cursorRequest(`/v1/agents/${agentId}`, requestOptions(options));
}

export async function getRun(agentId, runId, options) {
  if (!AGENT_ID.test(agentId ?? '')) {
    throw new Error('Agent id is not a documented bc- UUID');
  }
  return cursorRequest(
    `/v1/agents/${agentId}/runs/${runId}`,
    requestOptions(options),
  );
}

export async function listArtifacts(agentId, options) {
  if (!AGENT_ID.test(agentId ?? '')) {
    throw new Error('Agent id is not a documented bc- UUID');
  }
  return cursorRequest(
    `/v1/agents/${agentId}/artifacts`,
    requestOptions(options),
  );
}

export async function createCloudReviewAgent(body, options = {}) {
  const headers = {};
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }
  return cursorRequest('/v1/agents', {
    ...requestOptions(options),
    method: 'POST',
    body,
    headers,
  });
}

export function githubRepoFullName(url) {
  const raw = String(url ?? '')
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const match = raw.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  return match ? match[1] : null;
}

export function isLaunchPinFailure(message) {
  return /GET repos\[0\]|omitted GET startingRef|omitted-prUrl trusted POST pin/.test(
    String(message ?? ''),
  );
}

export function assertPinnedStartingRef(
  agent,
  expectedHeadSha,
  { launchReceipt, repository } = {},
) {
  const repo = agent?.repos?.[0];
  if (!repo || typeof repo !== 'object' || Array.isArray(repo)) {
    throw new Error(
      'GET repos[0] is required to bind the critic to a GitHub repository',
    );
  }
  const gotRepo = githubRepoFullName(repo.url);
  const expectedRepo = String(
    repository ?? launchReceipt?.repository ?? '',
  ).trim();
  if (!gotRepo) {
    throw new Error(
      'GET repos[0].url must be the GitHub repository the trusted POST launched against',
    );
  }
  if (expectedRepo && gotRepo.toLowerCase() !== expectedRepo.toLowerCase()) {
    throw new Error(
      `GET repos[0].url is ${gotRepo}, not launch-receipt repository ${expectedRepo}`,
    );
  }
  if (Object.hasOwn(repo, 'startingRef')) {
    const startingRef = repo.startingRef;
    if (typeof startingRef !== 'string' || startingRef.length === 0) {
      throw new Error(
        'GET repos[0].startingRef is present but empty, null, or malformed; only property absence may use the trusted POST pin',
      );
    }
    if (startingRef !== expectedHeadSha) {
      throw new Error(
        `GET repos[0].startingRef is ${startingRef}, not live head ${expectedHeadSha}. Documented prUrl ignores startingRef, so an explicit GET pin must equal the reviewed SHA.`,
      );
    }
    return;
  }
  if (Object.hasOwn(repo, 'prUrl')) {
    throw new Error(
      'GET repos[0].prUrl is present while startingRef is omitted; documented prUrl ignores startingRef, so this is not the omitted-prUrl trusted POST pin',
    );
  }
  if (!expectedRepo) {
    throw new Error(
      'Launch receipt repository is required to bind GET repo identity when GET omits startingRef',
    );
  }
  if (!launchReceipt) {
    throw new Error(
      'GET repos[0].startingRef is omitted; a trusted-launch-job receipt is required to prove the POST pinned startingRef to the exact head',
    );
  }
  if (launchReceipt.source !== TRUSTED_LAUNCH_RECEIPT_SOURCE) {
    throw new Error(
      'GET repos[0].startingRef is omitted; coordinator or caller JSON cannot substitute for the trusted POST pin',
    );
  }
  if (launchReceipt.headSha !== expectedHeadSha) {
    throw new Error(
      `Launch receipt headSha ${launchReceipt.headSha} does not match live head ${expectedHeadSha}; omitted GET startingRef is not permission to accept a different pin`,
    );
  }
}
