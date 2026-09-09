import {
  AGENT_ID,
  CURSOR_API_ORIGIN,
  redactSecrets,
} from './delivery-constants.mjs';

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
  { apiKey, method = 'GET', body, fetchImpl = fetch } = {},
) {
  const url = new URL(path, CURSOR_API_ORIGIN);
  assertSafeCursorUrl(url);
  const response = await fetchImpl(url, {
    method,
    headers: {
      ...cursorAuthHeaders(apiKey),
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

export async function listModels(options) {
  return cursorRequest('/v1/models', options);
}

export async function listAgentsForPr(prUrl, options = {}) {
  const query = new URLSearchParams({
    prUrl,
    includeArchived: 'false',
    limit: '100',
  });
  const items = [];
  let cursor;
  do {
    if (cursor) query.set('cursor', cursor);
    const page = await cursorRequest(`/v1/agents?${query}`, options);
    items.push(...(page?.items ?? []));
    cursor = page?.nextCursor;
  } while (cursor);
  return items;
}

export async function getAgent(agentId, options) {
  if (!AGENT_ID.test(agentId ?? '')) {
    throw new Error('Agent id is not a documented bc- UUID');
  }
  return cursorRequest(`/v1/agents/${agentId}`, options);
}

export async function getRun(agentId, runId, options) {
  if (!AGENT_ID.test(agentId ?? '')) {
    throw new Error('Agent id is not a documented bc- UUID');
  }
  return cursorRequest(`/v1/agents/${agentId}/runs/${runId}`, options);
}

export async function listArtifacts(agentId, options) {
  if (!AGENT_ID.test(agentId ?? '')) {
    throw new Error('Agent id is not a documented bc- UUID');
  }
  return cursorRequest(`/v1/agents/${agentId}/artifacts`, options);
}

export async function createCloudReviewAgent(body, options) {
  return cursorRequest('/v1/agents', {
    ...options,
    method: 'POST',
    body,
  });
}
