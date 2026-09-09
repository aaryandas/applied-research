import type {
  InterviewRecord,
  LearningOnboardingBridge,
  LearnerProfile,
  OnboardingPersonalization,
  RevisionWrite,
} from '../../contracts/learning-onboarding';
import type { PathOrigin } from '../../contracts/learning-records';

export type ContinueLearningCard = {
  projectId: string;
  path: PathOrigin;
  sourceRevisionId: string | null;
  span: { start: number; end: number; quote: string } | null;
  lessonTitle: string;
  projectGoal: string;
};

export type ProfileView = {
  profile: LearnerProfile | null;
  assessment: OnboardingPersonalization | null;
};

/**
 * Named extra channels the coordinator registers beside LearningOnboardingBridge.
 * Renderer never treats these as source/content authority.
 */
export type OpeningOnboardingBridge = LearningOnboardingBridge & {
  getLearnerProfileView?(): Promise<ProfileView>;
  getContinueLearning?(): Promise<ContinueLearningCard | null>;
  saveReadingResume?(value: ContinueLearningCard): Promise<void>;
  savePastedSource?(input: {
    projectId: string;
    expectedRevision: number;
    pastedSourceText: string | null;
  }): Promise<RevisionWrite<InterviewRecord>>;
  getPastedSource?(input: { projectId: string }): Promise<string | null>;
};

export const LOCAL_PROMPT_IDS = {
  background: 'background-01',
  intended: 'intended-use-01',
  prior: 'prior-know-01',
  diagnostic: 'diagnostic-01',
} as const;
