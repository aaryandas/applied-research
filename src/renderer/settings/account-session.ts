import type { DesktopAccountState } from '../../contracts/desktop-auth';
import type { SettingsAccountBridge } from './types';

type AccountOperation = 'refresh' | 'sign-in' | 'cancel' | 'sign-out';
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
    'Sign-in was cancelled here, but could not be confirmed. Please try again.',
  'sign-out':
    'Signed out here. Sign-out on this device and other sessions could not be confirmed. Please try again when connected.',
};
const unconfirmedSignOut =
  'Signed out on this device. Sign-out of the online session could not be confirmed.';

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
  let rejectLateSignIn = false;

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
    const isLateSignIn =
      rejectLateSignIn &&
      (state.session === 'signed-in' || state.session === 'signing-in');
    if (isLateSignIn) return;
    revision++;
    accept(state);
    const isEndingSession =
      snapshot.pending === 'sign-out' || snapshot.pending === 'cancel';
    if (!isEndingSession) publish({ ...snapshot, pending: null });
  }

  async function run(kind: AccountOperation): Promise<void> {
    const currentOperation = ++operation;
    const currentRevision = ++revision;
    publish({ ...snapshot, pending: kind });
    const isCurrent = (): boolean => active && operation === currentOperation;
    const hasNoNewerEvent = (): boolean =>
      isCurrent() && revision === currentRevision;
    try {
      if (kind === 'sign-out') {
        const result = await bridge.signOut();
        if (isCurrent() && snapshot.state.session === 'signed-out') {
          accept({
            ...signedOut,
            message:
              (revision !== currentRevision ? snapshot.state.message : null) ??
              result.state.message ??
              (result.remoteRevocation === 'unconfirmed'
                ? unconfirmedSignOut
                : 'Signed out on this device.'),
          });
        }
      } else {
        const methods = {
          refresh: () => bridge.accountStatus(),
          'sign-in': () => bridge.signIn(),
          cancel: () => bridge.cancelSignIn(),
        };
        const state = await methods[kind]();
        if (hasNoNewerEvent()) {
          const isCancelledIdentity =
            kind === 'cancel' &&
            (state.session === 'signed-in' || state.session === 'signing-in');
          if (!isCancelledIdentity) accept(state);
        }
      }
    } catch {
      const endingSessionFailed =
        isCurrent() &&
        (kind === 'sign-out' || kind === 'cancel') &&
        snapshot.state.session === 'signed-out';
      if (hasNoNewerEvent() || endingSessionFailed) {
        accept({
          session: 'unavailable',
          account: null,
          quota: null,
          message: failureMessages[kind],
        });
      }
    } finally {
      if (isCurrent()) publish({ ...snapshot, pending: null });
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
      const currentConnection = ++connection;
      let unsubscribe = (): void => {};
      try {
        unsubscribe = bridge.onAccountState((state) => {
          if (connection === currentConnection) receive(state);
        });
        void run('refresh');
      } catch {
        accept({
          session: 'unavailable',
          account: null,
          quota: null,
          message:
            'Account updates are unavailable. Reopen Settings to try again.',
        });
        publish({ ...snapshot, pending: null });
      }
      return () => {
        active = false;
        operation++;
        revision++;
        unsubscribe();
      };
    },
    refresh(): void {
      if (
        !active ||
        snapshot.pending ||
        snapshot.state.session === 'signing-in'
      )
        return;
      rejectLateSignIn = false;
      void run('refresh');
    },
    signIn(): void {
      const cannotStart =
        !active ||
        snapshot.pending ||
        snapshot.state.session === 'signed-in' ||
        snapshot.state.session === 'signing-in';
      if (cannotStart) return;
      rejectLateSignIn = false;
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
      rejectLateSignIn = true;
      accept(signedOut);
      void run('cancel');
    },
    signOut(): void {
      if (!active || snapshot.pending || snapshot.state.session !== 'signed-in')
        return;
      rejectLateSignIn = true;
      accept({
        ...signedOut,
        message: 'Signed out here. Confirming sign-out…',
      });
      void run('sign-out');
    },
  };
}
