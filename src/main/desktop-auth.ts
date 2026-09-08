import { Buffer } from 'node:buffer';
import type {
  DesktopAccountState,
  DesktopSignOutResult,
} from '../contracts/desktop-auth';
import {
  DESKTOP_AUTH_CALLBACK,
  DESKTOP_AUTH_SCHEME,
} from '../contracts/desktop-auth';
import type { AccountResponse } from '../contracts/learning-api';
import type { DesktopAuthDiagnostics } from './auth-diagnostics';
import { silentDesktopAuthDiagnostics } from './auth-diagnostics';
import type { DesktopAuthSdk, ElectronOauthStateRegistry } from './auth-sdk';
import { AUTH_STORAGE_KEYS, type AuthStorage } from './auth-storage';
import type { BackendAccountTransport } from './auth-transport';

const AUTH_ATTEMPT_TIMEOUT_MS = 2 * 60 * 1_000;
const REMOTE_SIGN_OUT_TIMEOUT_MS = 5_000;
const MAX_CALLBACK_URL_CHARACTERS = 8_192;
const MAX_CALLBACK_TOKEN_CHARACTERS = 4_096;
const OAUTH_STATE_PATTERN = /^[A-Za-z0-9]{16}$/;

const SIGNED_OUT_STATE: DesktopAccountState = {
  session: 'signed-out',
  account: null,
  quota: null,
  message: null,
};

interface PendingSignIn {
  readonly generation: number;
  readonly controller: AbortController;
  phase: 'opening' | 'waiting' | 'exchanging';
  state: string | null;
  queuedCallback: ParsedCallback | null;
  timeout: ReturnType<typeof setTimeout> | null;
}

interface ParsedCallback {
  readonly state: string;
  readonly token: string;
}

export interface EncryptionAvailability {
  isUsable(): boolean;
}

export interface DesktopAuthController {
  accountStatus(): Promise<DesktopAccountState>;
  cancelSignIn(): DesktopAccountState;
  dispose(): void;
  handleCallback(url: string): Promise<boolean>;
  markProtocolUnavailable(): void;
  signIn(): Promise<DesktopAccountState>;
  signOut(): Promise<DesktopSignOutResult>;
  state(): DesktopAccountState;
  subscribe(listener: (state: DesktopAccountState) => void): () => void;
}

export interface DesktopAuthOptions {
  readonly sdk: DesktopAuthSdk;
  readonly storage: AuthStorage;
  readonly accountTransport: BackendAccountTransport;
  readonly oauthStates: ElectronOauthStateRegistry;
  readonly encryption: EncryptionAvailability;
  readonly diagnostics?: DesktopAuthDiagnostics;
  readonly attemptTimeoutMs?: number;
  readonly remoteSignOutTimeoutMs?: number;
}

function unavailable(message: string): DesktopAccountState {
  return {
    session: 'unavailable',
    account: null,
    quota: null,
    message,
  };
}

function parseCallback(url: string): ParsedCallback | null {
  if (url.length > MAX_CALLBACK_URL_CHARACTERS) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const callbackTarget = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  if (
    callbackTarget !== DESKTOP_AUTH_CALLBACK ||
    parsed.protocol !== `${DESKTOP_AUTH_SCHEME}:` ||
    parsed.hostname !== 'auth' ||
    parsed.pathname !== '/callback' ||
    parsed.search ||
    !parsed.hash.startsWith('#token=')
  ) {
    return null;
  }
  const token = parsed.hash.slice('#token='.length);
  if (
    token.length === 0 ||
    token.length > MAX_CALLBACK_TOKEN_CHARACTERS ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(token, 'base64url').toString('utf8'),
    );
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return null;
    }
    if (
      Object.keys(payload).some(
        (key) => key !== 'state' && key !== 'identifier',
      )
    ) {
      return null;
    }
    const state = Reflect.get(payload, 'state');
    const identifier = Reflect.get(payload, 'identifier');
    if (
      typeof state !== 'string' ||
      !OAUTH_STATE_PATTERN.test(state) ||
      typeof identifier !== 'string' ||
      identifier.length === 0 ||
      identifier.length > 512 ||
      !identifier.isWellFormed() ||
      identifier.includes('\u0000')
    ) {
      return null;
    }
    return { state, token };
  } catch {
    return null;
  }
}

function stateFromAccountResponse(
  response: AccountResponse,
): DesktopAccountState {
  switch (response.outcome) {
    case 'success':
      return {
        session: 'signed-in',
        account: response.account,
        quota: response.quota,
        message: null,
      };
    case 'unauthenticated':
      return {
        session: 'expired',
        account: null,
        quota: null,
        message: 'Your session expired. Sign in again to use remote learning.',
      };
    case 'unavailable':
      return unavailable('Account service is temporarily unavailable.');
  }
}

export function createDesktopAuthController(
  options: DesktopAuthOptions,
): DesktopAuthController {
  const diagnostics = options.diagnostics ?? silentDesktopAuthDiagnostics;
  const listeners = new Set<(state: DesktopAccountState) => void>();
  const inFlight = new Set<AbortController>();
  let publicState = SIGNED_OUT_STATE;
  let pending: PendingSignIn | null = null;
  let openingRequest: Promise<void> | null = null;
  let generation = 0;
  let protocolAvailable = true;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? AUTH_ATTEMPT_TIMEOUT_MS;
  const remoteSignOutTimeoutMs =
    options.remoteSignOutTimeoutMs ?? REMOTE_SIGN_OUT_TIMEOUT_MS;
  options.storage.acceptEpoch(generation);

  const publish = (next: DesktopAccountState): DesktopAccountState => {
    publicState = next;
    for (const listener of listeners) listener(next);
    return next;
  };

  const encryptionIsUsable = (): boolean => {
    try {
      return options.encryption.isUsable();
    } catch (cause) {
      diagnostics.report('auth.storage-failed', cause);
      return false;
    }
  };

  const advanceGeneration = (): number => {
    generation += 1;
    options.storage.acceptEpoch(generation);
    for (const controller of inFlight) controller.abort();
    inFlight.clear();
    return generation;
  };

  const clearPending = (): void => {
    if (!pending) return;
    pending.controller.abort();
    if (pending.timeout) clearTimeout(pending.timeout);
    if (pending.state) options.oauthStates.delete(pending.state);
    pending = null;
  };

  const storageUnavailable = (): DesktopAccountState => {
    return publish(
      unavailable(
        'Secure session storage is unavailable. Sign-in persistence was not accepted.',
      ),
    );
  };

  const refreshAccount = async (
    expectedGeneration: number,
  ): Promise<DesktopAccountState> => {
    if (!encryptionIsUsable()) {
      options.storage.clear();
      return storageUnavailable();
    }
    const failuresBeforeRead = options.storage.failureCount;
    const hadPersistedSession = options.storage.hasPersistedSession();
    if (options.storage.failureCount !== failuresBeforeRead) {
      options.storage.clear();
      return storageUnavailable();
    }

    const controller = new AbortController();
    inFlight.add(controller);
    try {
      const failuresBeforeRefresh = options.storage.failureCount;
      const session = await options.storage.runAtEpoch(expectedGeneration, () =>
        options.sdk.getSession(controller.signal),
      );
      if (expectedGeneration !== generation) return publicState;
      if (options.storage.failureCount !== failuresBeforeRefresh) {
        options.storage.clear();
        return storageUnavailable();
      }
      if (session === 'unavailable') {
        diagnostics.report('auth.session-refresh-failed');
        return publish(
          unavailable('Account service is temporarily unavailable.'),
        );
      }
      if (session === 'missing') {
        if (!options.storage.clear()) return storageUnavailable();
        return publish(
          hadPersistedSession
            ? {
                session: 'expired',
                account: null,
                quota: null,
                message:
                  'Your session expired. Sign in again to use remote learning.',
              }
            : SIGNED_OUT_STATE,
        );
      }
      const cookie = await options.storage.runAtEpoch(
        expectedGeneration,
        async () => options.sdk.getCookie(),
      );
      if (expectedGeneration !== generation) return publicState;
      if (!cookie) {
        if (!options.storage.clear()) return storageUnavailable();
        return publish(
          hadPersistedSession
            ? {
                session: 'expired',
                account: null,
                quota: null,
                message:
                  'Your session expired. Sign in again to use remote learning.',
              }
            : SIGNED_OUT_STATE,
        );
      }
      const response = await options.accountTransport.account(
        cookie,
        controller.signal,
      );
      if (expectedGeneration !== generation) return publicState;
      const next = stateFromAccountResponse(response);
      if (next.session === 'expired' && !options.storage.clear()) {
        return storageUnavailable();
      }
      return publish(next);
    } catch (cause) {
      if (expectedGeneration !== generation) return publicState;
      diagnostics.report('auth.session-refresh-failed', cause);
      return publish(
        unavailable('Account service is temporarily unavailable.'),
      );
    } finally {
      inFlight.delete(controller);
    }
  };

  const exchangeCallback = async (
    attempt: PendingSignIn,
    callback: ParsedCallback,
  ): Promise<boolean> => {
    if (pending !== attempt || attempt.phase === 'exchanging') return false;
    attempt.phase = 'exchanging';
    if (attempt.timeout) clearTimeout(attempt.timeout);
    const failuresBeforeExchange = options.storage.failureCount;
    try {
      const result = await options.storage.runAtEpoch(attempt.generation, () =>
        options.sdk.authenticate(callback.token, attempt.controller.signal),
      );
      options.oauthStates.delete(callback.state);
      if (pending !== attempt || generation !== attempt.generation)
        return false;
      pending = null;
      if (
        result !== 'success' ||
        options.storage.failureCount !== failuresBeforeExchange
      ) {
        diagnostics.report('auth.exchange-failed');
        if (options.storage.failureCount !== failuresBeforeExchange) {
          options.storage.clear();
          storageUnavailable();
        } else {
          publish(unavailable('Sign-in could not be completed. Try again.'));
        }
        return true;
      }
      await refreshAccount(attempt.generation);
      return true;
    } catch (cause) {
      options.oauthStates.delete(callback.state);
      if (pending !== attempt || generation !== attempt.generation)
        return false;
      pending = null;
      diagnostics.report('auth.exchange-failed', cause);
      if (options.storage.failureCount !== failuresBeforeExchange) {
        options.storage.clear();
        storageUnavailable();
      } else {
        publish(unavailable('Sign-in could not be completed. Try again.'));
      }
      return true;
    }
  };

  const controller: DesktopAuthController = {
    accountStatus() {
      if (pending) return Promise.resolve(publicState);
      return refreshAccount(generation);
    },
    cancelSignIn() {
      if (!pending) return publicState;
      advanceGeneration();
      clearPending();
      options.oauthStates.clear();
      if (!options.storage.clear()) return storageUnavailable();
      return publish(SIGNED_OUT_STATE);
    },
    dispose() {
      advanceGeneration();
      clearPending();
      options.oauthStates.clear();
      listeners.clear();
    },
    async handleCallback(url) {
      const callback = parseCallback(url);
      const attempt = pending;
      if (!callback || !attempt) {
        diagnostics.report('auth.callback-rejected');
        return false;
      }
      if (attempt.phase === 'opening') {
        if (
          attempt.queuedCallback ||
          !options.oauthStates.states().includes(callback.state)
        ) {
          diagnostics.report('auth.callback-rejected');
          return false;
        }
        attempt.queuedCallback = callback;
        return true;
      }
      if (attempt.phase !== 'waiting' || attempt.state !== callback.state) {
        diagnostics.report('auth.callback-rejected');
        return false;
      }
      return exchangeCallback(attempt, callback);
    },
    markProtocolUnavailable() {
      protocolAvailable = false;
      advanceGeneration();
      clearPending();
      options.oauthStates.clear();
      publish(
        unavailable(
          'System browser sign-in is unavailable because the app protocol could not be registered.',
        ),
      );
    },
    async signIn() {
      if (!protocolAvailable) return publicState;
      if (!encryptionIsUsable()) {
        options.storage.clear();
        return storageUnavailable();
      }
      if (pending || openingRequest) return publicState;
      const failuresBeforeRead = options.storage.failureCount;
      options.storage.snapshot();
      if (options.storage.failureCount !== failuresBeforeRead) {
        options.storage.clear();
        return storageUnavailable();
      }
      advanceGeneration();
      if (!options.storage.clear()) return storageUnavailable();
      options.oauthStates.clear();
      const attempt: PendingSignIn = {
        generation,
        controller: new AbortController(),
        phase: 'opening',
        state: null,
        queuedCallback: null,
        timeout: null,
      };
      pending = attempt;
      publish({
        session: 'signing-in',
        account: null,
        quota: null,
        message: 'Complete sign-in in your system browser.',
      });
      openingRequest = options.sdk.requestGithubAuth();
      try {
        await openingRequest;
      } catch (cause) {
        if (pending === attempt) {
          pending = null;
          options.oauthStates.clear();
          diagnostics.report('auth.exchange-failed', cause);
          publish(unavailable('The system browser could not start sign-in.'));
        }
        return publicState;
      } finally {
        openingRequest = null;
      }
      if (pending !== attempt || generation !== attempt.generation) {
        options.oauthStates.clear();
        return publicState;
      }
      const states = options.oauthStates.states();
      if (states.length !== 1) {
        pending = null;
        options.oauthStates.clear();
        diagnostics.report('auth.exchange-failed');
        return publish(unavailable('Sign-in could not be initialized safely.'));
      }
      attempt.state = states[0] ?? null;
      attempt.phase = 'waiting';
      attempt.timeout = setTimeout(() => {
        if (pending !== attempt) return;
        advanceGeneration();
        clearPending();
        options.oauthStates.clear();
        if (!options.storage.clear()) {
          storageUnavailable();
        } else {
          publish({
            session: 'signed-out',
            account: null,
            quota: null,
            message: 'Sign-in timed out. Start again when you are ready.',
          });
        }
      }, attemptTimeoutMs);
      if (attempt.queuedCallback) {
        await exchangeCallback(attempt, attempt.queuedCallback);
      }
      return publicState;
    },
    async signOut() {
      const failuresBeforeSnapshot = options.storage.failureCount;
      const snapshot = options.storage.snapshot();
      const snapshotFailed =
        options.storage.failureCount !== failuresBeforeSnapshot;
      const hadPersistedSession = snapshot.has(AUTH_STORAGE_KEYS[0]);
      const requiresRemoteConfirmation = snapshotFailed || hadPersistedSession;
      const previousGeneration = generation;
      advanceGeneration();
      clearPending();
      options.oauthStates.clear();
      const clearedLocally = options.storage.clear();
      if (clearedLocally) {
        publish(SIGNED_OUT_STATE);
      } else {
        storageUnavailable();
      }

      if (
        snapshotFailed ||
        !clearedLocally ||
        !hadPersistedSession ||
        !encryptionIsUsable()
      ) {
        if (requiresRemoteConfirmation) {
          diagnostics.report('auth.remote-revocation-unconfirmed');
        }
        const state = clearedLocally
          ? publish({
              ...SIGNED_OUT_STATE,
              message: requiresRemoteConfirmation
                ? 'Signed out on this device. Remote revocation could not be confirmed.'
                : null,
            })
          : publicState;
        return {
          state,
          remoteRevocation: requiresRemoteConfirmation
            ? 'unconfirmed'
            : 'confirmed',
        };
      }

      const signal = AbortSignal.timeout(remoteSignOutTimeoutMs);
      try {
        const result = await options.storage.runWithSnapshot(
          previousGeneration,
          snapshot,
          () => options.sdk.signOut(signal),
        );
        if (result === 'success') {
          return { state: publicState, remoteRevocation: 'confirmed' };
        }
        diagnostics.report('auth.remote-revocation-unconfirmed');
      } catch (cause) {
        diagnostics.report('auth.remote-revocation-unconfirmed', cause);
      }
      const state = publish({
        ...SIGNED_OUT_STATE,
        message:
          'Signed out on this device. Remote revocation could not be confirmed.',
      });
      return { state, remoteRevocation: 'unconfirmed' };
    },
    state: () => publicState,
    subscribe(listener) {
      listeners.add(listener);
      listener(publicState);
      return () => listeners.delete(listener);
    },
  };
  return controller;
}
