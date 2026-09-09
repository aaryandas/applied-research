import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// Run after npm run build:backend to exercise the shipped browser bundle.
const source = await readFile(
  new URL('../out/backend/public/electron-auth-callback.js', import.meta.url),
  'utf8',
);
const origin = 'https://api-production-e7aa.up.railway.app';
const syntheticCode = 'synthetic-one-time-code';

for (const initialCookie of ['', `better-auth.electron=${syntheticCode}`]) {
  test(`callback initializes without Node globals (${initialCookie ? 'cookie' : 'no cookie'})`, () => {
    const intervals = new Map();
    const redirects = [];
    const cookieWrites = [];
    let cookie = initialCookie;
    let timerId = 0;
    let networkCalls = 0;
    const context = {
      document: {
        visibilityState: 'visible',
        addEventListener() {},
        removeEventListener() {},
        get cookie() {
          return cookie;
        },
        set cookie(value) {
          cookieWrites.push(value);
          cookie = value;
        },
      },
      window: {
        location: {
          origin,
          href: `${origin}/auth/electron/callback`,
          replace(value) {
            redirects.push(value);
          },
        },
        addEventListener() {},
        removeEventListener() {},
      },
      navigator: { onLine: true },
      URL,
      URLSearchParams,
      Headers,
      Request,
      Response,
      TextEncoder,
      TextDecoder,
      AbortController,
      AbortSignal,
      fetch() {
        networkCalls += 1;
        throw new Error('Callback must not fetch in this regression test.');
      },
      setInterval(callback) {
        const id = ++timerId;
        intervals.set(id, callback);
        return id;
      },
      clearInterval(id) {
        intervals.delete(id);
      },
      setTimeout() {
        return ++timerId;
      },
      clearTimeout() {},
    };

    vm.runInNewContext(source, context, {
      timeout: 2_000,
      contextCodeGeneration: { strings: false, wasm: false },
    });
    assert.equal(intervals.size, 1);
    for (const callback of intervals.values()) callback();
    assert.equal(networkCalls, 0);
    assert.deepEqual(
      redirects,
      initialCookie
        ? [
            `com.aaryandas.appliedresearch://auth/callback#token=${syntheticCode}`,
          ]
        : [],
    );
    if (initialCookie) {
      assert.ok(
        cookieWrites.some((value) =>
          value.startsWith('better-auth.electron=;'),
        ),
      );
    }
  });
}
