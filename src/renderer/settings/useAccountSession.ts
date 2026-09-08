import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  createAccountSession,
  type AccountSession,
  type AccountSnapshot,
} from './account-session';
import type { SettingsAccountBridge } from './types';

export type AccountSessionView = AccountSnapshot &
  Pick<AccountSession, 'refresh' | 'signIn' | 'cancel' | 'signOut'>;

export function useAccountSession(
  bridge: SettingsAccountBridge,
): AccountSessionView {
  const session = useMemo(() => createAccountSession(bridge), [bridge]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => session.connect(), [session]);
  return {
    ...snapshot,
    refresh: session.refresh,
    signIn: session.signIn,
    cancel: session.cancel,
    signOut: session.signOut,
  };
}
