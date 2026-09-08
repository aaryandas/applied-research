import { useEffect, useId, useRef, type ReactElement } from 'react';
import { AppearanceControl } from './AppearanceControl';
import {
  accountInitials,
  formatMicrousd,
  formatQuotaMonth,
} from './format-account';
import { useAccountSession } from './useAccountSession';
import type { SettingsAccountBridge, SettingsAppearanceControl } from './types';
import './settings.css';

export interface SettingsPanelProps {
  readonly accountBridge: SettingsAccountBridge;
  readonly appearance: SettingsAppearanceControl;
  /** The shell retains the workspace and restores focus to its Settings entry. */
  readonly onClose: () => void;
}
const statusLabels = {
  'signed-out': 'You’re signed out',
  'signing-in': 'Waiting for sign-in',
  'signed-in': 'Signed in',
  expired: 'Your session has expired',
  unavailable: 'Account unavailable',
};

export function SettingsPanel({
  accountBridge,
  appearance,
  onClose,
}: SettingsPanelProps): ReactElement {
  const session = useAccountSession(accountBridge);
  const heading = useId();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const accountHeading = useId();
  const usageHeading = useId();
  const appearanceHeading = useId();
  const { state, pending, receivedAt } = session;
  const isSignedIn = state.session === 'signed-in';
  const account = isSignedIn ? state.account : null;
  const quota = isSignedIn ? state.quota : null;
  const isSigningIn = state.session === 'signing-in';
  const mainAction = isSigningIn
    ? session.cancel
    : isSignedIn
      ? session.signOut
      : session.signIn;
  const actionLabel = isSigningIn
    ? 'Cancel sign-in'
    : isSignedIn
      ? 'Sign out'
      : 'Sign in';
  const actionDisabled = pending !== null && !isSigningIn;
  const feedback =
    state.message ?? (pending === 'refresh' ? 'Refreshing account…' : '');

  return (
    <section className="settings-panel" aria-labelledby={heading}>
      <header className="settings-header">
        <h1 id={heading} ref={title} tabIndex={-1}>
          Settings
        </h1>
        <button type="button" className="settings-button" onClick={onClose}>
          Back to work
        </button>
      </header>
      <section className="settings-section" aria-labelledby={accountHeading}>
        <h2 id={accountHeading}>Account</h2>
        <div className="settings-account-row">
          <div className="settings-identity">
            <span className="settings-initials" aria-hidden="true">
              {account ? accountInitials(account.name) : 'AR'}
            </span>
            <div className="settings-identity-text">
              {account && <p className="settings-name">{account.name}</p>}
              <p
                className={
                  account ? 'settings-muted' : 'settings-session-title'
                }
              >
                {statusLabels[state.session]}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="settings-button"
            aria-disabled={actionDisabled}
            onClick={() => {
              if (!actionDisabled) mainAction();
            }}
          >
            {actionLabel}
          </button>
        </div>
        <p className="settings-muted">
          Sign in to use AI guidance. Your saved work stays on this device when
          you sign out.
        </p>
        <div className="settings-status-row">
          <p
            className="settings-feedback"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {feedback}
          </p>
          {state.session === 'unavailable' && (
            <button
              type="button"
              className="settings-button"
              aria-disabled={pending !== null}
              onClick={session.refresh}
            >
              Retry connection
            </button>
          )}
        </div>
      </section>
      <section className="settings-section" aria-labelledby={usageHeading}>
        <div className="settings-section-heading">
          <h2 id={usageHeading}>Monthly usage</h2>
          {isSignedIn && (
            <button
              type="button"
              className="settings-button"
              aria-disabled={pending !== null}
              onClick={session.refresh}
            >
              Refresh usage
            </button>
          )}
        </div>
        {quota ? (
          <>
            <p className="settings-coordinate">
              {formatQuotaMonth(quota.month)}
            </p>
            <dl className="settings-usage">
              {(
                [
                  ['Used', quota.committedMicrousd],
                  ['In progress', quota.reservedMicrousd],
                  ['Remaining', quota.remainingMicrousd],
                  ['Monthly limit', quota.limitMicrousd],
                ] as const
              ).map(([label, amount]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{formatMicrousd(amount)}</dd>
                </div>
              ))}
            </dl>
            <p className="settings-muted">
              USD · As of last refresh
              {receivedAt && (
                <>
                  {' '}
                  at{' '}
                  <time dateTime={receivedAt.toISOString()}>
                    {receivedAt.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                </>
              )}
              . Refresh to check the latest usage.
            </p>
            {quota.remainingMicrousd === 0 && (
              <p className="settings-feedback">
                No AI allowance remaining this month. You can keep working with
                your saved material.
              </p>
            )}
          </>
        ) : (
          <p className="settings-muted">
            {isSignedIn
              ? 'Usage is unavailable. Refresh to try again.'
              : 'Usage appears when you’re signed in.'}
          </p>
        )}
      </section>
      <section
        className="settings-section settings-appearance-row"
        aria-labelledby={appearanceHeading}
      >
        <div>
          <h2 id={appearanceHeading}>Appearance</h2>
          <p className="settings-muted">
            Choose the palette for your workspace.
          </p>
        </div>
        <AppearanceControl {...appearance} />
      </section>
      <p className="settings-local-note">
        You can read and edit saved work without signing in. New AI guidance
        needs a connection.
      </p>
    </section>
  );
}
