import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../contracts/desktop';
import {
  LEARNING_CHANNELS,
  type LearningRecordsBridge,
} from '../contracts/learning-records';
import { CHANNELS, type ToolState } from '../contracts/workspace';

const desktop: DesktopBridge & LearningRecordsBridge = {
  info: {
    platform: process.platform,
    electronVersion: process.versions.electron,
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
