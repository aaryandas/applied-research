import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../contracts/desktop';
import {
  AUTH_CHANNELS,
  type DesktopAccountState,
} from '../contracts/desktop-auth';
import { CHANNELS, type ToolState } from '../contracts/workspace';

const desktop: DesktopBridge = {
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
