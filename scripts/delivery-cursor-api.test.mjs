import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURSOR_API_ORIGIN, redactSecrets } from './delivery-constants.mjs';
import { cursorRequest } from './delivery-cursor-api.mjs';

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
