import type {
  DesktopAccountState,
  DesktopSignOutResult,
} from '../../contracts/desktop-auth';

/** The reviewed account boundary; deliberately excludes the rest of DesktopBridge. */
export interface SettingsAccountBridge {
  accountStatus(): Promise<DesktopAccountState>;
  signIn(): Promise<DesktopAccountState>;
  cancelSignIn(): Promise<DesktopAccountState>;
  signOut(): Promise<DesktopSignOutResult>;
  onAccountState(listener: (state: DesktopAccountState) => void): () => void;
}

export type SettingsAppearance = 'light' | 'dark';

export interface SettingsAppearanceControl {
  readonly value: SettingsAppearance;
  /** Resolve only after applying the choice; persistence belongs to the shell. */
  readonly onChange: (appearance: SettingsAppearance) => Promise<void>;
}
