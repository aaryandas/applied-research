import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  COMPANION_GUIDANCE_CONTRACT_VERSION,
  type CompanionGuidanceRequest,
} from '../contracts/companion-guidance';
import type { LearningWorkspace } from '../contracts/learning-records';
import type { PracticalAttemptRecord } from '../contracts/practical-records';
import {
  companionSelectionIdentity,
  resolveCompanionGuidanceContext,
  type CompanionGuidanceReaders,
} from './guidance-context';

const projectId = '10000000-0000-4000-8000-000000000001';
const attemptId = '32000000-0000-4000-8000-000000000001';
const requestId = '31000000-0000-4000-8000-000000000001';
const highlightId = '40000000-0000-4000-8000-000000000001';
const sourceRevisionId = '30000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
const entryId = '80000000-0000-4000-8000-000000000001';
const recordId = '90000000-0000-4000-8000-000000000001';
const captureId = '25000000-0000-4000-8000-000000000001';
const createdAt = '2026-09-09T08:00:00.000Z';
const passage = 'Shear the basis and compare the image.';

function request(
  overrides: Partial<CompanionGuidanceRequest> = {},
): CompanionGuidanceRequest {
  return {
    contractVersion: COMPANION_GUIDANCE_CONTRACT_VERSION,
    requestId,
    expectedProjectGeneration: 1,
    expectedRequestGeneration: 0,
    trigger: 'explicit-action',
    cause: 'ask-once',
    target: {
      surface: 'reader',
      projectId,
      target: {
        kind: 'selected-source-highlight',
        sourceRevisionId,
        highlightId,
      },
    },
    utterance: {
      kind: 'app-authored-intent',
      intent: 'explain-this-passage',
    },
    selectedEvidence: { kind: 'none' },
    pageAccess: 'none',
    ...overrides,
  };
}

function workspace(): LearningWorkspace {
  const version = {
    revisionId: sourceRevisionId,
    sourceId,
    revision: 1,
    title: 'Linear maps',
    canonicalText: passage,
    sha256: createHash('sha256').update(passage, 'utf8').digest('hex'),
    format: 'plain-text' as const,
    canonicalizationVersion: 'workspace-plain-v1',
    acquiredAt: createdAt,
    provenance: { kind: 'human-imported' as const, locator: null },
  };
  return {
    project: {
      id: projectId,
      goal: 'Understand shear',
      createdAt,
      updatedAt: createdAt,
    },
    entries: [
      {
        id: entryId,
        projectId,
        currentRevision: 1,
        current: {
          revision: 1,
          kind: 'question',
          title: 'Why shear?',
          body: 'Why does a shear move the image?',
          url: '',
          citations: [],
          authorKind: 'human',
          recordedAt: createdAt,
          origin: { sourceRevisionId, highlightId },
          supports: [],
        },
        createdAt,
        revisions: [],
      },
    ],
    sources: [
      {
        id: sourceId,
        projectId,
        currentRevision: 1,
        currentVersionId: sourceRevisionId,
        currentVersion: version,
        createdAt,
        versions: [version],
      },
    ],
    highlights: [
      {
        id: highlightId,
        projectId,
        sourceId,
        revisionId: sourceRevisionId,
        start: 0,
        end: 15,
        quote: passage.slice(0, 15),
        createdAt,
      },
    ],
    paths: [],
    placements: [
      {
        projectId,
        recordId: sourceId,
        view: 'distilled',
        x: 0,
        y: 0,
        updatedAt: createdAt,
      },
      {
        projectId,
        recordId,
        view: 'distilled',
        x: 1,
        y: 1,
        updatedAt: createdAt,
      },
    ],
    unreadableProjects: [],
  };
}

function attempt(): PracticalAttemptRecord {
  return {
    attemptId,
    activity: {
      projectId,
      title: 'Compare two shears',
      objective: 'Predict the image',
      instructions: 'Change one matrix entry.',
      origin: {
        path: {
          pathId: '11000000-0000-4000-8000-000000000001',
          pathRevision: 1,
          topicId: '12000000-0000-4000-8000-000000000001',
          lessonId: '13000000-0000-4000-8000-000000000001',
        },
      },
    },
    currentRevision: 2,
    draft: {
      prediction: 'The image slides.',
      attempt: 'I sheared once.',
      reportedResult: { kind: 'user-reported-text', text: 'The x-axis moved.' },
      selectedEvidence: null,
      reflection: { authorKind: 'human', text: 'Order changed the result.' },
    },
    revisions: [],
    returnedEvidence: [],
  };
}

function readers(
  overrides: Partial<CompanionGuidanceReaders> = {},
): CompanionGuidanceReaders {
  return {
    readWorkspace: async () => workspace(),
    loadOwnedAttempt: async () => attempt(),
    readImportedFile: async () => ({
      text: 'imported column,1\n2,3',
      displayName: 'notes.csv',
    }),
    lookupMeasuredCapture: async () => null,
    boundToolSession: () => ({
      sessionId: 'tool-session',
      title: 'Matrix experiment',
      controls: [{ name: 'Reset', description: 'Restore the identity.' }],
    }),
    now: () => new Date(createdAt),
    ...overrides,
  };
}

describe('companion guidance context resolver', () => {
  it('resolves a retained Reader highlight with exact quote offsets', async () => {
    const resolved = await resolveCompanionGuidanceContext(
      request(),
      readers(),
      new AbortController().signal,
    );
    expect(resolved).toMatchObject({
      ok: true,
      value: {
        grounding: 'source',
        attribution: 'retained-source',
        excerpt: { start: 0, end: 15, quote: passage.slice(0, 15) },
      },
    });
    if (resolved.ok) {
      expect(resolved.value.source.sha256).toBe(
        createHash('sha256').update(passage, 'utf8').digest('hex'),
      );
      expect(companionSelectionIdentity(request().target)).toContain(
        'highlight',
      );
    }
  });

  it('resolves a saved human question and rejects an AI canvas record', async () => {
    const saved = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'canvas',
          projectId,
          target: { kind: 'saved-question', entry: { entryId, revision: 1 } },
        },
        utterance: { kind: 'none' },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(saved).toMatchObject({
      ok: true,
      value: { attribution: 'saved-human', grounding: 'app-context' },
    });

    const ai = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'canvas',
          projectId,
          target: { kind: 'selected-graph-record', recordId },
        },
      }),
      readers({
        readWorkspace: async () => ({
          ...workspace(),
          entries: [
            {
              id: recordId,
              projectId,
              currentRevision: 1,
              current: {
                revision: 1,
                kind: 'insight',
                title: 'AI note',
                body: 'Generated claim',
                url: '',
                citations: [],
                authorKind: 'assistant',
                recordedAt: createdAt,
                origin: null,
                supports: [],
              },
              createdAt,
              revisions: [],
            },
          ],
        }),
      }),
      new AbortController().signal,
    );
    expect(ai).toMatchObject({
      ok: false,
      reply: { outcome: 'invalid-request' },
    });
  });

  it('distinguishes Practical human drafts, imported files, and measured captures', async () => {
    const reflection = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'reflection',
        },
        utterance: {
          kind: 'human',
          text: 'Does order matter?',
          persistence: 'unsaved-draft',
          savedRevision: null,
        },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(reflection).toMatchObject({
      ok: true,
      value: { attribution: 'human-draft' },
    });

    const imported = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'selected-result',
        },
        selectedEvidence: {
          kind: 'user-selected-file',
          selectionId: 'file-01',
        },
        utterance: { kind: 'none' },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(imported).toMatchObject({
      ok: true,
      value: { attribution: 'imported-file' },
    });

    const missingCapture = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'selected-result',
        },
        selectedEvidence: { kind: 'app-measured', captureId },
        utterance: { kind: 'none' },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(missingCapture).toMatchObject({
      ok: false,
      reply: { outcome: 'invalid-request' },
    });

    const measured = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'selected-result',
        },
        selectedEvidence: { kind: 'app-measured', captureId },
        utterance: { kind: 'none' },
      }),
      readers({
        lookupMeasuredCapture: async () => ({
          text: 'det = 1',
          capturedAt: createdAt,
        }),
      }),
      new AbortController().signal,
    );
    expect(measured).toMatchObject({
      ok: true,
      value: { attribution: 'measured-capture' },
    });
  });

  it('uses the bound tool session and never a renderer URL', async () => {
    const resolved = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'tool-controls',
        },
        utterance: { kind: 'none' },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.source.canonicalText).toContain(
        'Page access: none',
      );
      expect(resolved.value.source.canonicalText).not.toContain('https://');
      expect(resolved.value.attributionSummary).toContain('no page reads');
    }
  });

  it('rejects foreign attempts, mismatched quotes, and aborted work', async () => {
    const foreign = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'activity-instructions',
        },
      }),
      readers({ loadOwnedAttempt: async () => null }),
      new AbortController().signal,
    );
    expect(foreign).toMatchObject({ ok: false, reply: { outcome: 'stale' } });

    const mismatched = await resolveCompanionGuidanceContext(
      request(),
      readers({
        readWorkspace: async () => {
          const current = workspace();
          const highlight = current.highlights[0];
          if (!highlight) throw new Error('fixture');
          return {
            ...current,
            highlights: [{ ...highlight, quote: 'not the quote' }],
          };
        },
      }),
      new AbortController().signal,
    );
    expect(mismatched).toMatchObject({
      ok: false,
      reply: { outcome: 'invalid-request' },
    });

    const aborted = new AbortController();
    aborted.abort();
    const cancelled = await resolveCompanionGuidanceContext(
      request(),
      readers(),
      aborted.signal,
    );
    expect(cancelled).toMatchObject({
      ok: false,
      reply: { outcome: 'cancelled' },
    });
  });

  it('treats a saved-revision mismatch as stale without calling tools', async () => {
    const lookup = vi.fn(async () => null);
    const resolved = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'reflection',
        },
        utterance: {
          kind: 'human',
          text: 'saved text',
          persistence: 'saved',
          savedRevision: 9,
        },
      }),
      readers({ lookupMeasuredCapture: lookup }),
      new AbortController().signal,
    );
    expect(resolved).toMatchObject({ ok: false, reply: { outcome: 'stale' } });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('resolves canvas source, human record, path, and activity instructions', async () => {
    const canvasSource = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'canvas',
          projectId,
          target: { kind: 'selected-graph-record', recordId: sourceId },
        },
        utterance: { kind: 'none' },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(canvasSource).toMatchObject({
      ok: true,
      value: { grounding: 'source', attribution: 'retained-source' },
    });

    const human = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'canvas',
          projectId,
          target: { kind: 'selected-graph-record', recordId },
        },
        utterance: {
          kind: 'app-authored-intent',
          intent: 'ask-about-selection',
        },
      }),
      readers({
        readWorkspace: async () => ({
          ...workspace(),
          entries: [
            {
              id: recordId,
              projectId,
              currentRevision: 1,
              current: {
                revision: 1,
                kind: 'insight',
                title: 'Human note',
                body: 'The shear moved the image.',
                url: '',
                citations: [],
                authorKind: 'human',
                recordedAt: createdAt,
                origin: null,
                supports: [],
              },
              createdAt,
              revisions: [],
            },
          ],
        }),
      }),
      new AbortController().signal,
    );
    expect(human).toMatchObject({
      ok: true,
      value: { attribution: 'saved-human', grounding: 'app-context' },
    });

    const path = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'canvas',
          projectId,
          target: { kind: 'selected-graph-record', recordId },
        },
      }),
      readers({
        readWorkspace: async () => ({
          ...workspace(),
          placements: [
            {
              projectId,
              recordId,
              view: 'distilled',
              x: 1,
              y: 1,
              updatedAt: createdAt,
            },
          ],
          paths: [
            {
              id: recordId,
              projectId,
              currentRevision: 1,
              current: {
                revision: 1,
                title: 'Linear maps path',
                authorKind: 'human',
                recordedAt: createdAt,
                topics: [
                  {
                    id: 'topic-01',
                    title: 'Shears',
                    lessons: [
                      {
                        id: 'lesson-01',
                        title: 'Compare images',
                        objective: 'Predict one change.',
                        activity: 'Change one entry.',
                        sourceState: 'ready',
                        sourceRevisionId: sourceRevisionId,
                        citations: [],
                      },
                    ],
                  },
                ],
              },
              createdAt,
              revisions: [],
            },
          ],
        }),
      }),
      new AbortController().signal,
    );
    expect(path).toMatchObject({
      ok: true,
      value: { attribution: 'app-control' },
    });

    const instructions = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'activity-instructions',
        },
        utterance: { kind: 'none' },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(instructions).toMatchObject({
      ok: true,
      value: { attribution: 'app-control', grounding: 'app-context' },
    });
  });

  it('rejects a missing tool session, missing file, and guest pageAccess', async () => {
    const tools = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'tool-controls',
        },
        utterance: { kind: 'none' },
      }),
      readers({ boundToolSession: () => null }),
      new AbortController().signal,
    );
    expect(tools).toMatchObject({
      ok: false,
      reply: { outcome: 'unavailable' },
    });

    const missingFile = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'selected-result',
        },
        selectedEvidence: {
          kind: 'user-selected-file',
          selectionId: 'file-01',
        },
      }),
      readers({ readImportedFile: async () => null }),
      new AbortController().signal,
    );
    expect(missingFile).toMatchObject({
      ok: false,
      reply: { outcome: 'stale' },
    });

    const reported = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'selected-result',
        },
        selectedEvidence: { kind: 'none' },
        utterance: {
          kind: 'human',
          text: 'The x-axis moved.',
          persistence: 'saved',
          savedRevision: 2,
        },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(reported).toMatchObject({
      ok: true,
      value: { attribution: 'saved-human' },
    });

    const guest = await resolveCompanionGuidanceContext(
      {
        ...request(),
        pageAccess: 'guest' as 'none',
      },
      readers(),
      new AbortController().signal,
    );
    expect(guest).toMatchObject({
      ok: false,
      reply: { outcome: 'invalid-request' },
    });
  });

  it('cancels after workspace read and admits a stored canonicalizer alias', async () => {
    const controller = new AbortController();
    const pending = resolveCompanionGuidanceContext(
      request(),
      readers({
        readWorkspace: async () => {
          controller.abort();
          return workspace();
        },
      }),
      controller.signal,
    );
    await expect(pending).resolves.toMatchObject({
      ok: false,
      reply: { outcome: 'cancelled' },
    });

    const aliased = await resolveCompanionGuidanceContext(
      request(),
      readers({
        readWorkspace: async () => {
          const current = workspace();
          const source = current.sources[0];
          if (!source) throw new Error('fixture');
          const version = {
            ...source.currentVersion,
            canonicalizationVersion: '1',
          };
          return {
            ...current,
            sources: [
              { ...source, currentVersion: version, versions: [version] },
            ],
          };
        },
      }),
      new AbortController().signal,
    );
    expect(aliased).toMatchObject({ ok: true });
  });

  it('fails closed on missing records, ungroundable sources, and oversized material', async () => {
    const missingWorkspace = await resolveCompanionGuidanceContext(
      request(),
      readers({ readWorkspace: async () => null }),
      new AbortController().signal,
    );
    expect(missingWorkspace).toMatchObject({
      ok: false,
      reply: { outcome: 'stale' },
    });

    const missingHighlight = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'reader',
          projectId,
          target: {
            kind: 'selected-source-highlight',
            sourceRevisionId,
            highlightId: recordId,
          },
        },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(missingHighlight).toMatchObject({
      ok: false,
      reply: { outcome: 'stale' },
    });

    const ungroundable = await resolveCompanionGuidanceContext(
      request(),
      readers({
        readWorkspace: async () => {
          const current = workspace();
          const source = current.sources[0];
          if (!source) throw new Error('fixture');
          const version = {
            ...source.currentVersion,
            canonicalizationVersion: 'x',
          };
          return {
            ...current,
            sources: [
              { ...source, currentVersion: version, versions: [version] },
            ],
          };
        },
      }),
      new AbortController().signal,
    );
    expect(ungroundable).toMatchObject({
      ok: false,
      reply: { outcome: 'unsupported' },
    });

    const missingQuestion = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'canvas',
          projectId,
          target: {
            kind: 'saved-question',
            entry: { entryId: recordId, revision: 1 },
          },
        },
        utterance: { kind: 'none' },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(missingQuestion).toMatchObject({
      ok: false,
      reply: { outcome: 'stale' },
    });

    const assistantQuestion = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'canvas',
          projectId,
          target: {
            kind: 'saved-question',
            entry: { entryId, revision: 1 },
          },
        },
        utterance: { kind: 'none' },
      }),
      readers({
        readWorkspace: async () => {
          const current = workspace();
          const entry = current.entries[0];
          if (!entry) throw new Error('fixture');
          return {
            ...current,
            entries: [
              {
                ...entry,
                current: { ...entry.current, authorKind: 'assistant' },
              },
            ],
          };
        },
      }),
      new AbortController().signal,
    );
    expect(assistantQuestion).toMatchObject({
      ok: false,
      reply: { outcome: 'invalid-request' },
    });

    const missingPlacement = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'canvas',
          projectId,
          target: {
            kind: 'selected-graph-record',
            recordId: highlightId,
          },
        },
        utterance: { kind: 'none' },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(missingPlacement).toMatchObject({
      ok: false,
      reply: { outcome: 'stale' },
    });

    const oversized = 'x'.repeat(48_001);
    const hugeReflection = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'reflection',
        },
        utterance: { kind: 'none' },
      }),
      readers({
        loadOwnedAttempt: async () => {
          const current = attempt();
          return {
            ...current,
            draft: {
              ...current.draft,
              reflection: { authorKind: 'human', text: oversized },
            },
          };
        },
      }),
      new AbortController().signal,
    );
    expect(hugeReflection).toMatchObject({
      ok: false,
      reply: { outcome: 'unavailable' },
    });

    const emptyReport = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'selected-result',
        },
        selectedEvidence: { kind: 'none' },
        utterance: { kind: 'none' },
      }),
      readers({
        loadOwnedAttempt: async () => {
          const current = attempt();
          return {
            ...current,
            draft: {
              ...current.draft,
              reportedResult: { kind: 'user-reported-text', text: '' },
            },
          };
        },
      }),
      new AbortController().signal,
    );
    expect(emptyReport).toMatchObject({
      ok: true,
      value: { attribution: 'human-draft' },
    });

    const priorRevision = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'canvas',
          projectId,
          target: {
            kind: 'saved-question',
            entry: { entryId, revision: 1 },
          },
        },
        utterance: { kind: 'none' },
      }),
      readers({
        readWorkspace: async () => {
          const current = workspace();
          const entry = current.entries[0];
          if (!entry) throw new Error('fixture');
          return {
            ...current,
            entries: [
              {
                ...entry,
                currentRevision: 2,
                current: {
                  ...entry.current,
                  revision: 2,
                  body: 'Newer question',
                },
                revisions: [entry.current],
              },
            ],
          };
        },
      }),
      new AbortController().signal,
    );
    expect(priorRevision).toMatchObject({
      ok: true,
      value: { attribution: 'saved-human' },
    });

    const credentialedLocator = await resolveCompanionGuidanceContext(
      request(),
      readers({
        readWorkspace: async () => {
          const current = workspace();
          const source = current.sources[0];
          if (!source) throw new Error('fixture');
          const version = {
            ...source.currentVersion,
            provenance: {
              kind: 'human-imported' as const,
              locator: 'https://user@example.test/paper',
            },
          };
          return {
            ...current,
            sources: [
              { ...source, currentVersion: version, versions: [version] },
            ],
          };
        },
      }),
      new AbortController().signal,
    );
    expect(credentialedLocator.ok).toBe(true);
    if (credentialedLocator.ok) {
      expect(credentialedLocator.value.source.provenance.locator).toBeNull();
    }

    const withoutNow: CompanionGuidanceReaders = {
      readWorkspace: async () => workspace(),
      loadOwnedAttempt: async () => attempt(),
      readImportedFile: async () => ({
        text: 'imported column,1\n2,3',
        displayName: 'notes.csv',
      }),
      lookupMeasuredCapture: async () => null,
      boundToolSession: () => ({
        sessionId: 'tool-session',
        title: 'Matrix experiment',
        controls: [{ name: 'Reset', description: 'Restore the identity.' }],
      }),
    };
    const highlightAsk = await resolveCompanionGuidanceContext(
      request({ utterance: { kind: 'none' } }),
      withoutNow,
      new AbortController().signal,
    );
    expect(highlightAsk).toMatchObject({ ok: true });

    const longQuestion = await resolveCompanionGuidanceContext(
      request({
        utterance: {
          kind: 'human',
          text: 'q'.repeat(2_001),
          persistence: 'unsaved-draft',
          savedRevision: null,
        },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(longQuestion).toMatchObject({
      ok: false,
      reply: { outcome: 'invalid-request' },
    });

    const huge = 'x'.repeat(48_001);
    const hugeInstructions = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'activity-instructions',
        },
        utterance: { kind: 'none' },
      }),
      readers({
        loadOwnedAttempt: async () => {
          const current = attempt();
          return {
            ...current,
            activity: { ...current.activity, instructions: huge },
          };
        },
      }),
      new AbortController().signal,
    );
    expect(hugeInstructions).toMatchObject({
      ok: false,
      reply: { outcome: 'unavailable' },
    });

    const hugeFile = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'selected-result',
        },
        selectedEvidence: {
          kind: 'user-selected-file',
          selectionId: 'file-01',
        },
        utterance: { kind: 'none' },
      }),
      readers({
        readImportedFile: async () => ({
          text: huge,
          displayName: 'notes.csv',
        }),
      }),
      new AbortController().signal,
    );
    expect(hugeFile).toMatchObject({
      ok: false,
      reply: { outcome: 'unsupported' },
    });

    const hugeCapture = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'selected-result',
        },
        selectedEvidence: { kind: 'app-measured', captureId },
        utterance: { kind: 'none' },
      }),
      readers({
        lookupMeasuredCapture: async () => ({
          text: huge,
          capturedAt: createdAt,
        }),
      }),
      new AbortController().signal,
    );
    expect(hugeCapture).toMatchObject({
      ok: false,
      reply: { outcome: 'unavailable' },
    });

    const savedReflection = await resolveCompanionGuidanceContext(
      request({
        target: {
          surface: 'practical-work',
          projectId,
          attemptId,
          target: 'reflection',
        },
        utterance: {
          kind: 'human',
          text: 'Order changed the result.',
          persistence: 'saved',
          savedRevision: 2,
        },
      }),
      readers(),
      new AbortController().signal,
    );
    expect(savedReflection).toMatchObject({
      ok: true,
      value: { attribution: 'saved-human' },
    });

    const historic = await resolveCompanionGuidanceContext(
      request(),
      readers({
        readWorkspace: async () => {
          const current = workspace();
          const source = current.sources[0];
          if (!source) throw new Error('fixture');
          const previous = source.currentVersion;
          const newer = {
            ...previous,
            revisionId: recordId,
            revision: 2,
          };
          return {
            ...current,
            sources: [
              {
                ...source,
                currentRevision: 2,
                currentVersionId: recordId,
                currentVersion: newer,
                versions: [previous, newer],
              },
            ],
          };
        },
      }),
      new AbortController().signal,
    );
    expect(historic).toMatchObject({ ok: true });
  });
});
