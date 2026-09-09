import { describe, expect, it, vi } from 'vitest';
import { makeAuthenticatedOnboardingTransport } from './learning-onboarding-transport';
import { DESKTOP_AUTH_API_ORIGIN } from '../contracts/desktop-auth';
import {
  LEARNING_ONBOARDING_LIMITS,
  LEARNING_ONBOARDING_PATH,
} from '../contracts/learning-onboarding-api';

describe('authenticated onboarding transport', () => {
  it('posts raw bytes only to the sibling onboarding path', async () => {
    const fetch = vi.fn<
      (input: string, init: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(new Uint8Array([123, 125]), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    const transport = makeAuthenticatedOnboardingTransport({
      request: fetch,
      sessionCookie: () => 'session=current',
    });
    const body = await transport.post(
      '{"ok":true}',
      new AbortController().signal,
    );
    expect(fetch).toHaveBeenCalledWith(
      `${DESKTOP_AUTH_API_ORIGIN}${LEARNING_ONBOARDING_PATH}`,
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: expect.objectContaining({ cookie: 'session=current' }),
        body: '{"ok":true}',
      }),
    );
    expect(body).toEqual(new Uint8Array([123, 125]));
  });

  it('does not request after sign-out', async () => {
    const fetch = vi.fn();
    const transport = makeAuthenticatedOnboardingTransport({
      request: fetch,
      sessionCookie: () => '',
    });
    await expect(
      transport.post('{}', new AbortController().signal),
    ).rejects.toThrow('Sign in');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects cookies that are not a well-formed session value', async () => {
    const fetch = vi.fn();
    for (const cookie of [
      'session=current\n',
      'session=current\r',
      'session=current\u0000',
      `session=${'a'.repeat(32 * 1024 + 1)}`,
      'session=\uD800',
    ]) {
      const transport = makeAuthenticatedOnboardingTransport({
        request: fetch,
        sessionCookie: () => cookie,
      });
      await expect(
        transport.post('{}', new AbortController().signal),
      ).rejects.toThrow('Sign in');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an oversized request before calling the network', async () => {
    const fetch = vi.fn();
    const transport = makeAuthenticatedOnboardingTransport({
      request: fetch,
      sessionCookie: () => 'session=current',
    });
    await expect(
      transport.post(
        'x'.repeat(LEARNING_ONBOARDING_LIMITS.requestBytes + 1),
        new AbortController().signal,
      ),
    ).rejects.toThrow('too large');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not follow redirects or accept a non-JSON content type', async () => {
    const redirected = vi.fn(
      async () =>
        new Response(new Uint8Array([123, 125]), {
          status: 302,
          headers: {
            'content-type': 'application/json',
            location: 'https://evil.example/onboarding',
          },
        }),
    );
    const redirectTransport = makeAuthenticatedOnboardingTransport({
      request: redirected,
      sessionCookie: () => 'session=current',
    });
    await expect(
      redirectTransport.post('{}', new AbortController().signal),
    ).rejects.toThrow('invalid response');
    const plain = vi.fn(
      async () =>
        new Response('not-json', {
          headers: { 'content-type': 'text/plain' },
        }),
    );
    const plainTransport = makeAuthenticatedOnboardingTransport({
      request: plain,
      sessionCookie: () => 'session=current',
    });
    await expect(
      plainTransport.post('{}', new AbortController().signal),
    ).rejects.toThrow('invalid response');
  });

  it('rejects empty bodies and declared oversize responses', async () => {
    const empty = vi.fn(async () => new Response(null, { status: 200 }));
    const emptyTransport = makeAuthenticatedOnboardingTransport({
      request: empty,
      sessionCookie: () => 'session=current',
    });
    await expect(
      emptyTransport.post('{}', new AbortController().signal),
    ).rejects.toThrow(/empty|invalid response/);
    const declared = vi.fn(
      async () =>
        new Response(new Uint8Array([123, 125]), {
          headers: {
            'content-type': 'application/json',
            'content-length': String(
              LEARNING_ONBOARDING_LIMITS.responseBytes + 1,
            ),
          },
        }),
    );
    const declaredTransport = makeAuthenticatedOnboardingTransport({
      request: declared,
      sessionCookie: () => 'session=current',
    });
    await expect(
      declaredTransport.post('{}', new AbortController().signal),
    ).rejects.toThrow('too large');
  });

  it('stops reading when streamed bytes exceed the response ceiling', async () => {
    const chunk = { byteLength: LEARNING_ONBOARDING_LIMITS.responseBytes + 1 };
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk as Uint8Array);
        controller.close();
      },
    });
    const fetch = vi.fn(
      async () =>
        new Response(stream, {
          headers: { 'content-type': 'application/json' },
        }),
    );
    const transport = makeAuthenticatedOnboardingTransport({
      request: fetch,
      sessionCookie: () => 'session=current',
    });
    await expect(
      transport.post('{}', new AbortController().signal),
    ).rejects.toThrow('too large');
  });

  it('does not post after the caller has already aborted', async () => {
    const fetch = vi.fn();
    const transport = makeAuthenticatedOnboardingTransport({
      request: fetch,
      sessionCookie: () => 'session=current',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(transport.post('{}', controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
