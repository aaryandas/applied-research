import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type {
  DesktopAccountState,
  DesktopSignOutResult,
} from '../../contracts/desktop-auth';
import { SettingsPanel } from './SettingsPanel';
import { AccountEntry } from './AccountEntry';
import { AppearanceControl } from './AppearanceControl';
import type { SettingsAccountBridge } from './types';

const signedOut: DesktopAccountState = {
  session: 'signed-out',
  account: null,
  quota: null,
  message: null,
};
const signedIn: DesktopAccountState = {
  session: 'signed-in',
  account: {
    id: 'synthetic',
    name: '<script> A very long synthetic learner name '.repeat(4),
    image: 'https://untrusted.example/avatar',
  },
  quota: {
    month: '2026-01',
    limitMicrousd: 10_000_000,
    committedMicrousd: 1_250_001,
    reservedMicrousd: 250_000,
    remainingMicrousd: 8_499_999,
  },
  message: null,
};
function bridge(initial: DesktopAccountState = signedOut) {
  let emit: (state: DesktopAccountState) => void = () => {};
  const unsubscribe = vi.fn();
  const methods = {
    accountStatus: vi.fn(async () => initial),
    signIn: vi.fn(async () => ({
      ...signedOut,
      session: 'signing-in' as const,
      message: 'Continue in your browser.',
    })),
    cancelSignIn: vi.fn(async () => signedOut),
    signOut: vi.fn(async (): Promise<DesktopSignOutResult> => ({
      state: signedOut,
      remoteRevocation: 'confirmed',
    })),
    onAccountState: vi.fn((listener: typeof emit) => {
      emit = listener;
      return unsubscribe;
    }),
  } satisfies SettingsAccountBridge;
  return {
    methods,
    emit: (state: DesktopAccountState) => emit(state),
    unsubscribe,
  };
}
const appearance = { value: 'light' as const, onChange: vi.fn(async () => {}) };

it('renders authoritative microUSD and UTC month, untrusted name only as text, no avatar', async () => {
  const auth = bridge(signedIn);
  const { container, unmount } = render(
    <SettingsPanel
      accountBridge={auth.methods}
      appearance={appearance}
      onClose={vi.fn()}
    />,
  );
  expect(await screen.findByText(signedIn.account!.name.trim())).toBeVisible();
  expect(screen.getByText('January 2026 (UTC)')).toBeVisible();
  expect(screen.getByText('$1.250001')).toBeVisible();
  expect(screen.getByText('$0.25')).toBeVisible();
  expect(screen.getByText('$8.499999')).toBeVisible();
  expect(screen.getByText('$10.00')).toBeVisible();
  expect(screen.getByText(/As of last refresh/)).toBeVisible();
  expect(container.querySelector('img, a, script')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Sign in' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh usage' }));
  await act(async () => {});
  expect(auth.methods.accountStatus).toHaveBeenCalledTimes(2);
  unmount();
  expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
});

it.each(['signed-out', 'signing-in', 'expired', 'unavailable'] as const)(
  'renders %s with no identity or quota and the correct controls',
  async (session) => {
    const message = 'A long synthetic connection message. '.repeat(12);
    const auth = bridge({ ...signedIn, session, message });
    render(
      <SettingsPanel
        accountBridge={auth.methods}
        appearance={appearance}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText(message.trim())).toBeVisible();
    expect(
      screen.queryByText(signedIn.account!.name.trim()),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('$10.00')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: session === 'signing-in' ? 'Cancel sign-in' : 'Sign in',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Sign out' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('status')[0]).toHaveAttribute(
      'aria-live',
      'polite',
    );
    if (session === 'unavailable') {
      auth.methods.accountStatus.mockResolvedValue(signedIn);
      fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
      expect(
        await screen.findByRole('button', { name: 'Sign out' }),
      ).toBeVisible();
    }
  },
);

it('keeps a focused action in place through sign-in/cancel, and keeps returning to work available', async () => {
  const auth = bridge();
  const onClose = vi.fn();
  render(
    <SettingsPanel
      accountBridge={auth.methods}
      appearance={appearance}
      onClose={onClose}
    />,
  );
  await act(async () => {});
  expect(screen.getByRole('heading', { name: 'Settings' })).toHaveFocus();
  const action = screen.getByRole('button', { name: 'Sign in' });
  action.focus();
  fireEvent.click(action);
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Cancel sign-in' })).toHaveFocus();
  fireEvent.click(action);
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus();
  const back = screen.getByRole('button', { name: 'Back to work' });
  back.focus();
  fireEvent.click(back);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('leaves the appearance controlled until shell acknowledgment and makes rejection retryable', async () => {
  let reject!: (error: Error) => void;
  const onChange = vi.fn(
    () =>
      new Promise<void>((_yes, no) => {
        reject = no;
      }),
  );
  const view = render(<AppearanceControl value="light" onChange={onChange} />);
  const dark = screen.getByRole('button', { name: 'Dark' });
  dark.focus();
  fireEvent.click(dark);
  fireEvent.click(dark);
  expect(onChange).toHaveBeenCalledExactlyOnceWith('dark');
  expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(dark).toHaveFocus();
  expect(screen.queryByText(/saved/i)).not.toBeInTheDocument();
  await act(async () => reject(new Error('PRIVATE')));
  expect(screen.getByRole('status')).toHaveTextContent(
    'Could not change appearance. Please try again.',
  );
  onChange.mockResolvedValue();
  fireEvent.click(dark);
  await act(async () => {});
  view.rerender(<AppearanceControl value="dark" onChange={onChange} />);
  expect(dark).toHaveAttribute('aria-pressed', 'true');
});

it('provides a native keyboard-focusable compact account entry without loading remote identity', () => {
  const open = vi.fn();
  const { container, rerender } = render(
    <AccountEntry state={signedIn} onOpenSettings={open} />,
  );
  const button = screen.getByRole('button', {
    name: `Settings for ${signedIn.account!.name.trim()}`,
  });
  button.focus();
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute('type', 'button');
  fireEvent.click(button);
  expect(open).toHaveBeenCalledTimes(1);
  expect(container.querySelector('img, a, script')).toBeNull();
  rerender(
    <AccountEntry
      state={{ ...signedIn, session: 'expired' }}
      onOpenSettings={open}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Account and settings' }),
  ).toBeVisible();
});

it('hides account and quota immediately while sign-out awaits remote confirmation', async () => {
  const auth = bridge(signedIn);
  let resolve!: (result: DesktopSignOutResult) => void;
  auth.methods.signOut.mockReturnValue(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  render(
    <SettingsPanel
      accountBridge={auth.methods}
      appearance={appearance}
      onClose={vi.fn()}
    />,
  );
  const action = await screen.findByRole('button', { name: 'Sign out' });
  action.focus();
  fireEvent.click(action);
  expect(screen.queryByText('$10.00')).not.toBeInTheDocument();
  expect(
    screen.queryByText(signedIn.account!.name.trim()),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  fireEvent.click(action);
  expect(auth.methods.signIn).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Back to work' }),
  ).not.toHaveAttribute('aria-disabled', 'true');
  await act(async () =>
    resolve({ state: signedOut, remoteRevocation: 'unconfirmed' }),
  );
  expect(screen.getAllByRole('status')[0]).toHaveTextContent(
    'could not be confirmed',
  );
  expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus();
});

it('shows missing usage without inventing a quota, then renders the supplied remaining amount', async () => {
  const auth = bridge({ ...signedIn, quota: null });
  render(
    <SettingsPanel
      accountBridge={auth.methods}
      appearance={appearance}
      onClose={vi.fn()}
    />,
  );
  expect(
    await screen.findByText('Usage is unavailable. Refresh to try again.'),
  ).toBeVisible();
  act(() =>
    auth.emit({
      ...signedIn,
      quota: { ...signedIn.quota!, remainingMicrousd: 0 },
    }),
  );
  expect(screen.getByText('$0.00')).toBeVisible();
  expect(screen.getByText(/No AI allowance remaining/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Back to work' })).toBeVisible();
});

it('shows checking without asserting signed-out or offering a session action before mount refresh (Fable P3)', async () => {
  const auth = bridge();
  let resolve!: (state: DesktopAccountState) => void;
  auth.methods.accountStatus.mockReturnValue(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  render(
    <SettingsPanel
      accountBridge={auth.methods}
      appearance={appearance}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText('Checking your account…')).toBeVisible();
  expect(screen.queryByText('You’re signed out')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /sign in|sign out|cancel sign-in/i }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Back to work' })).toBeVisible();
  await act(async () => resolve(signedIn));
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
  expect(
    screen.queryByText('Sign in to use AI guidance.'),
  ).not.toBeInTheDocument();
  const time = document.querySelector('time')!;
  const date = new Date(time.dateTime);
  const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')!.value;
  expect(time).toHaveTextContent(zone);
  expect(time).toHaveTextContent(String(date.getFullYear()));
});

it('announces a pending cancel, accepts a completed sign-in and offers sign-out', async () => {
  const auth = bridge();
  let resolve!: (state: DesktopAccountState) => void;
  auth.methods.cancelSignIn.mockReturnValue(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  render(
    <SettingsPanel
      accountBridge={auth.methods}
      appearance={appearance}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
  const cancel = await screen.findByRole('button', { name: 'Cancel sign-in' });
  cancel.focus();
  fireEvent.click(cancel);
  expect(screen.getAllByRole('status')[0]).toHaveTextContent(
    'Cancelling sign-in…',
  );
  expect(screen.queryByText('You’re signed out')).not.toBeInTheDocument();
  act(() => auth.emit(signedIn));
  expect(
    screen.queryByRole('button', { name: 'Sign out' }),
  ).not.toBeInTheDocument();
  await act(async () => resolve(signedIn));
  const signOut = screen.getByRole('button', { name: 'Sign out' });
  expect(signOut).toHaveFocus();
  expect(screen.getAllByRole('status')[0]).toHaveTextContent(
    'Sign-in finished before it could be cancelled. You can sign out below.',
  );
  fireEvent.click(signOut);
  await act(async () => {});
  expect(auth.methods.signOut).toHaveBeenCalledTimes(1);
});

it('does not claim sign-out succeeded when the bridge rejects', async () => {
  const auth = bridge(signedIn);
  auth.methods.signOut.mockRejectedValue(new Error('PRIVATE'));
  render(
    <SettingsPanel
      accountBridge={auth.methods}
      appearance={appearance}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(screen.getAllByRole('status')[0]).toHaveTextContent('Signing out…');
  expect(screen.queryByText('You’re signed out')).not.toBeInTheDocument();
  expect(
    await screen.findByText(
      'Sign-out could not be confirmed. Retry connection to check your account.',
    ),
  ).toBeVisible();
  expect(screen.queryByText(/signed out/i)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry connection' }),
  ).toBeVisible();
});

it('retries a failed subscription through the visible retry control', async () => {
  const auth = bridge(signedIn);
  auth.methods.onAccountState.mockImplementationOnce(() => {
    throw new Error('synthetic');
  });
  render(
    <SettingsPanel
      accountBridge={auth.methods}
      appearance={appearance}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
  expect(await screen.findByRole('button', { name: 'Sign out' })).toBeVisible();
  expect(auth.methods.onAccountState).toHaveBeenCalledTimes(2);
  act(() =>
    auth.emit({
      ...signedOut,
      session: 'expired',
      message: 'Your session has expired.',
    }),
  );
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(screen.getByText('Sign in to use AI guidance.')).toBeVisible();
});
