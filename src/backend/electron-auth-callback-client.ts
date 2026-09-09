import { electronProxyClient } from '@better-auth/electron/proxy';
import { createAuthClient } from 'better-auth/client';
import { DESKTOP_SCHEME } from './policy.js';

const authClient = createAuthClient({
  plugins: [
    electronProxyClient({
      protocol: { scheme: DESKTOP_SCHEME },
      callbackPath: '/auth/callback',
    }),
  ],
});

const returnButton = document.querySelector<HTMLButtonElement>(
  '#auth-return-button',
);
const returnStatus = document.querySelector<HTMLElement>('#auth-return-status');

if (returnButton && returnStatus) {
  const authorizationCode = authClient.electron.getAuthorizationCode();
  const validCode =
    authorizationCode !== null &&
    /^[A-Za-z0-9_-]+={0,2}$/.test(authorizationCode) &&
    (authorizationCode.includes('=')
      ? authorizationCode.length % 4 === 0
      : authorizationCode.length % 4 !== 1);
  if (validCode) {
    // Better Auth pads its base64url output; the desktop accepts canonical form.
    const callbackToken = authorizationCode.replace(/=+$/, '');
    const expiresAt = Date.now() + 120_000;
    returnButton.disabled = false;
    returnStatus.textContent = 'Open the app to finish signing in.';
    returnButton.addEventListener('click', () => {
      if (Date.now() >= expiresAt) {
        returnButton.disabled = true;
        returnStatus.textContent =
          'This sign-in has expired. Start Sign in again from the app.';
        return;
      }
      // Keep navigation inside the user gesture; Firefox can block timer redirects.
      document.cookie =
        'better-auth.electron=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
      window.location.replace(
        `${DESKTOP_SCHEME}://auth/callback#token=${callbackToken}`,
      );
      returnStatus.textContent =
        'Approve opening Applied Research if your browser asks. You can try the button again.';
    });
  } else {
    returnStatus.textContent =
      'This sign-in has expired. Start Sign in again from the app.';
  }
}
