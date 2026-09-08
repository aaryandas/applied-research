export type HumanEntryKind = 'note' | 'insight' | 'result' | 'source';
export type EntryKind = HumanEntryKind | 'assistant' | 'experiment';
export interface Citation {
  title: string;
  url: string;
  start: number;
  end: number;
}
export interface Entry {
  id: string;
  kind: EntryKind;
  title: string;
  body: string;
  url: string;
  citations: Citation[];
  x: number;
  y: number;
  createdAt: string;
}
export interface Project {
  id: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  entries: Entry[];
}
export interface EntryDraft {
  projectId: string;
  id?: string;
  kind: HumanEntryKind;
  title: string;
  body: string;
  url: string;
}
export interface EntryPosition {
  projectId: string;
  id: string;
  x: number;
  y: number;
}
export interface TutorRequest {
  projectId: string;
  prompt: string;
  includePage: boolean;
}
export interface ProviderStatus {
  connected: boolean;
  model: string;
}
export interface ToolState {
  url: string;
  title: string;
  loading: boolean;
  error: string;
}
export interface ToolBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PageContext {
  url: string;
  title: string;
  text: string;
}
export const CHANNELS = {
  list: 'workspace:list',
  create: 'workspace:create',
  saveEntry: 'workspace:save-entry',
  moveEntry: 'workspace:move-entry',
  experiment: 'workspace:add-experiment',
  ask: 'tutor:ask',
  stop: 'tutor:stop',
  provider: 'provider:status',
  connect: 'provider:import-key',
  model: 'provider:set-model',
  openTool: 'tool:open',
  resizeTool: 'tool:resize',
  closeTool: 'tool:close',
  external: 'tool:external',
  toolState: 'tool:state',
} as const;
