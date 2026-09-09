import {
  SOURCE_CHANNELS,
  type SourceDesktopBridge,
} from '../contracts/source-desktop';
import { RECORD_PRACTICAL_RESULT_CHANNEL } from '../contracts/practical-work';
import {
  LOAD_PRACTICAL_ATTEMPT_CHANNEL,
  SELECT_PRACTICAL_FILE_CHANNEL,
  CANCEL_PRACTICAL_FILE_CHANNEL,
  type PracticalWorkspaceBridge,
} from '../contracts/practical-records';
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../contracts/desktop';
import {
  AUTH_CHANNELS,
  type DesktopAccountState,
} from '../contracts/desktop-auth';
import {
  LEARNING_CHANNELS,
  type LearningRecordsBridge,
} from '../contracts/learning-records';
import { CHANNELS, type ToolState } from '../contracts/workspace';

const desktop: DesktopBridge &
  LearningRecordsBridge &
  PracticalWorkspaceBridge &
  SourceDesktopBridge = {
  generateSourcedLearning: (input) =>
    ipcRenderer.invoke(SOURCE_CHANNELS.generate, input),
  activateSourceWorkspace: (projectId) =>
    ipcRenderer.invoke(SOURCE_CHANNELS.activate, projectId),
  discoverSources: (input) =>
    ipcRenderer.invoke(SOURCE_CHANNELS.discover, input),
  acquireAndSaveSource: (input) =>
    ipcRenderer.invoke(SOURCE_CHANNELS.acquire, input),
  cancelSourceOperation: (input) =>
    ipcRenderer.invoke(SOURCE_CHANNELS.cancel, input),
  openSourceOriginal: (input) =>
    ipcRenderer.invoke(SOURCE_CHANNELS.original, input),
  recordPracticalResult: (input) =>
    ipcRenderer.invoke(RECORD_PRACTICAL_RESULT_CHANNEL, input),
  loadPracticalAttempt: (input) =>
    ipcRenderer.invoke(LOAD_PRACTICAL_ATTEMPT_CHANNEL, input),
  selectPracticalFile: (input) =>
    ipcRenderer.invoke(SELECT_PRACTICAL_FILE_CHANNEL, input),
  cancelPracticalFileSelection: () =>
    ipcRenderer.invoke(CANCEL_PRACTICAL_FILE_CHANNEL),
  info: {
    platform: process.platform,
    electronVersion: process.versions.electron,
  },
  accountStatus: () => ipcRenderer.invoke(AUTH_CHANNELS.accountStatus),
  signIn: () => ipcRenderer.invoke(AUTH_CHANNELS.signIn),
  cancelSignIn: () => ipcRenderer.invoke(AUTH_CHANNELS.cancelSignIn),
  signOut: () => ipcRenderer.invoke(AUTH_CHANNELS.signOut),
  onAccountState: (listener) => {
    const receive = (
      _event: Electron.IpcRendererEvent,
      state: DesktopAccountState,
    ): void => listener(state);
    ipcRenderer.on(AUTH_CHANNELS.accountState, receive);
    return () =>
      ipcRenderer.removeListener(AUTH_CHANNELS.accountState, receive);
  },
  listProjects: () => ipcRenderer.invoke(CHANNELS.list),
  createProject: (goal) => ipcRenderer.invoke(CHANNELS.create, goal),
  saveEntry: (draft) => ipcRenderer.invoke(CHANNELS.saveEntry, draft),
  moveEntry: (position) => ipcRenderer.invoke(CHANNELS.moveEntry, position),
  getLearningWorkspace: (projectId) =>
    ipcRenderer.invoke(LEARNING_CHANNELS.getWorkspace, projectId),
  importTextSource: (input) =>
    ipcRenderer.invoke(LEARNING_CHANNELS.importTextSource, input),
  saveHighlight: (input) =>
    ipcRenderer.invoke(LEARNING_CHANNELS.saveHighlight, input),
  saveReadingNote: (input) =>
    ipcRenderer.invoke(LEARNING_CHANNELS.saveReadingNote, input),
  saveQuestion: (input) =>
    ipcRenderer.invoke(LEARNING_CHANNELS.saveQuestion, input),
  saveInsight: (input) =>
    ipcRenderer.invoke(LEARNING_CHANNELS.saveInsight, input),
  savePathRevision: (input) =>
    ipcRenderer.invoke(LEARNING_CHANNELS.savePathRevision, input),
  moveLearningRecord: (input) =>
    ipcRenderer.invoke(LEARNING_CHANNELS.moveRecord, input),
  addExperiment: (projectId) =>
    ipcRenderer.invoke(CHANNELS.experiment, projectId),
  askTutor: (request) => ipcRenderer.invoke(CHANNELS.ask, request),
  stopTutor: () => ipcRenderer.invoke(CHANNELS.stop),
  providerStatus: () => ipcRenderer.invoke(CHANNELS.provider),
  importProviderKey: () => ipcRenderer.invoke(CHANNELS.connect),
  setModel: (model) => ipcRenderer.invoke(CHANNELS.model, model),
  openTool: (url) => ipcRenderer.invoke(CHANNELS.openTool, url),
  resizeTool: (bounds) => ipcRenderer.invoke(CHANNELS.resizeTool, bounds),
  closeTool: () => ipcRenderer.invoke(CHANNELS.closeTool),
  openExternal: (url) => ipcRenderer.invoke(CHANNELS.external, url),
  onToolState: (listener) => {
    const receive = (
      _event: Electron.IpcRendererEvent,
      state: ToolState,
    ): void => listener(state);
    ipcRenderer.on(CHANNELS.toolState, receive);
    return () => ipcRenderer.removeListener(CHANNELS.toolState, receive);
  },
};
contextBridge.exposeInMainWorld('desktop', desktop);
