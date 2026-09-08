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

authClient.ensureElectronRedirect();
