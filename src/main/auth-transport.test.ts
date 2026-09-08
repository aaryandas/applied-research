import { describe, expect, it, vi } from 'vitest';
import { DESKTOP_AUTH_API_ORIGIN } from '../contracts/desktop-auth';
import {
  decodeAccountResponse,
  makeBackendAccountTransport,
} from './auth-transport';

const validAccountResponse = {
  outcome: 'success',
  account: { id: 'account-1', name: 'Builder', image: null },
  quota: {
    month: '2026-09',
    limitMicrousd: 20_000_000,
    committedMicrousd: 2_000,
    reservedMicrousd: 3_000,
    remainingMicrousd: 19_995_000,
  },
} as const;

describe('backend account transport', () => {
  it('decodes the exact account and settled monthly quota shape', () => {
    expect(decodeAccountResponse(validAccountResponse)).toEqual(
      validAccountResponse,
    );
    expect(() =>
      decodeAccountResponse({ ...validAccountResponse, token: 'not-public' }),
    ).toThrow('invalid');
    expect(() =>
      decodeAccountResponse({
        ...validAccountResponse,
        quota: { ...validAccountResponse.quota, remainingMicrousd: 5 },
      }),
    ).toThrow('invalid');
    expect(() =>
      decodeAccountResponse({
        ...validAccountResponse,
        account: { ...validAccountResponse.account, name: '\ud800' },
      }),
    ).toThrow('invalid');
  });

  it('decodes each exact unauthenticated and unavailable outcome', () => {
    expect(
      decodeAccountResponse({
        outcome: 'unauthenticated',
        requestId: 'request-1',
        message: 'Authentication is required.',
      }),
    ).toEqual({
      outcome: 'unauthenticated',
      requestId: 'request-1',
      message: 'Authentication is required.',
    });
    for (const accounting of [
      'none',
      'released',
      'charged',
      'reservation-retained',
    ] as const) {
      expect(
        decodeAccountResponse({
          outcome: 'unavailable',
          requestId: null,
          message: 'Temporarily unavailable.',
          retryable: false,
          accounting,
        }),
      ).toMatchObject({ outcome: 'unavailable', accounting });
    }
    expect(() =>
      decodeAccountResponse({
        outcome: 'unavailable',
        requestId: null,
        message: 'Temporarily unavailable.',
        retryable: 'yes',
        accounting: 'none',
      }),
    ).toThrow('invalid');
    expect(() =>
      decodeAccountResponse({
        outcome: 'unavailable',
        requestId: null,
        message: 'Temporarily unavailable.',
        retryable: true,
        accounting: 'invented',
      }),
    ).toThrow('invalid');
  });

  it('rejects malformed account and quota scalar fields', () => {
    for (const value of [null, [], 'not-an-object']) {
      expect(() => decodeAccountResponse(value)).toThrow('invalid');
    }
    expect(() =>
      decodeAccountResponse({
        ...validAccountResponse,
        account: {
          ...validAccountResponse.account,
          image: 'https://image.test',
        },
        quota: { ...validAccountResponse.quota, month: '2026-13' },
      }),
    ).toThrow('invalid');
    for (const limitMicrousd of [-1, Number.MAX_SAFE_INTEGER + 1, '20']) {
      expect(() =>
        decodeAccountResponse({
          ...validAccountResponse,
          quota: { ...validAccountResponse.quota, limitMicrousd },
        }),
      ).toThrow('invalid');
    }
  });

  it('uses only the fixed origin, account route, cookie and desktop origin', async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json(validAccountResponse),
    );
    const transport = makeBackendAccountTransport(request);

    await expect(
      transport.account(
        'better-auth.session_token=ciphertext',
        new AbortController().signal,
      ),
    ).resolves.toEqual(validAccountResponse);

    expect(request).toHaveBeenCalledWith(
      `${DESKTOP_AUTH_API_ORIGIN}/v1/account`,
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: 'application/json',
          cookie: 'better-auth.session_token=ciphertext',
          origin: 'com.aaryandas.appliedresearch:/',
        },
      }),
    );
  });

  it('cancels an overflowing upstream body', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(64 * 1024 + 1));
        },
        cancel,
      }),
    );
    const transport = makeBackendAccountTransport(async () => response);

    await expect(
      transport.account('cookie', new AbortController().signal),
    ).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels a declared oversized body and rejects an empty body', async () => {
    const cancel = vi.fn();
    const declared = makeBackendAccountTransport(
      async () =>
        new Response(new ReadableStream<Uint8Array>({ cancel }), {
          headers: { 'content-length': String(64 * 1024 + 1) },
        }),
    );
    await expect(
      declared.account('cookie', new AbortController().signal),
    ).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();

    const empty = makeBackendAccountTransport(
      async () => new Response(null, { status: 200 }),
    );
    await expect(
      empty.account('cookie', new AbortController().signal),
    ).rejects.toThrow('empty');
  });

  it('accepts status-matched unauthenticated and unavailable responses', async () => {
    const unauthenticated = makeBackendAccountTransport(async () =>
      Response.json(
        {
          outcome: 'unauthenticated',
          requestId: null,
          message: 'Authentication is required.',
        },
        { status: 401 },
      ),
    );
    await expect(
      unauthenticated.account('cookie', new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'unauthenticated' });

    const unavailable = makeBackendAccountTransport(async () =>
      Response.json(
        {
          outcome: 'unavailable',
          requestId: 'request-1',
          message: 'Temporarily unavailable.',
          retryable: true,
          accounting: 'none',
        },
        { status: 503 },
      ),
    );
    await expect(
      unavailable.account('cookie', new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'unavailable' });
  });

  it('rejects redirects and malformed remote JSON', async () => {
    const redirect = makeBackendAccountTransport(async () =>
      Response.redirect('https://untrusted.invalid/', 302),
    );
    await expect(
      redirect.account('cookie', new AbortController().signal),
    ).rejects.toThrow('redirected');

    const malformed = makeBackendAccountTransport(
      async () => new Response(new Uint8Array([0xc3, 0x28])),
    );
    await expect(
      malformed.account('cookie', new AbortController().signal),
    ).rejects.toThrow();

    const wrongStatus = makeBackendAccountTransport(async () =>
      Response.json(validAccountResponse, { status: 503 }),
    );
    await expect(
      wrongStatus.account('cookie', new AbortController().signal),
    ).rejects.toThrow('status');
  });

  it('rejects malformed or oversized local cookies before dispatch', async () => {
    const request = vi.fn(async () => Response.json(validAccountResponse));
    const transport = makeBackendAccountTransport(request);

    await expect(
      transport.account('', new AbortController().signal),
    ).rejects.toThrow('stored session');
    await expect(
      transport.account(
        'x'.repeat(32 * 1024 + 1),
        new AbortController().signal,
      ),
    ).rejects.toThrow('stored session');
    expect(request).not.toHaveBeenCalled();
  });
});
