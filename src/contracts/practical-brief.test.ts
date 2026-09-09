import { expect, it } from 'vitest';
import {
  adaptAcceptedCourseBrief,
  COURSE_PRACTICE_BRIEF_KIND,
  projectPracticeCheckpoints,
} from './practical-brief';
import { syntheticAcceptedCourseBrief } from './practical-brief.fixture';
import type { PracticalActivity } from './practical-work';

const activity: PracticalActivity = {
  projectId: '11111111-1111-4111-8111-111111111111',
  origin: {
    path: {
      pathId: '22222222-2222-4222-8222-222222222222',
      pathRevision: 1,
      topicId: '33333333-3333-4333-8333-333333333333',
      lessonId: '44444444-4444-4444-8444-444444444444',
    },
  },
  title: 'Compare one change',
  objective: 'Explain the new output.',
  instructions: 'Change one input.',
};

it('adapts a CoursePracticeActivityBinding and refuses extras, lesson prose, or forged mapping', () => {
  const snapshot = syntheticAcceptedCourseBrief(activity);
  const adapted = adaptAcceptedCourseBrief(snapshot);
  expect(adapted?.briefRevision).toBe(1);
  expect(adapted?.brief.kind).toBe(COURSE_PRACTICE_BRIEF_KIND);
  expect(adapted?.brief.masteryEstablished).toBe(false);
  expect(adapted?.provenance.producer).toBe('ar-52');
  expect(projectPracticeCheckpoints(adapted!.brief)[0]).toMatchObject({
    id: 'checkpoint:0',
    title: 'Produce the output',
  });
  expect(adaptAcceptedCourseBrief({ ...snapshot, extra: true })).toBeNull();
  expect(
    adaptAcceptedCourseBrief({
      activity,
      binding: snapshot.binding,
      capstone: snapshot.capstone,
      brief: 'Change one input and write a report.',
    }),
  ).toBeNull();
  expect(
    adaptAcceptedCourseBrief({
      ...snapshot,
      binding: {
        ...snapshot.binding,
        brief: {
          ...snapshot.binding.brief,
          author: 'human',
        },
      },
    }),
  ).toBeNull();
  expect(
    adaptAcceptedCourseBrief({
      ...snapshot,
      binding: {
        ...snapshot.binding,
        brief: {
          ...snapshot.binding.brief,
          masteryEstablished: true,
        },
      },
    }),
  ).toBeNull();
  expect(
    adaptAcceptedCourseBrief({
      ...snapshot,
      binding: {
        mapping: {
          ...snapshot.binding.mapping,
          localLessonId: '55555555-5555-4555-8555-555555555555',
        },
        brief: snapshot.binding.brief,
      },
    }),
  ).toBeNull();
  expect(
    adaptAcceptedCourseBrief({
      activity,
      binding: {
        mapping: snapshot.binding.mapping,
        brief: 'Produce the output.',
      },
      capstone: null,
    }),
  ).toBeNull();
});
