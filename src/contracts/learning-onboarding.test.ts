import { describe, expect, it } from 'vitest';
import { LEARNING_API_VERSION } from './learning-api.js';
import {
  COMPATIBLE_SOURCED_LEARNING_SCOPE,
  LEARNING_ONBOARDING_API_VERSION,
  LEARNING_ONBOARDING_LIMITS,
  LEARNING_ONBOARDING_OPERATIONS,
  LEARNING_ONBOARDING_PATH,
  LEARNING_ONBOARDING_PUBLIC_MESSAGES,
  LEARNING_ONBOARDING_SCOPES,
  ONBOARDING_CONTEXT_TRUST,
} from './learning-onboarding-api.js';
import type {
  AcceptedCourseAdjustmentSuccess,
  LearningOnboardingRequest,
  LearningOnboardingResponse,
  ProposalSource,
  UntrustedHumanLearnerContext,
} from './learning-onboarding-api.js';
import type { AiProvenance } from './learning-api.js';
import type { AcquiredSource } from './sourcing.js';
import { SOURCE_CHANNELS } from './source-desktop.js';
import * as desktopOnboarding from './learning-onboarding.js';
import {
  LearningOnboardingValidationError,
  createLearningOnboardingValidation,
  decodeBoundedJsonWire,
} from './learning-onboarding-validation.js';

const HELLO = 'hello';
const HELLO_HASH =
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const LESSON_TEXT =
  'Transformers map tokens to contextual representations.\n\nAttention mixes values using learned queries and keys.';
const LESSON_HASH =
  'bc2e2a742e069db0fb2038bd200ef206072c90517716a8b85663a3b6f4544caa';
const HASHES: Record<string, string> = {
  [HELLO]: HELLO_HASH,
  [LESSON_TEXT]: LESSON_HASH,
};

function sha256Text(value: string): string {
  if (HASHES[value] !== undefined) return HASHES[value];
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return hex.repeat(8).slice(0, 64);
}

const validation = createLearningOnboardingValidation(sha256Text);
const projectId = 'a1234567-1234-4234-8234-123456789012';
const requestId = 'request-01';
const at = '2026-09-09T12:00:00.000Z';

function expectRejected(value: unknown, parse: (input: unknown) => unknown) {
  expect(() => parse(value)).toThrow(LearningOnboardingValidationError);
}

const acquiredSource = {
  sourceId: 'openalex_W1',
  title: 'Synthetic paper',
  kind: 'paper' as const,
  authorship: { kind: 'authored' as const, creators: ['Test author'] },
  providerIds: [{ provider: 'openalex' as const, id: 'W1' as const }],
  scholarlyIdentity: { doi: null, arxivId: null },
  originalLocation: {
    url: 'https://example.org/paper',
    trust: 'untrusted-public-url' as const,
  },
  acquisitionLocation: {
    url: 'https://example.org/paper.pdf',
    trust: 'untrusted-public-url' as const,
  },
  publicationDate: null,
  discoveredAt: '2026-09-08T12:00:00.000Z',
  metadataSummary: null,
  relationships: [],
  usePolicy: {
    access: 'public' as const,
    accessEvidenceUrl: 'https://example.org/paper',
    license: {
      status: 'known' as const,
      name: 'CC0',
      spdxId: 'CC0-1.0',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    acquisition: {
      status: 'permitted' as const,
      basis: 'license' as const,
      evidenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    indexing: {
      status: 'unknown' as const,
      reason: 'Not reviewed for indexing.',
    },
  },
  content: {
    state: 'acquired' as const,
    revision: {
      sourceId: 'openalex_W1',
      revisionId: 'edition-1',
      title: 'Synthetic paper',
      canonicalText: HELLO,
      sha256: HELLO_HASH,
      format: 'pdf' as const,
      canonicalizationVersion: 'pdf-text-v1',
      acquiredAt: '2026-09-08T12:01:00.000Z',
      provenance: {
        kind: 'discovered' as const,
        acquiredFromUrl: 'https://example.org/paper.pdf',
        providerIdentity: { provider: 'openalex' as const, id: 'W1' as const },
        discoveredAt: '2026-09-08T12:00:00.000Z',
      },
      extraction: {
        method: 'pdf-text',
        coverage: 'partial' as const,
        note: 'One readable page.',
      },
    },
  },
} satisfies AcquiredSource;

const bibliographySource = {
  sourceId: 'openalex_W1',
  kind: 'paper' as const,
  title: 'Synthetic paper',
  originalLocation: {
    url: 'https://example.org/paper',
    trust: 'untrusted-public-url' as const,
  },
  providerIds: [{ provider: 'openalex' as const, id: 'W1' as const }],
  scholarlyIdentity: { doi: null, arxivId: null },
  access: 'public' as const,
  edition: {
    sourceId: 'openalex_W1',
    revisionId: 'edition-1',
    title: 'Synthetic paper',
    sha256: HELLO_HASH,
    format: 'pdf' as const,
    canonicalizationVersion: 'pdf-text-v1',
    acquiredAt: '2026-09-08T12:01:00.000Z',
    provenance: {
      kind: 'discovered' as const,
      locator: 'https://example.org/paper.pdf',
    },
  },
  coverage: 'partial' as const,
  lessonStepIds: ['step-001'],
} satisfies ProposalSource;

const quota = {
  month: '2026-09',
  limitMicrousd: 20_000_000,
  committedMicrousd: 0,
  reservedMicrousd: 1_000,
  remainingMicrousd: 19_999_000,
};

const provenance = {
  author: 'ai' as const,
  provider: 'openrouter' as const,
  providerRequestId: 'provider-01',
  model: 'google/gemini-3.8-flash' as const,
  requestVersion: '2026-09-08' as const,
  promptVersion: 'learning-v2-2026-09-09',
  createdAt: at,
  sourceRevisions: [
    {
      sourceId: 'openalex_W1',
      revisionId: 'edition-1',
      title: 'Synthetic paper',
      sha256: HELLO_HASH,
      format: 'pdf' as const,
      canonicalizationVersion: 'pdf-text-v1',
      acquiredAt: '2026-09-08T12:01:00.000Z',
      provenance: {
        kind: 'discovered' as const,
        locator: 'https://example.org/paper.pdf',
      },
    },
  ],
} satisfies AiProvenance;

const human = {
  trust: ONBOARDING_CONTEXT_TRUST.human,
  goal: 'Learn transformers from original sources.',
  focus: 'Attention and implementation.',
  depth: 'balanced' as const,
  profileRevision: 1,
  interviewRevision: 1,
  profile: {
    background: 'I have written Python services.',
    learningGoals: 'Implement attention, then LoRA.',
    priorKnowledge: 'I can train a small classifier.',
  },
  answers: [
    {
      trust: ONBOARDING_CONTEXT_TRUST.human,
      promptId: 'prompt-01',
      answer: 'Attention weights queries against keys to mix values.',
    },
  ],
  seedRevisionLocators: [{ sourceId: 'openalex_W1', revisionId: 'edition-1' }],
  unacquiredSeedUrls: [],
  pastedSeedText: null,
} satisfies UntrustedHumanLearnerContext;

const tokenizerBrief = {
  kind: 'source-supported-practice-brief' as const,
  author: 'ai' as const,
  masteryEstablished: false as const,
  intendedOutcome: 'Produce a working tokenizer on a short corpus.',
  setup: 'Python 3, a small text file, and the paper vocabulary rules.',
  tool: {
    kind: 'learner-external' as const,
    toolName: 'Python and a local editor',
    intendedUse:
      'Implement tokenization outside the app and return the vocabulary file.',
  },
  instructions:
    'Tokenize the sample corpus using the paper’s rules and save the vocabulary.',
  observableCheckpoints: [
    'Vocabulary size is computed from the corpus.',
    'Unknown tokens have an explicit rule.',
  ],
  expectedArtifact: 'A tokenizer script plus a saved vocabulary file.',
  reflectionPrompt:
    'What broke when the corpus differed from the paper example?',
  sourceIds: ['openalex_W1'],
};

const capstoneBrief = {
  kind: 'source-supported-practice-brief' as const,
  author: 'ai' as const,
  masteryEstablished: false as const,
  intendedOutcome: 'Ship a small LoRA adapter with measured held-out quality.',
  setup: 'A pretrained checkpoint, PEFT, and a tiny evaluation split.',
  tool: {
    kind: 'learner-external' as const,
    toolName: 'Hugging Face PEFT',
    intendedUse: 'Fine-tune an adapter in the learner’s own environment.',
  },
  instructions:
    'Train a LoRA adapter on the paper task and record held-out loss.',
  observableCheckpoints: [
    'Adapter weights are saved as files the learner produced.',
    'Held-out loss is reported from the learner’s run.',
  ],
  expectedArtifact: 'Saved LoRA adapter weights and an evaluation log.',
  reflectionPrompt: 'Which paper constraint actually limited the adapter?',
  sourceIds: ['openalex_W1'],
};

const capstone = {
  stepId: 'step-003',
  outcome: 'A small LoRA adapter trained and evaluated on a held-out sample.',
  substantial: true as const,
};

const practiceCitation = {
  sourceId: 'openalex_W1',
  revisionId: 'edition-1',
  start: 0,
  end: 5,
  quote: HELLO,
};

const syllabus = {
  title: 'Transformers from sources',
  capstone,
  topics: [
    {
      topicId: 'topic-01',
      title: 'Foundations',
      outcome: 'Explain attention with cited originals.',
      prerequisiteTopicIds: [],
      lessons: [
        {
          stepId: 'step-001',
          title: 'Attention',
          objective: 'Explain scaled dot-product attention.',
          activity: 'Reimplement a tiny attention step.',
          role: 'concept' as const,
          prerequisiteStepIds: [],
          sourceState: 'ready' as const,
          sourceIds: ['openalex_W1'],
          practice: null,
        },
        {
          stepId: 'step-002',
          title: 'Tokenizer practice',
          objective: 'Build a tokenizer against the paper setup.',
          activity: null,
          role: 'practice' as const,
          prerequisiteStepIds: ['step-001'],
          sourceState: 'pending' as const,
          sourceIds: ['openalex_W1'],
          practice: tokenizerBrief,
        },
        {
          stepId: 'step-003',
          title: 'Capstone',
          objective: 'Ship a small LoRA experiment.',
          activity: null,
          role: 'capstone' as const,
          prerequisiteStepIds: ['step-002'],
          sourceState: 'pending' as const,
          sourceIds: ['openalex_W1'],
          practice: capstoneBrief,
        },
      ],
    },
  ],
};

const generatedLesson = {
  stepId: 'step-001',
  source: {
    sourceId: 'lesson-01',
    revisionId: 'revision-01',
    title: 'Attention',
    canonicalText: LESSON_TEXT,
    sha256: LESSON_HASH,
    format: 'plain-text' as const,
    canonicalizationVersion: 'sourced-lesson-v1',
    acquiredAt: at,
    provenance: { kind: 'generated' as const, locator: null },
  },
  paragraphs: [
    {
      text: 'Transformers map tokens to contextual representations.',
      kind: 'ai-explanation' as const,
      citations: [
        {
          sourceId: 'openalex_W1',
          revisionId: 'edition-1',
          start: 0,
          end: 5,
          quote: HELLO,
        },
      ],
    },
    {
      text: 'Attention mixes values using learned queries and keys.',
      kind: 'ai-explanation' as const,
      citations: [
        {
          sourceId: 'openalex_W1',
          revisionId: 'edition-1',
          start: 0,
          end: 5,
          quote: HELLO,
        },
      ],
    },
  ],
  practice: null,
};

const evidence = {
  evidenceId: 'evidence-01',
  locator: {
    sourceId: 'openalex_W1',
    revisionId: 'edition-1',
    start: 0,
    end: 5,
    quote: HELLO,
    position: { kind: 'document' as const },
  },
  sourceVersion: {
    sourceId: 'openalex_W1',
    revisionId: 'edition-1',
    sha256: HELLO_HASH,
    canonicalizationVersion: 'pdf-text-v1',
  },
  retrieverScore: 0.9,
  sourceQuality: 'high' as const,
  provenance: {
    query: 'Learn transformers from original sources.',
    intent: 'learning' as const,
    provider: 'turbopuffer' as const,
    retrievalVersion: 'retrieve-01',
    rankingMethod: 'vector',
    rank: 1,
    retrievedAt: at,
  },
};

const proposeRequest: LearningOnboardingRequest = {
  apiVersion: LEARNING_ONBOARDING_API_VERSION,
  requestId,
  model: 'google/gemini-3.8-flash',
  operation: { kind: 'propose-course', human },
};

const courseSuccess: LearningOnboardingResponse = {
  outcome: 'success',
  requestId,
  scope: 'complete-syllabus-and-first-lesson',
  syllabus,
  firstLesson: generatedLesson,
  sources: [acquiredSource],
  bibliography: [bibliographySource],
  evidence: [evidence],
  gaps: [],
  sourceCoverage: {
    readyLessons: 1,
    pendingLessons: 2,
    unsupportedLessons: 0,
    sources: 1,
    gaps: 0,
  },
  personalization: {
    author: 'ai',
    summary: 'Diagnostic showed attention vocabulary; keep setup brief.',
    observedGaps: ['No evidence of PEFT practice yet.'],
    masteryEstablished: false,
  },
  provenance: [provenance],
  quota,
};

const proposal = {
  id: 'proposal-01',
  revision: 1,
  projectId,
  interviewRevision: 1,
  title: syllabus.title,
  capstone: syllabus.capstone,
  topics: syllabus.topics,
  firstLesson: {
    stepId: 'step-001',
    title: 'Attention',
    text: 'This first lesson explains attention with cited originals.',
  },
  sources: [bibliographySource],
  gaps: [],
  sourceCoverage: {
    readyLessons: 1,
    pendingLessons: 2,
    unsupportedLessons: 0,
    sources: 1,
    gaps: 0,
  },
  personalization: {
    author: 'ai' as const,
    summary: 'Diagnostic showed attention vocabulary; keep setup brief.',
    observedGaps: ['No evidence of PEFT practice yet.'],
    masteryEstablished: false as const,
  },
  acceptance: 'ready' as const,
};

function compactFromSyllabus() {
  return {
    title: syllabus.title,
    topics: syllabus.topics.map((topic) => ({
      topicId: topic.topicId,
      title: topic.title,
      lessons: topic.lessons.map((lesson) => ({
        stepId: lesson.stepId,
        title: lesson.title,
        role: lesson.role,
        sourceState: lesson.sourceState,
        sourceIds: lesson.sourceIds,
        practiceDigest:
          lesson.practice === null
            ? null
            : validation.practiceBriefDigest(lesson.practice),
      })),
    })),
  };
}

function emptyReviewedCourse() {
  return {
    acceptedAdjustment: null,
    pathRevision: 1,
    focus: null,
    depth: null,
    pendingFieldChanges: [] as {
      remoteStepId: string;
      field: 'objective' | 'activity';
      value: string;
    }[],
  };
}

const reviewedDigest = validation.reviewedBaseDigest({
  pathRevision: 1,
  acceptedAdjustment: null,
  focus: null,
  depth: null,
  pending: [],
});

const practicalActivity = {
  projectId,
  origin: {
    path: {
      pathId: '11111111-1111-4111-8111-111111111111',
      pathRevision: 1,
      topicId: '22222222-2222-4222-8222-222222222222',
      lessonId: '33333333-3333-4333-8333-333333333333',
    },
  },
  title: 'Tokenizer practice',
  instructions: 'Tokenize a short corpus outside the app.',
  objective: 'Produce a working tokenizer on a short corpus.',
};

function completeMappings() {
  return syllabus.topics.flatMap((topic) =>
    topic.lessons.map((lesson, index) => ({
      projectId,
      pathId: 'path-001a',
      acceptedProposalId: 'proposal-01',
      acceptedProposalRevision: 1,
      remoteStepId: lesson.stepId,
      localTopicId: topic.topicId,
      localLessonId: `lesson-0${String(index + 1)}`,
    })),
  );
}

const selectedLessonRequest: LearningOnboardingRequest = {
  apiVersion: LEARNING_ONBOARDING_API_VERSION,
  requestId: 'request-02',
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'generate-selected-lesson',
    human,
    model: {
      trust: ONBOARDING_CONTEXT_TRUST.model,
      priorProposal: { id: 'proposal-01', revision: 1 },
      syllabus: compactFromSyllabus(),
      personalization: null,
      reviewedCourse: null,
    },
    target: {
      remoteStepId: 'step-002',
      acceptedProposal: { id: 'proposal-01', revision: 1 },
      practice: tokenizerBrief,
    },
  },
};

const adjustedBrief = {
  ...tokenizerBrief,
  intendedOutcome: 'Produce a tokenizer and a documented unknown-token rule.',
};

const adjustmentRequest: LearningOnboardingRequest = {
  apiVersion: LEARNING_ONBOARDING_API_VERSION,
  requestId: 'request-03',
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'adjust-accepted-course',
    human,
    notes: 'Tokenizer practice still failed on unknown tokens.',
    model: {
      trust: ONBOARDING_CONTEXT_TRUST.model,
      priorProposal: { id: 'proposal-01', revision: 1 },
      syllabus: compactFromSyllabus(),
      personalization: null,
      reviewedCourse: emptyReviewedCourse(),
    },
    progress: {
      trust: ONBOARDING_CONTEXT_TRUST.human,
      practicalAttempts: [
        {
          trust: ONBOARDING_CONTEXT_TRUST.human,
          kind: 'practical-attempt-locator',
          attemptId: 'e1234567-1234-4234-8234-123456789012',
          recordedRevision: 1,
          remoteStepId: 'step-002',
          work: {
            activityOrigin: {
              pathId: practicalActivity.origin.path.pathId,
              pathRevision: 1,
              topicId: practicalActivity.origin.path.topicId,
              lessonId: practicalActivity.origin.path.lessonId,
            },
            reflection: {
              authorKind: 'human',
              text: 'Unknown tokens still failed.',
            },
            reportedResult: {
              kind: 'user-reported-text',
              text: 'Tokenizer emitted UNK for rare tokens.',
            },
            recordedAt: at,
            masteryEstablished: false,
          },
        },
      ],
    },
    acceptedProposal: { id: 'proposal-01', revision: 1 },
  },
};

const adjustmentSuccess: AcceptedCourseAdjustmentSuccess = {
  outcome: 'success',
  requestId: 'request-03',
  scope: 'accepted-course-adjustment',
  adjustment: {
    acceptedProposal: { id: 'proposal-01', revision: 1 },
    summary: {
      author: 'ai',
      summary:
        'Returned tokenizer work still misses the unknown-token rule; deepen that pending practice.',
      observedGaps: ['Unknown-token handling is still unproven.'],
      masteryEstablished: false,
    },
    focus: {
      before: human.focus,
      after: 'Tokenizer unknown-token handling before LoRA.',
    },
    depth: { before: 'balanced', after: 'deep' },
    patches: [
      {
        remoteStepId: 'step-002',
        field: 'practice',
        before: tokenizerBrief.intendedOutcome,
        after: adjustedBrief.intendedOutcome,
        practiceBefore: tokenizerBrief,
        practice: adjustedBrief,
      },
    ],
    citations: [
      {
        sourceId: 'openalex_W1',
        revisionId: 'edition-1',
        start: 0,
        end: 5,
        quote: HELLO,
      },
    ],
    reviewedBase: {
      pathRevision: 1,
      acceptedAdjustment: null,
      digest: reviewedDigest,
    },
  },
  sources: [acquiredSource],
  bibliography: [bibliographySource],
  evidence: [evidence],
  gaps: [],
  provenance: [provenance],
  quota,
};

describe('learning onboarding contracts', () => {
  it('keeps sourced-learning compatibility constants distinct from onboarding', () => {
    expect(LEARNING_API_VERSION).toBe('2026-09-08');
    expect(LEARNING_ONBOARDING_API_VERSION).toBe('2026-09-09');
    expect(LEARNING_ONBOARDING_PATH).toBe('/v1/learning/onboarding');
    expect(COMPATIBLE_SOURCED_LEARNING_SCOPE).toBe('first-useful-step');
    expect(LEARNING_ONBOARDING_LIMITS.topics).toBe(16);
    expect(LEARNING_ONBOARDING_LIMITS.lessons).toBe(160);
    expect(LEARNING_ONBOARDING_LIMITS.requestBytes).toBe(64 * 1024);
    expect(LEARNING_ONBOARDING_LIMITS.responseBytes).toBe(4 * 1024 * 1024);
    expect(LEARNING_ONBOARDING_LIMITS.generationEvidenceSources).toBe(4);
    expect(LEARNING_ONBOARDING_LIMITS.generationEvidenceCharacters).toBe(
      48_000,
    );
    expect(LEARNING_ONBOARDING_LIMITS.practiceCheckpoints).toBe(8);
    expect(LEARNING_ONBOARDING_LIMITS.pastedSeedCharacters).toBe(
      LEARNING_ONBOARDING_LIMITS.previewCharacters,
    );
    expect(LEARNING_ONBOARDING_OPERATIONS).toContain('adjust-accepted-course');
    expect(LEARNING_ONBOARDING_SCOPES).toContain('accepted-course-adjustment');
    expect(SOURCE_CHANNELS.generate).toBe('sources:generate-learning-path');
    expect(desktopOnboarding).not.toHaveProperty('LEARNING_ONBOARDING_PATH');
    expect(desktopOnboarding).not.toHaveProperty(
      'LEARNING_ONBOARDING_API_VERSION',
    );
    expect(desktopOnboarding).not.toHaveProperty(
      'FORBIDDEN_ONBOARDING_AUTHORITY_FIELDS',
    );
  });

  it('roundtrips human profile, interview, proposal projection and step mapping', () => {
    const profile = {
      background: 'I have written Python services.',
      learningGoals: 'Implement attention, then LoRA.',
      priorKnowledge: 'I can train a small classifier.',
      revision: 1,
      updatedAt: at,
      author: 'human' as const,
    };
    expect(validation.parseLearnerProfile(profile)).toEqual(profile);
    expect(
      validation.parseSaveLearnerProfileInput({
        expectedRevision: 0,
        draft: {
          background: profile.background,
          learningGoals: profile.learningGoals,
          priorKnowledge: profile.priorKnowledge,
        },
      }),
    ).toEqual({
      expectedRevision: 0,
      draft: {
        background: profile.background,
        learningGoals: profile.learningGoals,
        priorKnowledge: profile.priorKnowledge,
      },
    });
    const interview = {
      goal: human.goal,
      focus: human.focus,
      depth: human.depth,
      profileRevision: 1,
      sourceRevisionIds: ['edition-1'],
      seedDrafts: [
        {
          trust: ONBOARDING_CONTEXT_TRUST.human,
          kind: 'unacquired-url' as const,
          url: 'https://ocw.mit.edu/courses/6-036/',
        },
      ],
      answers: [{ promptId: 'prompt-01', answer: human.answers[0]!.answer }],
      projectId,
      revision: 1,
      updatedAt: at,
      prompts: [
        {
          id: 'prompt-01',
          text: 'Explain attention without multiple-choice cues.',
          provenance,
        },
      ],
    };
    expect(validation.parseInterviewRecord(interview)).toEqual(interview);
    expect(validation.parseCourseProposal(proposal)).toEqual(proposal);
    const mapping = completeMappings();
    expect(validation.parseAcceptedStepMappings(mapping, syllabus)).toEqual(
      mapping,
    );
  });

  it('roundtrips the sibling onboarding request and trusted course success', () => {
    expect(validation.parseLearningOnboardingRequest(proposeRequest)).toEqual(
      proposeRequest,
    );
    expect(
      validation.parseLearningOnboardingResponse(courseSuccess, proposeRequest),
    ).toEqual(courseSuccess);
  });

  it('admits exact pasted seed bytes as untrusted context and unbound interview drafts', () => {
    const pasted = '  excerpt from a paper  ';
    const withPaste = {
      ...proposeRequest,
      operation: {
        ...proposeRequest.operation,
        human: { ...human, pastedSeedText: pasted },
      },
    };
    expect(validation.parseLearningOnboardingRequest(withPaste)).toEqual(
      withPaste,
    );
    expectRejected(
      {
        ...proposeRequest,
        operation: {
          ...proposeRequest.operation,
          human: { ...human, pastedSeedText: '   ' },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
    expectRejected(
      {
        ...proposeRequest,
        operation: {
          ...proposeRequest.operation,
          human: Object.fromEntries(
            Object.entries(human).filter(([key]) => key !== 'pastedSeedText'),
          ),
        },
      },
      validation.parseLearningOnboardingRequest,
    );
    const unbound = {
      goal: human.goal,
      focus: human.focus,
      depth: human.depth,
      profileRevision: 0,
      sourceRevisionIds: [] as string[],
      seedDrafts: [] as const,
      answers: [{ promptId: 'prompt-01', answer: human.answers[0]!.answer }],
    };
    expect(
      validation.parseSaveLearningInterviewInput({
        projectId,
        expectedRevision: 0,
        draft: unbound,
      }).draft.profileRevision,
    ).toBe(0);
  });

  it('roundtrips accepted-course adjustment overlays and rejects replacement syllabi or ready-lesson patches', () => {
    expect(
      validation.parseLearningOnboardingRequest(adjustmentRequest),
    ).toEqual(adjustmentRequest);
    expect(
      validation.parseLearningOnboardingResponse(
        adjustmentSuccess,
        adjustmentRequest,
      ),
    ).toEqual(adjustmentSuccess);
    expect(
      validation.parseAdjustAcceptedCourseInput({
        projectId,
        requestId: 'request-03',
        acceptedProposal: { id: 'proposal-01', revision: 1 },
        interviewRevision: 1,
        notes: 'Tokenizer practice still failed on unknown tokens.',
        progress: {
          practicalAttempts: [
            {
              attemptId: 'e1234567-1234-4234-8234-123456789012',
              recordedRevision: 1,
              remoteStepId: 'step-002',
              activity: practicalActivity,
            },
          ],
        },
        consent: 'acquire-learning-evidence',
      }).notes,
    ).toBe('Tokenizer practice still failed on unknown tokens.');
    expectRejected(
      {
        ...adjustmentSuccess,
        syllabus,
      },
      (value) =>
        validation.parseLearningOnboardingResponse(value, adjustmentRequest),
    );
    expectRejected(
      {
        ...adjustmentSuccess,
        adjustment: {
          ...adjustmentSuccess.adjustment,
          patches: [
            {
              remoteStepId: 'step-001',
              field: 'objective',
              before: 'Explain scaled dot-product attention.',
              after: 'Skip the first lesson.',
              practiceBefore: null,
              practice: null,
            },
          ],
        },
      },
      (value) =>
        validation.parseLearningOnboardingResponse(value, adjustmentRequest),
    );
    expectRejected(
      {
        ...adjustmentRequest,
        operation: {
          ...adjustmentRequest.operation,
          acceptedProposal: { id: 'proposal-99', revision: 1 },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
    expectRejected(
      {
        projectId,
        requestId: 'request-03',
        acceptedProposal: { id: 'proposal-01', revision: 1 },
        interviewRevision: 1,
        notes: 'ok',
        progress: { practicalAttempts: [] },
        consent: 'acquire-learning-evidence',
        evidence: [{ attemptId: 'forged' }],
      },
      validation.parseAdjustAcceptedCourseInput,
    );
    expectRejected(
      {
        ...adjustmentRequest,
        operation: {
          ...adjustmentRequest.operation,
          notes: null,
          human: {
            ...human,
            answers: [
              ...human.answers,
              {
                trust: ONBOARDING_CONTEXT_TRUST.human,
                promptId: desktopOnboarding.ADJUSTMENT_NOTES_PROMPT_ID,
                answer: 'Tokenizer practice still failed on unknown tokens.',
              },
            ],
          },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
    expect(
      validation.parseLearningOnboardingSnapshot({
        interview: null,
        proposal: null,
        accepted: null,
        adjustment: null,
        acceptedAdjustment: null,
      }),
    ).toEqual({
      interview: null,
      proposal: null,
      accepted: null,
      adjustment: null,
      acceptedAdjustment: null,
    });
    expectRejected(
      {
        ...selectedLessonRequest,
        operation: {
          ...selectedLessonRequest.operation,
          model: {
            trust: ONBOARDING_CONTEXT_TRUST.model,
            priorProposal: { id: 'proposal-01', revision: 1 },
            syllabus: compactFromSyllabus(),
            personalization: null,
          },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
  });

  it('rejects forged renderer authority on accept, ensure and network envelopes', () => {
    expectRejected(
      {
        projectId,
        requestId,
        proposal: { id: 'proposal-01', revision: 1 },
        response: courseSuccess,
      },
      validation.parseAcceptCourseInput,
    );
    expectRejected(
      {
        projectId,
        requestId,
        proposal: { id: 'proposal-01', revision: 1 },
        canonicalText: LESSON_TEXT,
      },
      validation.parseAcceptCourseInput,
    );
    expectRejected(
      {
        projectId,
        requestId,
        proposal: { id: 'proposal-01', revision: 1 },
        sources: [acquiredSource],
        provenance: [provenance],
      },
      validation.parseAcceptCourseInput,
    );
    expectRejected(
      {
        projectId,
        requestId,
        consent: 'acquire-learning-evidence',
        target: {
          pathId: 'path-001a',
          pathRevision: 1,
          topicId: 'topic-01',
          lessonId: 'lesson-02',
          body: LESSON_TEXT,
        },
      },
      validation.parseEnsureLessonInput,
    );
    expectRejected(
      { ...proposeRequest, accountId: 'attacker' },
      validation.parseLearningOnboardingRequest,
    );
    expectRejected(
      {
        ...proposeRequest,
        evidenceContext: { evidence: [], sourceScopes: [] },
      },
      validation.parseLearningOnboardingRequest,
    );
    expectRejected(
      {
        ...proposeRequest,
        operation: {
          ...proposeRequest.operation,
          human: {
            ...human,
            seedRevisionLocators: [
              {
                sourceId: 'openalex_W1',
                revisionId: 'edition-1',
                canonicalText: HELLO,
              },
            ],
          },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
    expectRejected(
      {
        ...proposeRequest,
        operation: {
          ...proposeRequest.operation,
          human: {
            ...human,
            usePolicy: acquiredSource.usePolicy,
          },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
    expectRejected(
      {
        ...proposal,
        personalization: {
          ...proposal.personalization,
          masteryEstablished: true,
        },
      },
      validation.parseCourseProposal,
    );
    expectRejected(
      { ...proposal, author: 'human' },
      validation.parseCourseProposal,
    );
  });

  it('rejects malformed and oversize syllabus, diagnostic and admission shapes', () => {
    expectRejected({ ...proposal, topics: [] }, validation.parseCourseProposal);
    const extraTopic = {
      ...syllabus.topics[0]!,
      topicId: 'topic-xx',
      lessons: syllabus.topics[0]!.lessons.map((lesson, index) => ({
        ...lesson,
        stepId: `step-x${index + 10}`,
        prerequisiteStepIds: [],
      })),
    };
    expectRejected(
      {
        ...proposal,
        topics: Array.from({ length: 17 }, (_, index) => ({
          ...extraTopic,
          topicId: `topic-${String(index + 1).padStart(2, '0')}`,
          lessons: extraTopic.lessons.map((lesson, lessonIndex) => ({
            ...lesson,
            stepId: `step-${String(index + 1).padStart(2, '0')}${lessonIndex}`,
          })),
        })),
      },
      validation.parseCourseProposal,
    );
    expectRejected(
      {
        ...proposal,
        topics: [
          {
            ...syllabus.topics[0]!,
            lessons: Array.from({ length: 161 }, (_, index) => ({
              ...syllabus.topics[0]!.lessons[1]!,
              stepId: `step-${String(index + 1).padStart(3, '0')}`,
              prerequisiteStepIds: [],
              sourceState: 'pending' as const,
            })),
          },
        ],
      },
      validation.parseCourseProposal,
    );
    expectRejected(
      {
        expectedRevision: 0,
        draft: {
          background: 'x'.repeat(2_001),
          learningGoals: 'Implement attention.',
          priorKnowledge: 'I can train a classifier.',
        },
      },
      validation.parseSaveLearnerProfileInput,
    );
    expectRejected(
      {
        ...proposeRequest,
        operation: {
          kind: 'propose-course',
          human: {
            ...human,
            answers: Array.from({ length: 7 }, (_, index) => ({
              trust: ONBOARDING_CONTEXT_TRUST.human,
              promptId: `prompt-${String(index + 1).padStart(2, '0')}`,
              answer: 'y'.repeat(4_000),
            })),
          },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
    expectRejected(
      {
        ...courseSuccess,
        firstLesson: {
          ...generatedLesson,
          source: {
            ...generatedLesson.source,
            canonicalText: `${LESSON_TEXT} tampered`,
          },
        },
      },
      (value) =>
        validation.parseLearningOnboardingResponse(value, proposeRequest),
    );
  });

  it('enforces revision, target and mapping identity rules', () => {
    expect(
      validation.parseRevisionWrite(
        {
          status: 'conflict',
          expectedRevision: 1,
          currentRevision: 2,
        },
        validation.parseLearnerProfile,
      ),
    ).toEqual({
      status: 'conflict',
      expectedRevision: 1,
      currentRevision: 2,
    });
    const stale: LearningOnboardingResponse = {
      outcome: 'stale-revision',
      requestId,
      message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.staleRevision,
      expectedRevision: 1,
      currentRevision: 2,
      retryable: false,
    };
    expect(
      validation.parseLearningOnboardingResponse(stale, proposeRequest),
    ).toEqual(stale);
    const conflict: LearningOnboardingResponse = {
      outcome: 'conflict',
      requestId,
      message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
      retryable: false,
    };
    expect(
      validation.parseLearningOnboardingResponse(conflict, proposeRequest),
    ).toEqual(conflict);
    const selectedRequest = selectedLessonRequest;
    expect(validation.parseLearningOnboardingRequest(selectedRequest)).toEqual(
      selectedRequest,
    );
    expectRejected(
      {
        ...selectedRequest,
        operation: {
          ...selectedRequest.operation,
          target: {
            remoteStepId: 'step-999',
            acceptedProposal: { id: 'proposal-01', revision: 1 },
            practice: tokenizerBrief,
          },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
    const selectedSuccess = {
      outcome: 'success' as const,
      requestId: 'request-02',
      scope: 'selected-existing-lesson' as const,
      lesson: {
        ...generatedLesson,
        stepId: 'step-002',
        source: { ...generatedLesson.source, title: 'Tokenizer practice' },
        practice: { ...tokenizerBrief, citations: [practiceCitation] },
      },
      sources: [acquiredSource],
      bibliography: [bibliographySource],
      evidence: [evidence],
      gaps: [],
      provenance: [provenance],
      quota,
    };
    expect(
      validation.parseLearningOnboardingResponse(
        selectedSuccess,
        selectedRequest,
      ),
    ).toEqual(selectedSuccess);
    expectRejected({ ...selectedSuccess, syllabus }, (value) =>
      validation.parseLearningOnboardingResponse(value, selectedRequest),
    );
    expectRejected(
      [
        {
          projectId,
          pathId: 'path-001a',
          acceptedProposalId: 'proposal-01',
          acceptedProposalRevision: 1,
          remoteStepId: 'step-001',
          localTopicId: 'topic-01',
          localLessonId: 'lesson-01',
        },
        {
          projectId,
          pathId: 'path-other',
          acceptedProposalId: 'proposal-01',
          acceptedProposalRevision: 1,
          remoteStepId: 'step-002',
          localTopicId: 'topic-01',
          localLessonId: 'lesson-02',
        },
      ],
      (value) => validation.parseAcceptedStepMappings(value, syllabus),
    );
  });

  it('rejects the compatible sourced-learning envelope as onboarding', () => {
    expectRejected(
      {
        apiVersion: LEARNING_API_VERSION,
        requestId,
        model: 'google/gemini-3.8-flash',
        operation: {
          kind: 'generate-learning-path',
          goal: 'Understand floating point arithmetic',
          sources: [],
          learnerContext: [],
        },
      },
      validation.parseLearningOnboardingRequest,
    );
    expectRejected(
      {
        ...courseSuccess,
        scope: COMPATIBLE_SOURCED_LEARNING_SCOPE,
      },
      (value) =>
        validation.parseLearningOnboardingResponse(value, proposeRequest),
    );
    const cancelled: LearningOnboardingResponse = {
      outcome: 'cancelled',
      requestId,
      message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.cancelled,
      retryable: false,
      accounting: 'released',
    };
    expect(
      validation.parseLearningOnboardingResponse(cancelled, proposeRequest),
    ).toEqual(cancelled);
    expectRejected({ ...cancelled, retryable: true }, (value) =>
      validation.parseLearningOnboardingResponse(value, proposeRequest),
    );
  });

  it('keeps source-supported practice briefs and optional capstone off Practical attempt records', () => {
    expect(validation.parseCourseProposal(proposal).capstone).toEqual(capstone);
    expect(proposal.topics[0]!.lessons[1]!.practice).toEqual(tokenizerBrief);
    expectRejected(
      {
        ...proposal,
        topics: [
          {
            ...syllabus.topics[0]!,
            lessons: [
              syllabus.topics[0]!.lessons[0]!,
              {
                ...syllabus.topics[0]!.lessons[1]!,
                activity: 'Tokenize a short corpus outside the app.',
                practice: null,
              },
              syllabus.topics[0]!.lessons[2]!,
            ],
          },
        ],
      },
      validation.parseCourseProposal,
    );
    expectRejected(
      {
        ...proposal,
        capstone: null,
      },
      validation.parseCourseProposal,
    );
    expectRejected(
      {
        ...tokenizerBrief,
        tool: { kind: 'animation', toolName: 'Manim' },
      },
      (value) =>
        validation.parseCourseProposal({
          ...proposal,
          topics: [
            {
              ...syllabus.topics[0]!,
              lessons: [
                syllabus.topics[0]!.lessons[0]!,
                {
                  ...syllabus.topics[0]!.lessons[1]!,
                  practice: value,
                },
                syllabus.topics[0]!.lessons[2]!,
              ],
            },
          ],
        }),
    );
    expectRejected(
      {
        ...tokenizerBrief,
        attempt: 'I ran the tokenizer.',
        prediction: 'It will match the paper.',
      },
      (value) =>
        validation.parseCourseProposal({
          ...proposal,
          topics: [
            {
              ...syllabus.topics[0]!,
              lessons: [
                syllabus.topics[0]!.lessons[0]!,
                {
                  ...syllabus.topics[0]!.lessons[1]!,
                  practice: value,
                },
                syllabus.topics[0]!.lessons[2]!,
              ],
            },
          ],
        }),
    );
    expectRejected(
      {
        ...generatedLesson,
        activity: {
          text: 'Reimplement a tiny attention step.',
          kind: 'ai-proposed-activity',
          masteryEstablished: false,
        },
      },
      (value) =>
        validation.parseLearningOnboardingResponse(
          { ...courseSuccess, firstLesson: value },
          proposeRequest,
        ),
    );
    const hostedBrief = {
      ...tokenizerBrief,
      tool: { kind: 'app-hosted-catalog' as const, toolId: 'desmos-graphing' },
    };
    expect(
      validation.parseCourseProposal({
        ...proposal,
        topics: [
          {
            ...syllabus.topics[0]!,
            lessons: [
              syllabus.topics[0]!.lessons[0]!,
              {
                ...syllabus.topics[0]!.lessons[1]!,
                practice: hostedBrief,
              },
              syllabus.topics[0]!.lessons[2]!,
            ],
          },
        ],
      }).topics[0]!.lessons[1]!.practice,
    ).toEqual(hostedBrief);
    expectRejected(
      {
        ...selectedLessonRequest,
        operation: {
          ...selectedLessonRequest.operation,
          target: {
            remoteStepId: 'step-001',
            acceptedProposal: { id: 'proposal-01', revision: 1 },
            practice: tokenizerBrief,
          },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
  });

  it('rejects cyclic topic and lesson graphs and a first listed lesson that depends on a later step', () => {
    expectRejected(
      {
        ...proposal,
        topics: [
          {
            ...syllabus.topics[0]!,
            topicId: 'topic-01',
            prerequisiteTopicIds: ['topic-02'],
            lessons: [syllabus.topics[0]!.lessons[0]!],
          },
          {
            ...syllabus.topics[0]!,
            topicId: 'topic-02',
            title: 'Later foundations',
            prerequisiteTopicIds: ['topic-01'],
            lessons: [
              {
                ...syllabus.topics[0]!.lessons[1]!,
                prerequisiteStepIds: [],
              },
            ],
          },
        ],
        capstone: null,
        sourceCoverage: {
          ...proposal.sourceCoverage,
          readyLessons: 1,
          pendingLessons: 1,
        },
      },
      validation.parseCourseProposal,
    );
    expectRejected(
      {
        ...proposal,
        topics: [
          {
            ...syllabus.topics[0]!,
            lessons: [
              {
                ...syllabus.topics[0]!.lessons[0]!,
                prerequisiteStepIds: ['step-002'],
              },
              {
                ...syllabus.topics[0]!.lessons[1]!,
                prerequisiteStepIds: ['step-001'],
              },
              syllabus.topics[0]!.lessons[2]!,
            ],
          },
        ],
      },
      validation.parseCourseProposal,
    );
    expectRejected(
      {
        ...proposal,
        topics: [
          {
            ...syllabus.topics[0]!,
            lessons: [
              {
                ...syllabus.topics[0]!.lessons[0]!,
                prerequisiteStepIds: ['step-002'],
              },
              {
                ...syllabus.topics[0]!.lessons[1]!,
                prerequisiteStepIds: [],
              },
              syllabus.topics[0]!.lessons[2]!,
            ],
          },
        ],
      },
      validation.parseCourseProposal,
    );
  });

  it('rejects swapped selected-lesson briefs and mismatched proposal identity', () => {
    expectRejected(
      {
        ...selectedLessonRequest,
        operation: {
          ...selectedLessonRequest.operation,
          target: {
            remoteStepId: 'step-002',
            acceptedProposal: { id: 'proposal-01', revision: 1 },
            practice: capstoneBrief,
          },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
    expectRejected(
      {
        ...selectedLessonRequest,
        operation: {
          ...selectedLessonRequest.operation,
          target: {
            remoteStepId: 'step-002',
            acceptedProposal: { id: 'proposal-99', revision: 1 },
            practice: tokenizerBrief,
          },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
    const compact = compactFromSyllabus();
    const extraSourceTopics = compact.topics.map((topic) => ({
      ...topic,
      lessons: topic.lessons.map((lesson) =>
        lesson.stepId === 'step-002'
          ? { ...lesson, sourceIds: ['openalex_W1', 'openalex_W2'] }
          : lesson,
      ),
    }));
    expectRejected(
      {
        ...selectedLessonRequest,
        operation: {
          kind: 'generate-selected-lesson' as const,
          human,
          model: {
            trust: ONBOARDING_CONTEXT_TRUST.model,
            priorProposal: { id: 'proposal-01', revision: 1 },
            syllabus: { title: compact.title, topics: extraSourceTopics },
            personalization: null,
            reviewedCourse: null,
          },
          target: {
            remoteStepId: 'step-002',
            acceptedProposal: { id: 'proposal-01', revision: 1 },
            practice: tokenizerBrief,
          },
        },
      },
      validation.parseLearningOnboardingRequest,
    );
  });

  it('rejects source bibliography that is not closed over lesson and step identity', () => {
    expectRejected(
      {
        ...proposal,
        topics: [
          {
            ...syllabus.topics[0]!,
            lessons: [
              {
                ...syllabus.topics[0]!.lessons[0]!,
                sourceIds: ['openalex_W99'],
              },
              syllabus.topics[0]!.lessons[1]!,
              syllabus.topics[0]!.lessons[2]!,
            ],
          },
        ],
      },
      validation.parseCourseProposal,
    );
    expectRejected(
      {
        ...proposal,
        sources: [{ ...bibliographySource, lessonStepIds: ['step-999'] }],
      },
      validation.parseCourseProposal,
    );
  });

  it('rejects retrieval evidence whose quote is not the acquired canonical slice', () => {
    expectRejected(
      {
        ...courseSuccess,
        evidence: [
          {
            ...evidence,
            locator: { ...evidence.locator, quote: 'XXXXX' },
          },
        ],
      },
      (value) =>
        validation.parseLearningOnboardingResponse(value, proposeRequest),
    );
  });

  it('rejects charged or uncertain retryable unavailable and quota retryable true', () => {
    expectRejected(
      {
        outcome: 'unavailable',
        requestId,
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
        retryable: true,
        accounting: 'charged',
      },
      (value) =>
        validation.parseLearningOnboardingResponse(value, proposeRequest),
    );
    expectRejected(
      {
        outcome: 'unavailable',
        requestId,
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
        retryable: true,
        accounting: 'reservation-retained',
      },
      (value) =>
        validation.parseLearningOnboardingResponse(value, proposeRequest),
    );
    expect(
      validation.parseLearningOnboardingResponse(
        {
          outcome: 'unavailable',
          requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
          retryable: true,
          accounting: 'released',
        },
        proposeRequest,
      ),
    ).toMatchObject({ retryable: true, accounting: 'released' });
    expectRejected(
      {
        outcome: 'quota-exceeded',
        requestId,
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.quotaExceeded,
        quota,
        retryable: true,
      },
      (value) =>
        validation.parseLearningOnboardingResponse(value, proposeRequest),
    );
    expect(
      validation.parseLearningOnboardingResponse(
        {
          outcome: 'quota-exceeded',
          requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.quotaExceeded,
          quota,
          retryable: false,
        },
        proposeRequest,
      ),
    ).toMatchObject({ retryable: false });
  });

  it('bounds raw request and response bytes on the wire adapter only', () => {
    const raw = `${JSON.stringify(proposeRequest)}${' '.repeat(70_000)}`;
    expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(
      LEARNING_ONBOARDING_LIMITS.requestBytes,
    );
    expect(JSON.stringify(proposeRequest).length).toBeLessThan(
      LEARNING_ONBOARDING_LIMITS.requestBytes,
    );
    expect(
      decodeBoundedJsonWire(raw, LEARNING_ONBOARDING_LIMITS.requestBytes),
    ).toEqual(expect.objectContaining({ status: 'oversize' }));
    expect(() => validation.parseLearningOnboardingRequestWire(raw)).toThrow(
      LearningOnboardingValidationError,
    );
    expect(validation.parseLearningOnboardingRequest(JSON.parse(raw))).toEqual(
      proposeRequest,
    );
    const paddedResponse = `${JSON.stringify(courseSuccess)}${' '.repeat(4 * 1024 * 1024)}`;
    expect(() =>
      validation.parseLearningOnboardingResponseWire(
        paddedResponse,
        proposeRequest,
      ),
    ).toThrow(LearningOnboardingValidationError);
    expect(
      validation.parseLearningOnboardingResponse(courseSuccess, proposeRequest),
    ).toEqual(courseSuccess);
  });

  it('rejects mappings that miss syllabus steps or split a topic local id', () => {
    const mapping = completeMappings();
    expectRejected(mapping.slice(0, 2), (value) =>
      validation.parseAcceptedStepMappings(value, syllabus),
    );
    expectRejected(
      mapping.map((item) =>
        item.remoteStepId === 'step-002'
          ? { ...item, localTopicId: 'topic-99' }
          : item,
      ),
      (value) => validation.parseAcceptedStepMappings(value, syllabus),
    );
  });
});
