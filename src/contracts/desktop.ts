import type { PracticalWorkspaceBridge } from './practical-records';
import type { SourceDesktopBridge } from './source-desktop';
import type {
  EntryDraft,
  EntryPosition,
  Project,
  ProviderStatus,
  ToolBounds,
  ToolState,
  TutorRequest,
} from './workspace';
import type { LearningRecordsBridge } from './learning-records';
import type { DesktopAccountState, DesktopSignOutResult } from './desktop-auth';

export interface DesktopInfo {
  readonly platform: string;
  readonly electronVersion: string;
}
export interface DesktopBridge {
  readonly info: DesktopInfo;
  accountStatus(): Promise<DesktopAccountState>;
  signIn(): Promise<DesktopAccountState>;
  cancelSignIn(): Promise<DesktopAccountState>;
  signOut(): Promise<DesktopSignOutResult>;
  onAccountState(listener: (state: DesktopAccountState) => void): () => void;
  listProjects(): Promise<Project[]>;
  createProject(goal: string): Promise<Project>;
  saveEntry(draft: EntryDraft): Promise<Project>;
  moveEntry(position: EntryPosition): Promise<void>;
  addExperiment(projectId: string): Promise<Project>;
  askTutor(request: TutorRequest): Promise<Project>;
  stopTutor(): Promise<void>;
  providerStatus(): Promise<ProviderStatus>;
  importProviderKey(): Promise<ProviderStatus>;
  setModel(model: string): Promise<ProviderStatus>;
  openTool(url: string): Promise<void>;
  resizeTool(bounds: ToolBounds): Promise<void>;
  closeTool(): Promise<void>;
  openExternal(url: string): Promise<void>;
  onToolState(listener: (state: ToolState) => void): () => void;
}

declare global {
  interface Window {
    readonly desktop: DesktopBridge &
      LearningRecordsBridge &
      PracticalWorkspaceBridge &
      SourceDesktopBridge;
  }
}
