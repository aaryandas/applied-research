import { describe, expect, it, vi } from 'vitest';
import { LEARNING_API_VERSION } from '../contracts/learning-api';
import type { LearningRequest } from '../contracts/learning-api';
import {
  EXPLANATION_PLAN_PATH,
  LEARNING_REQUESTS_PATH,
  makeContextualHelpTransport,
  ContextualHelpTransportError,
} from './contextual-help-transport';
import { DESKTOP_AUTH_API_ORIGIN } from '../contracts/desktop-auth';

const tutorRequest: LearningRequest = {
  apiVersion: LEARNING_API_VERSION,
  requestId: '11000000-0000-4000-8000-000000000001',
  model: 'google/gemini-3.8-flash' as const,
  operation: {
    kind: 'source-grounded-tutor' as const,
    question: 'Why?',
    sources: [],
    learnerContext: [],
  },
};

describe('contextual help transport', () => {
  it('posts the tutor envelope to the authenticated learning route with the current cookie', async () => {
    const request = vi.fn<
      (input: string, init: RequestInit) => Promise<Response>
    >(async () => {
      return new Response(JSON.stringify({ outcome: 'success' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    let cookie = 'session=first';
    const transport = makeContextualHelpTransport({
      request,
      sessionCookie: () => cookie,
    });
    cookie = 'session=current';
    await transport.tutor(tutorRequest, new AbortController().signal);
    expect(request).toHaveBeenCalledWith(
      `${DESKTOP_AUTH_API_ORIGIN}${LEARNING_REQUESTS_PATH}`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          cookie: 'session=current',
          origin: 'com.aaryandas.appliedresearch:/',
        }),
      }),
    );
  });

  it('posts planner envelopes to the sibling explanation-plans route', async () => {
    const request = vi.fn<
      (input: string, init: RequestInit) => Promise<Response>
    >(async () => {
      return new Response(JSON.stringify({ outcome: 'unsupported' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      });
    });
    const transport = makeContextualHelpTransport({
      request,
      sessionCookie: () => 'session=current',
    });
    await transport.plan(
      { requestId: tutorRequest.requestId },
      AbortSignal.timeout(1_000),
    );
    expect(request.mock.calls[0]?.[0]).toBe(
      `${DESKTOP_AUTH_API_ORIGIN}${EXPLANATION_PLAN_PATH}`,
    );
  });

  it('fails closed without a session cookie and does not call the network', async () => {
    const request = vi.fn();
    const transport = makeContextualHelpTransport({
      request,
      sessionCookie: () => '',
    });
    await expect(
      transport.tutor(tutorRequest, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'unauthenticated',
    } satisfies Partial<ContextualHelpTransportError>);
    expect(request).not.toHaveBeenCalled();
  });
});
