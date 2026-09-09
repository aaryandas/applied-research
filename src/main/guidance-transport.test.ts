import { describe, expect, it, vi } from 'vitest';
import { DESKTOP_AUTH_API_ORIGIN } from '../contracts/desktop-auth';
import { COMPANION_GUIDANCE_HTTP_PATH } from './guidance-envelope';
import type { CompanionGuidanceEnvelope } from './guidance-envelope';
import {
  CompanionGuidanceTransportError,
  makeCompanionGuidanceTransport,
} from './guidance-transport';

const requestId = '31000000-0000-4000-8000-000000000001';
const envelope: CompanionGuidanceEnvelope = {
  apiVersion: '2026-09-09',
  requestId,
  projectId: '10000000-0000-4000-8000-000000000001',
  projectGeneration: 1,
  requestGeneration: 0,
  cause: 'ask-once',
  question: 'Explain this passage.',
  grounding: 'source',
  source: {
    sourceId: 'source-01',
    revisionId: 'revision01',
    title: 'Linear maps',
    canonicalText: 'Shear the basis.',
    sha256: 'a'.repeat(64),
    format: 'plain-text',
    canonicalizationVersion: 'workspace-plain-v1',
    acquiredAt: '2026-09-09T08:00:00.000Z',
    provenance: { kind: 'human-imported', locator: null },
  },
  excerpt: null,
  learnerContext: [],
};

const reply = {
  outcome: 'success',
  requestId,
  authorKind: 'ai',
  text: 'Compare the sheared image.',
  provenance: {
    author: 'ai',
    provider: 'openrouter',
    providerRequestId: 'provreq03',
    model: 'google/gemini-3.8-flash',
    requestVersion: '2026-09-08',
    promptVersion: 'learning-v2-2026-09-09',
    createdAt: '2026-09-09T08:00:00.000Z',
    sourceRevisions: [
      {
        sourceId: 'source-01',
        revisionId: 'revision01',
        title: 'Linear maps',
        sha256: 'a'.repeat(64),
        format: 'plain-text',
        canonicalizationVersion: 'workspace-plain-v1',
        acquiredAt: '2026-09-09T08:00:00.000Z',
        provenance: { kind: 'human-imported', locator: null },
      },
    ],
  },
  nextAction: 'Change one entry.',
  citations: [
    {
      sourceId: 'source-01',
      revisionId: 'revision01',
      start: 0,
      end: 5,
      quote: 'Shear',
    },
  ],
};

describe('authenticated companion guidance transport', () => {
  it('posts once to the fixed companion path with the session cookie', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(reply), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const post = makeCompanionGuidanceTransport({
      request: fetch,
      sessionCookie: () => 'session=current',
    });
    await expect(
      post(envelope, new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'success' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `${DESKTOP_AUTH_API_ORIGIN}${COMPANION_GUIDANCE_HTTP_PATH}`,
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: expect.objectContaining({ cookie: 'session=current' }),
      }),
    );
  });

  it('does not retry a failed fetch and maps it to offline', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const post = makeCompanionGuidanceTransport({
      request: fetch,
      sessionCookie: () => 'session=ok',
    });
    await expect(
      post(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'offline' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails closed without a session cookie', async () => {
    const fetch = vi.fn();
    const post = makeCompanionGuidanceTransport({
      request: fetch,
      sessionCookie: () => '',
    });
    await expect(
      post(envelope, new AbortController().signal),
    ).rejects.toBeInstanceOf(CompanionGuidanceTransportError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not follow redirects or accept non-JSON', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example/' },
        }),
    );
    const post = makeCompanionGuidanceTransport({
      request: fetch,
      sessionCookie: () => 'session=ok',
    });
    await expect(
      post(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('fails closed on a newline cookie, abort, and non-JSON bodies', async () => {
    const fetch = vi.fn();
    const blocked = makeCompanionGuidanceTransport({
      request: fetch,
      sessionCookie: () => 'session=ok\n',
    });
    await expect(
      blocked(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(fetch).not.toHaveBeenCalled();

    const aborted = new AbortController();
    aborted.abort();
    const post = makeCompanionGuidanceTransport({
      request: fetch,
      sessionCookie: () => 'session=ok',
    });
    await expect(post(envelope, aborted.signal)).rejects.toThrow();

    const invalid = makeCompanionGuidanceTransport({
      request: async () =>
        new Response('{', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      sessionCookie: () => 'session=ok',
    });
    await expect(
      invalid(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });

    const oversized = makeCompanionGuidanceTransport({
      request: async () =>
        new Response('{}', {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-length': String(5 * 1024 * 1024),
          },
        }),
      sessionCookie: () => 'session=ok',
    });
    await expect(
      oversized(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('maps a deadline abort to unavailable, not cancelled', async () => {
    const timeout = AbortSignal.abort();
    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeout);
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Response(JSON.stringify(reply), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const post = makeCompanionGuidanceTransport({
      request: fetch,
      sessionCookie: () => 'session=ok',
    });
    await expect(
      post(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });
    timeoutSpy.mockRestore();
  });

  it('does not treat a 401 success-shaped body as ready', async () => {
    const post = makeCompanionGuidanceTransport({
      request: async () =>
        new Response(JSON.stringify(reply), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      sessionCookie: () => 'session=ok',
    });
    await expect(
      post(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('preserves HTTP citations and nextAction for the AR53 reply and requires HTTP 200 for success', async () => {
    const cited = {
      ...reply,
      citations: [
        {
          sourceId: 'a0000000-0000-4000-8000-000000000001',
          revisionId: 'b0000000-0000-4000-8000-000000000001',
          start: 0,
          end: 5,
          quote: 'Shear',
        },
      ],
    };
    const post = makeCompanionGuidanceTransport({
      request: async () =>
        new Response(JSON.stringify(cited), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      sessionCookie: () => 'session=ok',
    });
    const decoded = await post(envelope, new AbortController().signal);
    expect(decoded).toMatchObject({
      outcome: 'success',
      requestId,
      nextAction: 'Change one entry.',
      citations: cited.citations,
    });

    const nonOk = makeCompanionGuidanceTransport({
      request: async () =>
        new Response(JSON.stringify(cited), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      sessionCookie: () => 'session=ok',
    });
    await expect(
      nonOk(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('rejects missing citations, quote mismatch, extra keys, and stale-shaped success', async () => {
    const missing = makeCompanionGuidanceTransport({
      request: async () =>
        new Response(
          JSON.stringify({
            outcome: 'success',
            requestId,
            authorKind: 'ai',
            text: 'Compare the sheared image.',
            provenance: reply.provenance,
            nextAction: 'Change one entry.',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      sessionCookie: () => 'session=ok',
    });
    await expect(
      missing(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });

    const mismatched = makeCompanionGuidanceTransport({
      request: async () =>
        new Response(
          JSON.stringify({
            ...reply,
            citations: [
              {
                sourceId: 'a0000000-0000-4000-8000-000000000001',
                revisionId: 'b0000000-0000-4000-8000-000000000001',
                start: 0,
                end: 15,
                quote: 'Shear',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      sessionCookie: () => 'session=ok',
    });
    await expect(
      mismatched(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });

    const extra = makeCompanionGuidanceTransport({
      request: async () =>
        new Response(
          JSON.stringify({
            ...reply,
            href: 'https://example.test/paper',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      sessionCookie: () => 'session=ok',
    });
    await expect(
      extra(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('maps an aborted fetch to cancelled and does not retry', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });
    const post = makeCompanionGuidanceTransport({
      request: fetch,
      sessionCookie: () => 'session=ok',
    });
    await expect(post(envelope, controller.signal)).rejects.toMatchObject({
      code: 'cancelled',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an undecodable JSON reply and a missing body', async () => {
    const invalid = makeCompanionGuidanceTransport({
      request: async () =>
        new Response(JSON.stringify({ outcome: 'nope' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      sessionCookie: () => 'session=ok',
    });
    await expect(
      invalid(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });

    const empty = makeCompanionGuidanceTransport({
      request: async () =>
        ({
          status: 200,
          headers: {
            get: (name: string) =>
              name === 'content-type' ? 'application/json' : null,
          },
          body: null,
        }) as Response,
      sessionCookie: () => 'session=ok',
    });
    await expect(
      empty(envelope, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });
});
