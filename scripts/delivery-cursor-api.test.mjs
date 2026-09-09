import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURSOR_API_ORIGIN, redactSecrets } from './delivery-constants.mjs';
import {
  assertPinnedStartingRef,
  createCloudReviewAgent,
  cursorRequest,
} from './delivery-cursor-api.mjs';

test('Cursor client only uses the documented api.cursor.com /v1 surface', async () => {
  await assert.rejects(
    () =>
      cursorRequest('https://example.invalid/v1/agents', {
        apiKey: 'cursor_test',
        fetchImpl: async () => {
          throw new Error('must not fetch');
        },
      }),
    /non-documented Cursor origin/,
  );
  await assert.rejects(
    () =>
      cursorRequest('/v0/agents', {
        apiKey: 'cursor_test',
        fetchImpl: async () => {
          throw new Error('must not fetch');
        },
      }),
    /undocumented Cursor path/,
  );
  assert.equal(CURSOR_API_ORIGIN, 'https://api.cursor.com');
});

test('Cursor client authenticates with Basic and never logs the key', async () => {
  let authorization;
  await cursorRequest('/v1/models', {
    apiKey: 'cursor_secret-value',
    fetchImpl: async (url, init) => {
      authorization = init.headers.Authorization;
      assert.equal(String(url), 'https://api.cursor.com/v1/models');
      return {
        ok: true,
        status: 200,
        async text() {
          return '{"items":[]}';
        },
      };
    },
  });
  assert.match(authorization, /^Basic /);
  assert.equal(authorization.includes('cursor_secret-value'), false);
  assert.equal(
    redactSecrets(
      'Authorization: Basic abc\nCURSOR_API_KEY=cursor_secret-value',
    ),
    'Authorization: [redacted]\nCURSOR_API_KEY=[redacted]',
  );
});

test('HTTP errors are fail-closed and redacted', async () => {
  await assert.rejects(
    () =>
      cursorRequest('/v1/agents', {
        apiKey: 'cursor_secret-value',
        fetchImpl: async () => ({
          ok: false,
          status: 401,
          async text() {
            return '{"message":"Authorization: Bearer cursor_secret-value"}';
          },
        }),
      }),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(
        JSON.stringify(error.payload).includes('cursor_secret-value'),
        false,
      );
      return /returned 401/.test(error.message);
    },
  );
});

test('F1: Cursor client with untrusted env refuses to fetch', async () => {
  await assert.rejects(
    () =>
      cursorRequest('/v1/models', {
        apiKey: 'cursor_test',
        env: {
          TRUSTED_DEFAULT_BRANCH: 'true',
          GITHUB_EVENT_NAME: 'pull_request',
        },
        fetchImpl: async () => {
          throw new Error('must not fetch');
        },
      }),
    /untrusted pull-request code/,
  );
});

test('F3: create sends startingRef, Idempotency-Key, and omits prUrl', async () => {
  let seen;
  const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  await createCloudReviewAgent(
    {
      prompt: { text: 'review' },
      model: { id: 'grok-4.6', params: [{ id: 'effort', value: 'xhigh' }] },
      repos: [
        {
          url: 'https://github.com/aaryandas/applied-research',
          startingRef: HEAD,
        },
      ],
      agentId: 'bc-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa',
    },
    {
      apiKey: 'cursor_test',
      idempotencyKey: `independent-review:aaryandas/applied-research:44:${HEAD}`,
      fetchImpl: async (url, init) => {
        seen = { url: String(url), init };
        return {
          ok: true,
          status: 200,
          async text() {
            return '{"agent":{"id":"bc-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa"}}';
          },
        };
      },
    },
  );
  assert.equal(seen.url, 'https://api.cursor.com/v1/agents');
  assert.equal(
    seen.init.headers['Idempotency-Key'],
    `independent-review:aaryandas/applied-research:44:${HEAD}`,
  );
  const body = JSON.parse(seen.init.body);
  assert.equal(body.repos[0].startingRef, HEAD);
  assert.equal(Object.hasOwn(body.repos[0], 'prUrl'), false);
});

test('HTTP 409 on create is fail-closed and does not GET the existing agent', async () => {
  let gotAgent = false;
  await assert.rejects(
    () =>
      createCloudReviewAgent(
        {
          prompt: { text: 'review' },
          agentId: 'bc-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa',
        },
        {
          apiKey: 'cursor_test',
          fetchImpl: async (url) => {
            const href = String(url);
            if (
              href.endsWith(
                '/v1/agents/bc-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa',
              )
            ) {
              gotAgent = true;
              throw new Error('must not GET existing agent');
            }
            return {
              ok: false,
              status: 409,
              async text() {
                return '{"agentId":"bc-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa"}';
              },
            };
          },
        },
      ),
    (error) => {
      assert.equal(error.status, 409);
      return /returned 409/.test(error.message);
    },
  );
  assert.equal(gotAgent, false);
});

test('F3: GET startingRef is optional; explicit mismatch fails and omitted pin uses the trusted POST', () => {
  const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const STALE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const receipt = {
    source: 'trusted-launch-job',
    headSha: HEAD,
    repository: 'aaryandas/applied-research',
  };
  assert.doesNotThrow(() =>
    assertPinnedStartingRef(
      { repos: [{ url: 'https://github.com/aaryandas/applied-research' }] },
      HEAD,
      { launchReceipt: receipt },
    ),
  );
  assert.doesNotThrow(() =>
    assertPinnedStartingRef(
      {
        repos: [
          {
            url: 'https://github.com/aaryandas/applied-research',
            startingRef: HEAD,
          },
        ],
      },
      HEAD,
      { launchReceipt: receipt },
    ),
  );
  assert.throws(
    () =>
      assertPinnedStartingRef(
        {
          repos: [
            {
              url: 'https://github.com/aaryandas/applied-research',
              startingRef: STALE,
            },
          ],
        },
        HEAD,
        { launchReceipt: receipt },
      ),
    /startingRef is bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/,
  );
  assert.throws(
    () =>
      assertPinnedStartingRef(
        { repos: [{ url: 'https://github.com/other/fork' }] },
        HEAD,
        { launchReceipt: receipt },
      ),
    /other\/fork/,
  );
  assert.throws(
    () =>
      assertPinnedStartingRef(
        { repos: [{ url: 'https://github.com/aaryandas/applied-research' }] },
        HEAD,
        {
          launchReceipt: {
            source: 'coordinator-dispatch-input',
            headSha: HEAD,
            repository: 'aaryandas/applied-research',
          },
        },
      ),
    /caller JSON/,
  );
  assert.throws(
    () =>
      assertPinnedStartingRef(
        {
          repos: [
            {
              url: 'https://github.com/aaryandas/applied-research',
              startingRef: '',
            },
          ],
        },
        HEAD,
        { launchReceipt: receipt },
      ),
    /empty, null, or malformed/,
  );
  assert.throws(
    () =>
      assertPinnedStartingRef(
        {
          repos: [
            {
              url: 'https://github.com/aaryandas/applied-research',
              startingRef: null,
            },
          ],
        },
        HEAD,
        { launchReceipt: receipt },
      ),
    /empty, null, or malformed/,
  );
  assert.throws(
    () =>
      assertPinnedStartingRef(
        {
          repos: [
            {
              url: 'https://github.com/aaryandas/applied-research',
              prUrl: 'https://github.com/aaryandas/applied-research/pull/99',
            },
          ],
        },
        HEAD,
        { launchReceipt: receipt },
      ),
    /prUrl is present/,
  );
});
