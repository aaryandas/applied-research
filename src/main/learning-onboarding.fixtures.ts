/** Labeled synthetic onboarding envelopes. Not live provider or corpus evidence. */
import type {
  CourseProposalSuccess,
  LearningOnboardingRequest,
  SelectedLessonSuccess,
  UntrustedHumanLearnerContext,
} from '../contracts/learning-onboarding-api';
import {
  LEARNING_ONBOARDING_API_VERSION,
  ONBOARDING_CONTEXT_TRUST,
} from '../contracts/learning-onboarding-api';
import type { AcquiredSource } from '../contracts/sourcing';
import type { ProposalSource } from '../contracts/learning-onboarding';

export const HELLO = 'hello';
export const HELLO_HASH =
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
export const LESSON_TEXT =
  'Transformers map tokens to contextual representations.\n\nAttention mixes values using learned queries and keys.';
export const LESSON_HASH =
  'bc2e2a742e069db0fb2038bd200ef206072c90517716a8b85663a3b6f4544caa';
export const AT = '2026-09-09T12:00:00.000Z';

export const acquiredSource = {
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

export const bibliographySource = {
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
      locator: 'https://example.org/paper',
    },
  },
  coverage: 'partial' as const,
  lessonStepIds: ['step-001'],
} satisfies ProposalSource;

export const tokenizerBrief = {
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

export const capstoneBrief = {
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

export const syllabus = {
  title: 'Transformers from sources',
  capstone: {
    stepId: 'step-003',
    outcome: 'A small LoRA adapter trained and evaluated on a held-out sample.',
    substantial: true as const,
  },
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

export const provenance = {
  author: 'ai' as const,
  provider: 'openrouter' as const,
  providerRequestId: 'provider-01',
  model: 'google/gemini-3.8-flash' as const,
  requestVersion: '2026-09-08' as const,
  promptVersion: 'learning-v2-2026-09-09',
  createdAt: AT,
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
        locator: 'https://example.org/paper',
      },
    },
  ],
};

const citation = {
  sourceId: 'openalex_W1',
  revisionId: 'edition-1',
  start: 0,
  end: 5,
  quote: HELLO,
};

export const generatedLesson = {
  stepId: 'step-001',
  source: {
    sourceId: 'lesson-01',
    revisionId: 'revision-01',
    title: 'Attention',
    canonicalText: LESSON_TEXT,
    sha256: LESSON_HASH,
    format: 'plain-text' as const,
    canonicalizationVersion: 'sourced-lesson-v1',
    acquiredAt: AT,
    provenance: { kind: 'generated' as const, locator: null },
  },
  paragraphs: [
    {
      text: 'Transformers map tokens to contextual representations.',
      kind: 'ai-explanation' as const,
      citations: [citation],
    },
    {
      text: 'Attention mixes values using learned queries and keys.',
      kind: 'ai-explanation' as const,
      citations: [citation],
    },
  ],
  practice: null,
};

const quota = {
  month: '2026-09',
  limitMicrousd: 20_000_000,
  committedMicrousd: 0,
  reservedMicrousd: 1_000,
  remainingMicrousd: 19_999_000,
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
    retrievedAt: AT,
  },
};

export function humanContext(input: {
  goal: string;
  profileRevision: number;
  interviewRevision: number;
}): UntrustedHumanLearnerContext {
  return {
    trust: ONBOARDING_CONTEXT_TRUST.human,
    goal: input.goal,
    focus: input.goal,
    depth: 'balanced',
    profileRevision: input.profileRevision,
    interviewRevision: input.interviewRevision,
    profile: {
      background: 'I have written Python services.',
      learningGoals: 'Implement attention, then LoRA.',
      priorKnowledge: 'I can train a small classifier.',
    },
    answers: [
      {
        trust: ONBOARDING_CONTEXT_TRUST.human,
        promptId: 'background-01',
        answer: 'I have written Python services.',
      },
    ],
    seedRevisionLocators: [],
    unacquiredSeedUrls: [],
  };
}

export function courseSuccess(requestId: string): CourseProposalSuccess {
  return {
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
}

export function selectedLessonSuccess(
  requestId: string,
): SelectedLessonSuccess {
  return {
    outcome: 'success',
    requestId,
    scope: 'selected-existing-lesson',
    lesson: {
      ...generatedLesson,
      stepId: 'step-002',
      source: {
        ...generatedLesson.source,
        sourceId: 'lesson-02',
        revisionId: 'revision-02',
        title: 'Tokenizer practice',
      },
      practice: { ...tokenizerBrief, citations: [citation] },
    },
    sources: [acquiredSource],
    bibliography: [bibliographySource],
    evidence: [evidence],
    gaps: [],
    provenance: [provenance],
    quota,
  };
}

export function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

export function proposeRequest(
  requestId: string,
  human: UntrustedHumanLearnerContext,
): LearningOnboardingRequest {
  return {
    apiVersion: LEARNING_ONBOARDING_API_VERSION,
    requestId,
    model: 'google/gemini-3.8-flash',
    operation: { kind: 'propose-course', human },
  };
}
