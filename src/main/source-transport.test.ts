import { describe, expect, it, vi } from 'vitest';
import { makeAuthenticatedSourceTransport } from './source-transport';
import { DESKTOP_AUTH_API_ORIGIN } from '../contracts/desktop-auth';
import { SOURCING_API_VERSION } from '../contracts/sourcing';
import type { DiscoverSourcesRequest } from '../contracts/sourcing';

const request: DiscoverSourcesRequest = {
  apiVersion: SOURCING_API_VERSION,
  requestId: 'discovery-test',
  query: 'linear algebra',
  intent: 'learning' as const,
  kinds: ['paper'],
  limit: 5,
};

describe('authenticated source transport', () => {
  it('sends the current session only to the fixed backend with caller cancellation', async () => {
    let cookie = 'session=first';
    const fetch = vi.fn<
      (input: string, init: RequestInit) => Promise<Response>
    >(async () => Response.json({ outcome: 'success' }));
    const transport = makeAuthenticatedSourceTransport({
      request: fetch,
      sessionCookie: () => cookie,
    });
    cookie = 'session=current';
    const controller = new AbortController();
    await transport.discover(request, controller.signal);
    expect(fetch).toHaveBeenCalledWith(
      `${DESKTOP_AUTH_API_ORIGIN}/v1/sources/discover`,
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: expect.objectContaining({ cookie: 'session=current' }),
        body: JSON.stringify(request),
      }),
    );
    controller.abort();
    expect(fetch.mock.calls[0]?.[1].signal?.aborted).toBe(true);
  });

  it('does not make a request after cancellation or sign-out', async () => {
    const fetch = vi.fn();
    const transport = makeAuthenticatedSourceTransport({
      request: fetch,
      sessionCookie: () => '',
    });
    await expect(
      transport.discover(request, new AbortController().signal),
    ).rejects.toThrow('Sign in');
    await expect(
      transport.discover(request, AbortSignal.abort()),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses redirects before parsing a response', async () => {
    const transport = makeAuthenticatedSourceTransport({
      request: async () => new Response(null, { status: 302 }),
      sessionCookie: () => 'session=current',
    });
    await expect(
      transport.discover(request, new AbortController().signal),
    ).rejects.toThrow('invalid response');
  });

  it('bounds streamed bodies even when Content-Length is absent', async () => {
    const cancel = vi.fn();
    const transport = makeAuthenticatedSourceTransport({
      request: async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1));
            },
            cancel,
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      sessionCookie: () => 'session=current',
    });
    await expect(
      transport.discover(request, new AbortController().signal),
    ).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
  });
});
