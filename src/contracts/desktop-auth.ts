import type { MonthlyQuota, PublicAccount } from './learning-api';

export const DESKTOP_AUTH_API_ORIGIN =
  'https://api-production-e7aa.up.railway.app';
export const DESKTOP_AUTH_SCHEME = 'com.aaryandas.appliedresearch';
export const DESKTOP_AUTH_CALLBACK = `${DESKTOP_AUTH_SCHEME}://auth/callback`;

export type DesktopSessionStatus =
  'signed-out' | 'signing-in' | 'signed-in' | 'expired' | 'unavailable';

export interface DesktopAccountState {
  readonly session: DesktopSessionStatus;
  readonly account: PublicAccount | null;
  readonly quota: MonthlyQuota | null;
  readonly message: string | null;
}

export interface DesktopSignOutResult {
  readonly state: DesktopAccountState;
  readonly remoteRevocation: 'confirmed' | 'unconfirmed';
}

export const AUTH_CHANNELS = {
  accountStatus: 'auth:account-status',
  signIn: 'auth:sign-in',
  cancelSignIn: 'auth:cancel-sign-in',
  signOut: 'auth:sign-out',
  accountState: 'auth:account-state',
} as const;
