import type { DesktopAccountState } from '../../contracts/desktop-auth';
import type { SettingsAccountBridge } from './types';

type AccountOperation = 'refresh' | 'sign-in' | 'cancel' | 'sign-out';
interface OperationVersion {
  readonly operation: number;
  readonly revision: number;
}
export interface AccountSnapshot {
  readonly state: DesktopAccountState;
  readonly pending: AccountOperation | null;
  readonly receivedAt: Date | null;
}

const signedOut: DesktopAccountState = {
  session: 'signed-out',
  account: null,
  quota: null,
  message: null,
};
const failureMessages: Record<AccountOperation, string> = {
  refresh:
    'Could not refresh your account. Try again when you have a connection.',
  'sign-in': 'Could not start sign-in. Please try again.',
  cancel:
    'Cancellation could not be confirmed. Retry connection to check your account.',
  'sign-out':
    'Sign-out could not be confirmed. Retry connection to check your account.',
};
const unconfirmedSignOut =
  'Signed out on this device. Sign-out of the online session could not be confirmed.';

function unavailable(message: string): DesktopAccountState {
  return { session: 'unavailable', account: null, quota: null, message };
}

export interface AccountSession {
  getSnapshot(): AccountSnapshot;
  subscribe(listener: () => void): () => void;
  connect(): () => void;
  refresh(): void;
  signIn(): void;
  cancel(): void;
  signOut(): void;
}

/** Orders refreshes, early sign-in replies and pushed state without owning credentials. */
export function createAccountSession(
  bridge: SettingsAccountBridge,
): AccountSession {
  let snapshot: AccountSnapshot = {
    state: signedOut,
    pending: 'refresh',
    receivedAt: null,
  };
  const listeners = new Set<() => void>();
  let active = false;
  let operation = 0;
  let connection = 0;
  let revision = 0;
  let unsubscribe: (() => void) | null = null;

  function publish(next: AccountSnapshot): void {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function accept(state: DesktopAccountState): void {
    // Keep identity/usage absent outside signed-in, even if a producer regresses.
    const publicState =
      state.session === 'signed-in'
        ? state
        : { ...state, account: null, quota: null };
    publish({ ...snapshot, state: publicState, receivedAt: new Date() });
  }

  function receive(state: DesktopAccountState): void {
    if (!active) return;
    const isEndingSession =
      snapshot.pending === 'sign-out' || snapshot.pending === 'cancel';
    const isLateSignIn =
      isEndingSession &&
      (state.session === 'signed-in' || state.session === 'signing-in');
    if (isLateSignIn) return;
    revision++;
    accept(state);
    if (!isEndingSession) publish({ ...snapshot, pending: null });
  }

  function isCurrent(version: OperationVersion): boolean {
    return active && operation === version.operation;
  }

  function hasNoNewerEvent(version: OperationVersion): boolean {
    return isCurrent(version) && revision === version.revision;
  }

  async function completeSignOut(version: OperationVersion): Promise<void> {
    const result = await bridge.signOut();
    if (!isCurrent(version) || snapshot.state.session !== 'signed-out') return;
    const newerMessage =
      revision !== version.revision ? snapshot.state.message : null;
    const revocationMessage =
      result.remoteRevocation === 'unconfirmed'
        ? unconfirmedSignOut
        : 'Signed out on this device.';
    accept({
      ...signedOut,
      message: newerMessage ?? result.state.message ?? revocationMessage,
    });
  }

  async function completeStateOperation(
    kind: Exclude<AccountOperation, 'sign-out'>,
    version: OperationVersion,
  ): Promise<void> {
    const methods = {
      refresh: () => bridge.accountStatus(),
      'sign-in': () => bridge.signIn(),
      cancel: () => bridge.cancelSignIn(),
    };
    const state = await methods[kind]();
    if (!hasNoNewerEvent(version)) return;
    const signInWonCancellation =
      kind === 'cancel' && state.session === 'signed-in';
    accept(
      signInWonCancellation
        ? {
            ...state,
            message:
              'Sign-in finished before it could be cancelled. You can sign out below.',
          }
        : state,
    );
  }

  function reportOperationFailure(
    kind: AccountOperation,
    version: OperationVersion,
  ): void {
    const endingSessionFailed =
      isCurrent(version) &&
      (kind === 'sign-out' || kind === 'cancel') &&
      snapshot.state.session === 'signed-out';
    if (hasNoNewerEvent(version) || endingSessionFailed) {
      accept(unavailable(failureMessages[kind]));
    }
  }

  async function run(kind: AccountOperation): Promise<void> {
    const version = { operation: ++operation, revision: ++revision };
    publish({ ...snapshot, pending: kind });
    try {
      if (kind === 'sign-out') await completeSignOut(version);
      else await completeStateOperation(kind, version);
    } catch {
      reportOperationFailure(kind, version);
    } finally {
      if (isCurrent(version)) publish({ ...snapshot, pending: null });
    }
  }

  function subscribeToAccount(): boolean {
    if (unsubscribe) return true;
    const currentConnection = ++connection;
    try {
      unsubscribe = bridge.onAccountState((state) => {
        if (connection === currentConnection) receive(state);
      });
      return true;
    } catch {
      accept(
        unavailable(
          'Account updates are unavailable. Retry connection to try again.',
        ),
      );
      publish({ ...snapshot, pending: null });
      return false;
    }
  }

  return {
    getSnapshot: (): AccountSnapshot => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect(): () => void {
      active = true;
      if (subscribeToAccount()) void run('refresh');
      return () => {
        active = false;
        operation++;
        revision++;
        connection++;
        unsubscribe?.();
        unsubscribe = null;
      };
    },
    refresh(): void {
      if (
        !active ||
        snapshot.pending ||
        snapshot.state.session === 'signing-in'
      )
        return;
      if (subscribeToAccount()) void run('refresh');
    },
    signIn(): void {
      const cannotStart =
        !active ||
        snapshot.pending ||
        snapshot.state.session === 'signed-in' ||
        snapshot.state.session === 'signing-in';
      if (cannotStart) return;
      if (!subscribeToAccount()) return;
      accept({
        session: 'signing-in',
        account: null,
        quota: null,
        message: 'Continue sign-in in your browser. You can keep working here.',
      });
      void run('sign-in');
    },
    cancel(): void {
      if (
        !active ||
        snapshot.state.session !== 'signing-in' ||
        snapshot.pending === 'cancel'
      )
        return;
      accept(signedOut);
      void run('cancel');
    },
    signOut(): void {
      if (!active || snapshot.pending || snapshot.state.session !== 'signed-in')
        return;
      accept({
        ...signedOut,
        message: 'Signing out…',
      });
      void run('sign-out');
    },
  };
}
