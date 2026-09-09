import {
  LEARNING_ONBOARDING_CHANNELS,
  LEARNING_ONBOARDING_RESUME_CHANNELS,
} from '../contracts/learning-onboarding';
import { CONTEXTUAL_HELP_CHANNELS } from '../contracts/contextual-help-desktop';

export const ONBOARDING_BRIDGE_CHANNELS = {
  getLearnerProfile: LEARNING_ONBOARDING_CHANNELS.getProfile,
  saveLearnerProfile: LEARNING_ONBOARDING_CHANNELS.saveProfile,
  getLearningOnboarding: LEARNING_ONBOARDING_CHANNELS.get,
  saveLearningInterview: LEARNING_ONBOARDING_CHANNELS.saveInterview,
  requestInterviewPrompt: LEARNING_ONBOARDING_CHANNELS.interviewPrompt,
  proposeCourse: LEARNING_ONBOARDING_CHANNELS.propose,
  reviseCourse: LEARNING_ONBOARDING_CHANNELS.revise,
  acceptCourse: LEARNING_ONBOARDING_CHANNELS.accept,
  ensureLesson: LEARNING_ONBOARDING_CHANNELS.ensureLesson,
  cancelLearningOnboarding: LEARNING_ONBOARDING_CHANNELS.cancel,
  getContinueLearning: LEARNING_ONBOARDING_RESUME_CHANNELS.getContinueLearning,
  saveReadingResume: LEARNING_ONBOARDING_RESUME_CHANNELS.saveReadingResume,
  getLearnerProfileView: LEARNING_ONBOARDING_RESUME_CHANNELS.getProfileView,
  getPastedSource: LEARNING_ONBOARDING_RESUME_CHANNELS.getPastedSource,
  savePastedSource: LEARNING_ONBOARDING_RESUME_CHANNELS.savePastedSource,
} as const;

export const CONTEXTUAL_HELP_BRIDGE_CHANNELS = {
  requestContextualHelp: CONTEXTUAL_HELP_CHANNELS.request,
  cancelContextualHelp: CONTEXTUAL_HELP_CHANNELS.cancel,
  loadRetainedExplanation: CONTEXTUAL_HELP_CHANNELS.load,
  listRetainedExplanations: CONTEXTUAL_HELP_CHANNELS.list,
  saveExplanationSceneState: CONTEXTUAL_HELP_CHANNELS.saveScene,
  loadExplanationSceneState: CONTEXTUAL_HELP_CHANNELS.loadScene,
  acceptSceneCapture: CONTEXTUAL_HELP_CHANNELS.capture,
  loadTrustedSceneCapture: CONTEXTUAL_HELP_CHANNELS.loadCapture,
  openRetainedClipMedia: CONTEXTUAL_HELP_CHANNELS.openClip,
  placeRetainedExplanation: CONTEXTUAL_HELP_CHANNELS.place,
  listExplanationPlacements: CONTEXTUAL_HELP_CHANNELS.listPlacements,
} as const;

export const SHARED_DESKTOP_OPERATION_CHANNELS = [
  ...Object.values(ONBOARDING_BRIDGE_CHANNELS),
  ...Object.values(CONTEXTUAL_HELP_BRIDGE_CHANNELS),
] as const;
