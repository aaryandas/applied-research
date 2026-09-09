import { randomUUID } from 'node:crypto';
import type { PracticalActivity } from './practical-work';
import {
  COURSE_PRACTICE_BRIEF_KIND,
  type AcceptedCourseBriefSnapshot,
} from './practical-brief';

/**
 * Synthetic CoursePracticeActivityBinding snapshot for tests and e2e only.
 * Not a live or reviewed AR-52 producer result.
 */
export function syntheticAcceptedCourseBrief(
  activity: PracticalActivity,
  proposalRevision = 1,
): AcceptedCourseBriefSnapshot {
  const remoteStepId = randomUUID();
  return {
    activity,
    binding: {
      mapping: {
        projectId: activity.projectId,
        pathId: activity.origin.path.pathId,
        acceptedProposalId: randomUUID(),
        acceptedProposalRevision: proposalRevision,
        remoteStepId,
        localTopicId: activity.origin.path.topicId,
        localLessonId: activity.origin.path.lessonId,
      },
      brief: {
        kind: COURSE_PRACTICE_BRIEF_KIND,
        author: 'ai',
        masteryEstablished: false,
        intendedOutcome: 'Return a usable output from one changed input.',
        setup: 'Prepare one input pair in your own notebook.',
        tool: {
          kind: 'learner-external',
          toolName: 'Own notebook',
          intendedUse: 'Work outside the app. It will not auto-launch.',
        },
        instructions: 'Change one input and keep the output file.',
        observableCheckpoints: ['Produce the output'],
        expectedArtifact: 'A retained output file from the trial.',
        reflectionPrompt: 'What would you change next?',
        sourceIds: ['sourceid01'],
      },
    },
    capstone: {
      stepId: remoteStepId,
      outcome:
        'One end-to-end trial artifact that can be reopened and compared.',
      substantial: true,
    },
  };
}
