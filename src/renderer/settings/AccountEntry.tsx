import type { ReactElement } from 'react';
import type { DesktopAccountState } from '../../contracts/desktop-auth';
import { accountInitials } from './format-account';
import './settings.css';

export interface AccountEntryProps {
  readonly state: DesktopAccountState;
  readonly onOpenSettings: () => void;
}

export function AccountEntry({
  state,
  onOpenSettings,
}: AccountEntryProps): ReactElement {
  const name = state.session === 'signed-in' ? state.account?.name : null;
  return (
    <button
      type="button"
      className="settings-account-entry"
      onClick={onOpenSettings}
      aria-label={name ? `Settings for ${name}` : 'Account and settings'}
    >
      <span className="settings-initials" aria-hidden="true">
        {name ? accountInitials(name) : 'AR'}
      </span>
      <span className="settings-entry-text">
        <span className="settings-name">{name ?? 'Account'}</span>
        <span className="settings-muted">Settings</span>
      </span>
    </button>
  );
}
