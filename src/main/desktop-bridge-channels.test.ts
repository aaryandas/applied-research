import { describe, expect, it } from 'vitest';
import {
  CONTEXTUAL_HELP_BRIDGE_CHANNELS,
  ONBOARDING_BRIDGE_CHANNELS,
  SHARED_DESKTOP_OPERATION_CHANNELS,
} from './desktop-bridge-channels';
import {
  LEARNING_ONBOARDING_CHANNELS,
  LEARNING_ONBOARDING_RESUME_CHANNELS,
} from '../contracts/learning-onboarding';
import { CONTEXTUAL_HELP_CHANNELS } from '../contracts/contextual-help-desktop';
import {
  COMPANION_GUIDANCE_CANCEL_CHANNEL,
  COMPANION_GUIDANCE_REQUEST_CHANNEL,
} from '../contracts/companion-guidance';

describe('named desktop bridge mapping', () => {
  it('binds all ten onboarding operations and five resume channels', () => {
    expect(ONBOARDING_BRIDGE_CHANNELS).toEqual({
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
      getContinueLearning:
        LEARNING_ONBOARDING_RESUME_CHANNELS.getContinueLearning,
      saveReadingResume: LEARNING_ONBOARDING_RESUME_CHANNELS.saveReadingResume,
      getLearnerProfileView: LEARNING_ONBOARDING_RESUME_CHANNELS.getProfileView,
      getPastedSource: LEARNING_ONBOARDING_RESUME_CHANNELS.getPastedSource,
      savePastedSource: LEARNING_ONBOARDING_RESUME_CHANNELS.savePastedSource,
    });
  });

  it('binds the eleven contextual help operations including clip media and placements', () => {
    expect(CONTEXTUAL_HELP_BRIDGE_CHANNELS).toEqual({
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
    });
    expect(SHARED_DESKTOP_OPERATION_CHANNELS).toHaveLength(28);
    expect(SHARED_DESKTOP_OPERATION_CHANNELS).toEqual(
      expect.arrayContaining([
        COMPANION_GUIDANCE_REQUEST_CHANNEL,
        COMPANION_GUIDANCE_CANCEL_CHANNEL,
      ]),
    );
  });
});
