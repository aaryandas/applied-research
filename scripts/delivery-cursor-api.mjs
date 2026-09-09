import {
  AGENT_ID,
  CURSOR_API_ORIGIN,
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
  try {
    return await cursorRequest('/v1/agents', {
      ...requestOptions(options),
      method: 'POST',
      body,
      headers,
    });
  } catch (error) {
    if (error.status === 409 && AGENT_ID.test(body?.agentId ?? '')) {
      const agent = await getAgent(body.agentId, options);
      return { agent, run: null, idempotentReplay: true };
    }
    throw error;
  }
}

export function assertPinnedStartingRef(agent, expectedHeadSha) {
  const startingRef = agent?.repos?.[0]?.startingRef;
  if (startingRef !== expectedHeadSha) {
    throw new Error(
      `GET repos[0].startingRef is ${startingRef ?? 'missing'}, not live head ${expectedHeadSha}. Documented prUrl ignores startingRef and bases workOnCurrentBranch=false on the PR base, so launch omits prUrl and pins startingRef to the exact SHA.`,
    );
  }
}
