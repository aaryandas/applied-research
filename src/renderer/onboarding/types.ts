import type {
  ContinueLearningCard,
  LearnerProfileView,
  LearningOnboardingBridge,
  LearningOnboardingResumeBridge,
  RevisionWrite,
  InterviewRecord,
} from '../../contracts/learning-onboarding';

export type { ContinueLearningCard };

export type ProfileView = LearnerProfileView;

export type OpeningOnboardingBridge = LearningOnboardingBridge &
  Partial<LearningOnboardingResumeBridge>;

export const LOCAL_PROMPT_IDS = {
  background: 'background-01',
  intended: 'intended-use-01',
  prior: 'prior-know-01',
  diagnostic: 'diagnostic-01',
} as const;

export type { InterviewRecord, RevisionWrite };
