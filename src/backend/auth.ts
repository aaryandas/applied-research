import { Context, Effect, Layer } from 'effect';
import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { electron } from '@better-auth/electron';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import type { BackendConfig } from './config.js';
import { Database } from './database.js';
import type { DatabaseService } from './database.js';
import {
  DESKTOP_TRUSTED_ORIGIN,
  ELECTRON_AUTH_CALLBACK_URL,
  SESSION_EXPIRES_SECONDS,
  SESSION_UPDATE_SECONDS,
} from './policy.js';
import { authSchema } from './schema.js';

export interface AuthenticatedAccount {
  id: string;
  name: string;
  image: string | null;
}

export interface AuthService {
  readonly handle: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => Promise<void>;
  readonly authenticate: (
    headers: IncomingHttpHeaders,
  ) => Promise<AuthenticatedAccount | null>;
}

export class Authentication extends Context.Tag(
  'applied-research/Authentication',
)<Authentication, AuthService>() {}

export function createAuthenticationService(
  config: BackendConfig,
  database: DatabaseService,
): AuthService {
  const auth = betterAuth({
    appName: 'Applied Research',
    baseURL: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    database: drizzleAdapter(database.db, {
      provider: 'pg',
      schema: authSchema,
      camelCase: true,
      transaction: true,
    }),
    trustedOrigins: [DESKTOP_TRUSTED_ORIGIN],
    socialProviders: {
      github: {
        clientId: config.githubClientId,
        clientSecret: config.githubClientSecret,
      },
    },
    session: {
      expiresIn: SESSION_EXPIRES_SECONDS,
      updateAge: SESSION_UPDATE_SECONDS,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, window: 60, max: 100 },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        const isElectronSocialSignIn =
          context.path === '/sign-in/social' &&
          context.query?.client_id === 'electron';
        if (!isElectronSocialSignIn || !context.body) return;
        return {
          context: {
            body: {
              ...context.body,
              callbackURL: ELECTRON_AUTH_CALLBACK_URL,
            },
          },
        };
      }),
    },
    plugins: [
      electron({
        clientID: 'electron',
        codeExpiresIn: 300,
        redirectCookieExpiresIn: 120,
      }),
    ],
  });
  return {
    handle: toNodeHandler(auth),
    authenticate: async (headers) => {
      const authenticated = await auth.api.getSession({
        headers: fromNodeHeaders(headers),
        query: { disableCookieCache: true },
      });
      if (!authenticated) return null;
      return {
        id: authenticated.user.id,
        name: authenticated.user.name,
        image: authenticated.user.image ?? null,
      };
    },
  };
}

export function makeAuthLayer(
  config: BackendConfig,
): Layer.Layer<Authentication, never, Database> {
  return Layer.effect(
    Authentication,
    Effect.gen(function* () {
      const database = yield* Database;
      return createAuthenticationService(config, database);
    }),
  );
}
