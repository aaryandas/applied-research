import { describe, expect, it, vi } from 'vitest';
import { makeAuthenticatedOnboardingTransport } from './learning-onboarding-transport';
import { DESKTOP_AUTH_API_ORIGIN } from '../contracts/desktop-auth';
import { LEARNING_ONBOARDING_PATH } from '../contracts/learning-onboarding-api';

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
});
