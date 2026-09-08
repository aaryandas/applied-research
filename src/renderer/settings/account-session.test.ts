import { describe, expect, it, vi } from 'vitest';
import type {
  DesktopAccountState,
  DesktopSignOutResult,
} from '../../contracts/desktop-auth';
import { createAccountSession, type AccountSession } from './account-session';
import type { SettingsAccountBridge } from './types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const signedOut: DesktopAccountState = {
  session: 'signed-out',
  account: null,
  quota: null,
  message: null,
};
const signedIn: DesktopAccountState = {
  session: 'signed-in',
  account: {
    id: 'test-account',
    name: 'Synthetic Learner',
    image: 'javascript:untrusted',
  },
  quota: {
    month: '2026-09',
    limitMicrousd: 5_000_000,
    committedMicrousd: 1_000_000,
    reservedMicrousd: 0,
    remainingMicrousd: 4_000_000,
  },
  message: null,
};
const waiting: DesktopAccountState = {
  ...signedOut,
  session: 'signing-in',
  message: 'Continue in your browser.',
};
const unavailable: DesktopAccountState = {
  ...signedOut,
  session: 'unavailable',
  message: 'Account service is temporarily unavailable.',
};

function setup() {
  let listener: (state: DesktopAccountState) => void = () => {};
  const unsubscribe = vi.fn();
  const bridge = {
    accountStatus: vi.fn(async () => signedOut),
    signIn: vi.fn(async () => waiting),
    cancelSignIn: vi.fn(async () => signedOut),
    signOut: vi.fn(async (): Promise<DesktopSignOutResult> => ({
      state: signedOut,
      remoteRevocation: 'confirmed',
    })),
    onAccountState: vi.fn((receive: typeof listener) => {
      listener = receive;
      return unsubscribe;
    }),
  } satisfies SettingsAccountBridge;
  const session = createAccountSession(bridge);
  return {
    bridge,
    session,
    emit: (state: DesktopAccountState) => listener(state),
    unsubscribe,
  };
}
const waitForIdle = async (session: AccountSession): Promise<void> => {
  await vi.waitFor(() => expect(session.getSnapshot().pending).toBeNull(), {
    interval: 1,
  });
};

describe('account session ordering', () => {
  it('subscribes before the initial network refresh and a newer event wins', async () => {
    const { bridge, session, emit } = setup();
    const refresh = deferred<DesktopAccountState>();
    bridge.accountStatus.mockReturnValue(refresh.promise);
    session.connect();
    expect(bridge.onAccountState.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.accountStatus.mock.invocationCallOrder[0]!,
    );
    emit(signedIn);
    refresh.resolve(unavailable);
    await refresh.promise;
    await waitForIdle(session);
    expect(session.getSnapshot().state).toEqual(signedIn);
    expect(bridge.accountStatus).toHaveBeenCalledTimes(1);
  });

  it('suppresses positives only during pending cancel and ignores an older sign-in reply', async () => {
    const { bridge, session, emit } = setup();
    session.connect();
    await waitForIdle(session);
    const signIn = deferred<DesktopAccountState>();
    const cancel = deferred<DesktopAccountState>();
    bridge.signIn.mockReturnValue(signIn.promise);
    bridge.cancelSignIn.mockReturnValue(cancel.promise);
    session.signIn();
    session.signIn();
    session.refresh();
    expect(bridge.signIn).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().state.session).toBe('signing-in');
    session.cancel();
    session.cancel();
    expect(session.getSnapshot().state.account).toBeNull();
    expect(bridge.cancelSignIn).toHaveBeenCalledTimes(1);
    emit(signedIn);
    emit(waiting);
    expect(session.getSnapshot().state.session).toBe('signed-out');
    expect(session.getSnapshot().pending).toBe('cancel');
    cancel.resolve(signedOut);
    await waitForIdle(session);
    signIn.resolve(signedIn);
    await signIn.promise;
    expect(session.getSnapshot().state.session).toBe('signed-out');
    // Settled operations trust the producer, including sign-in from another shell surface.
    emit(waiting);
    expect(session.getSnapshot().state).toEqual(waiting);
    emit(signedIn);
    expect(session.getSnapshot().state).toEqual(signedIn);
  });

  it('keeps waiting after the early reply, then accepts the terminal event', async () => {
    const { bridge, session, emit } = setup();
    session.connect();
    await waitForIdle(session);
    session.signIn();
    await waitForIdle(session);
    expect(session.getSnapshot().pending).toBeNull();
    expect(session.getSnapshot().state).toEqual(waiting);
    session.signIn();
    session.signOut();
    expect(bridge.signIn).toHaveBeenCalledTimes(1);
    expect(bridge.signOut).not.toHaveBeenCalled();
    emit(signedIn);
    expect(session.getSnapshot().state).toEqual(signedIn);
  });

  it('ignores an early waiting reply after a terminal sign-in event', async () => {
    const { bridge, session, emit } = setup();
    session.connect();
    await waitForIdle(session);
    const signIn = deferred<DesktopAccountState>();
    bridge.signIn.mockReturnValue(signIn.promise);
    session.signIn();
    emit(signedIn);
    signIn.resolve(waiting);
    await signIn.promise;
    await waitForIdle(session);
    expect(session.getSnapshot().state).toEqual(signedIn);
  });

  it.each(['confirmed', 'unconfirmed'] as const)(
    'clears identity immediately before %s remote sign-out',
    async (remoteRevocation) => {
      const { bridge, session, emit } = setup();
      bridge.accountStatus.mockResolvedValue(signedIn);
      session.connect();
      await waitForIdle(session);
      const signOut = deferred<DesktopSignOutResult>();
      bridge.signOut.mockReturnValue(signOut.promise);
      session.signIn();
      expect(bridge.signIn).not.toHaveBeenCalled();
      session.signOut();
      session.signOut();
      session.signIn();
      expect(bridge.signOut).toHaveBeenCalledTimes(1);
      expect(session.getSnapshot().state.account).toBeNull();
      expect(session.getSnapshot().state.quota).toBeNull();
      emit(signedOut);
      emit(signedIn);
      signOut.resolve({ state: signedOut, remoteRevocation });
      await waitForIdle(session);
      expect(session.getSnapshot().state.session).toBe('signed-out');
      expect(session.getSnapshot().state.message).toContain(
        remoteRevocation === 'confirmed'
          ? 'Signed out on this device.'
          : 'could not be confirmed',
      );
      expect(session.getSnapshot().pending).toBeNull();
    },
  );

  it('retries offline refresh manually without polling or exposing stale identity', async () => {
    const { bridge, session, emit } = setup();
    bridge.accountStatus.mockResolvedValue(unavailable);
    session.connect();
    await waitForIdle(session);
    expect(session.getSnapshot().state).toEqual(unavailable);
    bridge.accountStatus.mockResolvedValue(signedIn);
    session.refresh();
    session.refresh();
    await waitForIdle(session);
    expect(bridge.accountStatus).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().state).toEqual(signedIn);
    emit({ ...unavailable, account: signedIn.account, quota: signedIn.quota });
    expect(session.getSnapshot().state.account).toBeNull();
    expect(session.getSnapshot().state.quota).toBeNull();
  });

  it.each(['refresh', 'signIn', 'cancelSignIn', 'signOut'] as const)(
    'makes %s IPC rejection visible without raw error text',
    async (method) => {
      const { bridge, session, emit } = setup();
      session.connect();
      await waitForIdle(session);
      const failure = deferred<never>();
      if (method === 'refresh') {
        bridge.accountStatus.mockReturnValue(failure.promise);
        session.refresh();
      }
      if (method === 'signIn') {
        bridge.signIn.mockReturnValue(failure.promise);
        session.signIn();
      }
      if (method === 'cancelSignIn') {
        session.signIn();
        await waitForIdle(session);
        bridge.cancelSignIn.mockReturnValue(failure.promise);
        session.cancel();
        emit(signedOut);
      }
      if (method === 'signOut') {
        emit(signedIn);
        bridge.signOut.mockReturnValue(failure.promise);
        session.signOut();
        emit(signedOut);
      }
      failure.reject(new Error('PRIVATE INTERNAL DETAILS'));
      await waitForIdle(session);
      expect(session.getSnapshot().state.session).toBe('unavailable');
      expect(session.getSnapshot().state.message).toMatch(
        /try again|Retry connection/i,
      );
      expect(session.getSnapshot().state.message).not.toContain('PRIVATE');
      expect(session.getSnapshot().state.message).not.toMatch(
        /signed out|was cancelled/i,
      );
      expect(session.getSnapshot().state.account).toBeNull();
    },
  );

  it('unsubscribes and ignores promises/events after unmount, including remount', async () => {
    const { bridge, session, emit, unsubscribe } = setup();
    const refresh = deferred<DesktopAccountState>();
    bridge.accountStatus.mockReturnValue(refresh.promise);
    const disconnect = session.connect();
    const changed = vi.fn();
    const stop = session.subscribe(changed);
    disconnect();
    const before = session.getSnapshot();
    emit(signedIn);
    refresh.resolve(signedIn);
    await refresh.promise;
    expect(session.getSnapshot()).toBe(before);
    expect(changed).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    stop();
    bridge.accountStatus.mockResolvedValue(signedOut);
    session.connect();
    await waitForIdle(session);
    expect(session.getSnapshot().state).toEqual(signedOut);
  });

  it('shows subscription failure and does not attempt an unobserved sign-in on mount', () => {
    const { bridge, session } = setup();
    bridge.onAccountState.mockImplementation(() => {
      throw new Error('private');
    });
    session.connect();
    expect(session.getSnapshot().state.session).toBe('unavailable');
    expect(bridge.signIn).not.toHaveBeenCalled();
  });
});

it.each(['confirmed', 'unconfirmed'] as const)(
  'trusts a new producer sign-in after %s sign-out settles (Fable P1)',
  async (remoteRevocation) => {
    const { bridge, session, emit } = setup();
    bridge.accountStatus.mockResolvedValue(signedIn);
    bridge.signOut.mockResolvedValue({ state: signedOut, remoteRevocation });
    session.connect();
    await waitForIdle(session);
    session.signOut();
    await waitForIdle(session);
    expect(session.getSnapshot().state.session).toBe('signed-out');
    emit(waiting);
    expect(session.getSnapshot().state).toEqual(waiting);
    emit(signedIn);
    expect(session.getSnapshot().state).toEqual(signedIn);
  },
);

it('accepts the authoritative signed-in cancel reply when completion won the race (Fable P2)', async () => {
  const { bridge, session, emit } = setup();
  session.connect();
  await waitForIdle(session);
  const signIn = deferred<DesktopAccountState>();
  const cancel = deferred<DesktopAccountState>();
  bridge.signIn.mockReturnValue(signIn.promise);
  bridge.cancelSignIn.mockReturnValue(cancel.promise);
  session.signIn();
  session.cancel();
  emit(signedIn);
  expect(session.getSnapshot().state.account).toBeNull();
  cancel.resolve(signedIn);
  await waitForIdle(session);
  expect(session.getSnapshot().state).toEqual({
    ...signedIn,
    message:
      'Sign-in finished before it could be cancelled. You can sign out below.',
  });
  signIn.resolve(waiting);
  await signIn.promise;
  expect(session.getSnapshot().state.session).toBe('signed-in');
  session.signOut();
  await waitForIdle(session);
  expect(bridge.signOut).toHaveBeenCalledTimes(1);
});

it('preserves a newer terminal event over an older cancel reply', async () => {
  const { bridge, session, emit } = setup();
  session.connect();
  await waitForIdle(session);
  session.signIn();
  await waitForIdle(session);
  const cancel = deferred<DesktopAccountState>();
  bridge.cancelSignIn.mockReturnValue(cancel.promise);
  session.cancel();
  emit(unavailable);
  cancel.resolve(signedIn);
  await waitForIdle(session);
  expect(session.getSnapshot().state).toEqual(unavailable);
});

it('resubscribes before a retry refresh and receives later events (Fable P4)', async () => {
  const { bridge, session, emit, unsubscribe } = setup();
  bridge.onAccountState.mockImplementationOnce(() => {
    throw new Error('synthetic failure');
  });
  const disconnect = session.connect();
  expect(session.getSnapshot().state.session).toBe('unavailable');
  expect(bridge.accountStatus).not.toHaveBeenCalled();
  bridge.accountStatus.mockResolvedValue(signedIn);
  session.refresh();
  await waitForIdle(session);
  expect(bridge.onAccountState).toHaveBeenCalledTimes(2);
  expect(bridge.onAccountState.mock.invocationCallOrder[1]).toBeLessThan(
    bridge.accountStatus.mock.invocationCallOrder[0]!,
  );
  emit(unavailable);
  expect(session.getSnapshot().state).toEqual(unavailable);
  disconnect();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('keeps subscription retry failure honest and refuses an unobserved sign-in', async () => {
  const { bridge, session } = setup();
  bridge.onAccountState.mockImplementation(() => {
    throw new Error('private');
  });
  session.connect();
  session.refresh();
  session.signIn();
  expect(bridge.onAccountState).toHaveBeenCalledTimes(3);
  expect(bridge.accountStatus).not.toHaveBeenCalled();
  expect(bridge.signIn).not.toHaveBeenCalled();
  expect(session.getSnapshot().state.session).toBe('unavailable');
  expect(session.getSnapshot().state.message).toContain('Retry connection');
  await waitForIdle(session);
});
