import {
  SOURCE_CHANNELS,
  type SourceDesktopBridge,
} from '../contracts/source-desktop';
import { RECORD_PRACTICAL_RESULT_CHANNEL } from '../contracts/practical-work';
import {
  LOAD_PRACTICAL_ATTEMPT_CHANNEL,
  SELECT_PRACTICAL_FILE_CHANNEL,
  CANCEL_PRACTICAL_FILE_CHANNEL,
  LIST_PRACTICAL_ATTEMPTS_CHANNEL,
  PREVIEW_PRACTICAL_FILE_CHANNEL,
  EXPORT_PRACTICAL_FILE_CHANNEL,
  CANCEL_PRACTICAL_EXPORT_CHANNEL,
  LOAD_PRACTICAL_JOURNEY_CHANNEL,
  RECORD_PRACTICAL_PROGRESS_CHANNEL,
  RECORD_PRACTICAL_WORK_CHOICE_CHANNEL,
  SAVE_PRACTICAL_HUMAN_PLAN_CHANNEL,
  type PracticalWorkspaceBridge,
} from '../contracts/practical-records';
import { contextBridge, ipcRenderer } from 'electron';
import {
  desktopTestEnvironmentFromArgv,
  type DesktopBridge,
} from '../contracts/desktop';
import {
  AUTH_CHANNELS,
  type DesktopAccountState,
} from '../contracts/desktop-auth';
import {
  LEARNING_CHANNELS,
  type LearningRecordsBridge,
} from '../contracts/learning-records';
import { CHANNELS, type ToolState } from '../contracts/workspace';
import {
  LEARNING_ONBOARDING_CHANNELS,
  LEARNING_ONBOARDING_RESUME_CHANNELS,
  type LearningOnboardingBridge,
  type LearningOnboardingResumeBridge,
} from '../contracts/learning-onboarding';
import {
  CONTEXTUAL_HELP_CHANNELS,
  type ContextualHelpBridge,
} from '../contracts/contextual-help-desktop';
import {
  COMPANION_GUIDANCE_CANCEL_CHANNEL,
  COMPANION_GUIDANCE_REQUEST_CHANNEL,
  type CompanionGuidanceBridge,
} from '../contracts/companion-guidance';

const desktop: DesktopBridge &
  LearningRecordsBridge &
  PracticalWorkspaceBridge &
  SourceDesktopBridge &
  LearningOnboardingBridge &
  LearningOnboardingResumeBridge &
  ContextualHelpBridge &
  CompanionGuidanceBridge = {
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
  listPracticalAttempts: (input) =>
    ipcRenderer.invoke(LIST_PRACTICAL_ATTEMPTS_CHANNEL, input),
  previewPracticalFile: (input) =>
    ipcRenderer.invoke(PREVIEW_PRACTICAL_FILE_CHANNEL, input),
  exportPracticalFile: (input) =>
    ipcRenderer.invoke(EXPORT_PRACTICAL_FILE_CHANNEL, input),
  cancelPracticalExport: () =>
    ipcRenderer.invoke(CANCEL_PRACTICAL_EXPORT_CHANNEL),
  loadPracticalJourney: (input) =>
    ipcRenderer.invoke(LOAD_PRACTICAL_JOURNEY_CHANNEL, input),
  recordPracticalProgress: (input) =>
    ipcRenderer.invoke(RECORD_PRACTICAL_PROGRESS_CHANNEL, input),
  recordPracticalWorkChoice: (input) =>
    ipcRenderer.invoke(RECORD_PRACTICAL_WORK_CHOICE_CHANNEL, input),
  savePracticalHumanPlan: (input) =>
    ipcRenderer.invoke(SAVE_PRACTICAL_HUMAN_PLAN_CHANNEL, input),
  info: {
    platform: process.platform,
    electronVersion: process.versions.electron,
    testEnvironment: desktopTestEnvironmentFromArgv(process.argv),
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
  getLearnerProfile: () =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.getProfile),
  saveLearnerProfile: (input) =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.saveProfile, input),
  getLearningOnboarding: (input) =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.get, input),
  saveLearningInterview: (input) =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.saveInterview, input),
  requestInterviewPrompt: (input) =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.interviewPrompt, input),
  proposeCourse: (input) =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.propose, input),
  reviseCourse: (input) =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.revise, input),
  acceptCourse: (input) =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.accept, input),
  ensureLesson: (input) =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.ensureLesson, input),
  proposeAcceptedCourseAdjustment: (input) =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.adjust, input),
  acceptCourseAdjustment: (input) =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.acceptAdjustment, input),
  cancelLearningOnboarding: (input) =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.cancel, input),
  getContinueLearning: () =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_RESUME_CHANNELS.getContinueLearning),
  saveReadingResume: (input) =>
    ipcRenderer.invoke(
      LEARNING_ONBOARDING_RESUME_CHANNELS.saveReadingResume,
      input,
    ),
  getLearnerProfileView: () =>
    ipcRenderer.invoke(LEARNING_ONBOARDING_RESUME_CHANNELS.getProfileView),
  getPastedSource: (input) =>
    ipcRenderer.invoke(
      LEARNING_ONBOARDING_RESUME_CHANNELS.getPastedSource,
      input,
    ),
  savePastedSource: (input) =>
    ipcRenderer.invoke(
      LEARNING_ONBOARDING_RESUME_CHANNELS.savePastedSource,
      input,
    ),
  requestContextualHelp: (input) =>
    ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.request, input),
  cancelContextualHelp: (input) =>
    ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.cancel, input),
  loadRetainedExplanation: (input) =>
    ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.load, input),
  listRetainedExplanations: (input) =>
    ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.list, input),
  saveExplanationSceneState: (input) =>
    ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.saveScene, input),
  loadExplanationSceneState: (input) =>
    ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.loadScene, input),
  acceptSceneCapture: (input) =>
    ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.capture, input),
  loadTrustedSceneCapture: (input) =>
    ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.loadCapture, input),
  openRetainedClipMedia: (input) =>
    ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.openClip, input),
  placeRetainedExplanation: (input) =>
    ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.place, input),
  listExplanationPlacements: (input) =>
    ipcRenderer.invoke(CONTEXTUAL_HELP_CHANNELS.listPlacements, input),
  requestCompanionGuidance: (input) =>
    ipcRenderer.invoke(COMPANION_GUIDANCE_REQUEST_CHANNEL, input),
  cancelCompanionGuidance: (input) => {
    void ipcRenderer.invoke(COMPANION_GUIDANCE_CANCEL_CHANNEL, input);
  },
};
contextBridge.exposeInMainWorld('desktop', desktop);
