import { createHash } from 'node:crypto';
import {
  CONTEXTUAL_HELP_QUESTION_LIMIT,
  CONTEXTUAL_SOURCE_CHARACTER_LIMIT,
  isExactExcerptMapping,
} from '../contracts/contextual-help';
import { isContractIdentifier } from '../contracts/contextual-contract-guards';
import type {
  CompanionEvidenceReference,
  CompanionGuidanceReply,
  CompanionGuidanceRequest,
  CompanionHumanUtterance,
  CompanionSelectedTarget,
} from '../contracts/companion-guidance';
import type {
  LearnerContextItem,
  SourceRevisionInput,
} from '../contracts/learning-api';
import type {
  LearningEntryRecord,
  LearningWorkspace,
  SourceVersion,
} from '../contracts/learning-records';
import type { PracticalAttemptRecord } from '../contracts/practical-records';

export const APP_CONTEXT_SOURCE_ID = 'companion-app-context';
export const LOCAL_PLAIN_CANONICALIZER = 'workspace-plain-v1';

export type CompanionGuidanceAttribution =
  | 'retained-source'
  | 'saved-human'
  | 'human-draft'
  | 'imported-file'
  | 'measured-capture'
  | 'app-control';

export interface CompanionResolvedGuidance {
  readonly identityKey: string;
  readonly question: string;
  readonly grounding: 'source' | 'app-context';
  readonly source: SourceRevisionInput;
  readonly excerpt: { start: number; end: number; quote: string } | null;
  readonly learnerContext: readonly LearnerContextItem[];
  readonly attribution: CompanionGuidanceAttribution;
  readonly attributionSummary: string;
}

export interface BoundCompanionToolSession {
  readonly sessionId: string;
  readonly title: string;
  readonly controls: readonly { name: string; description: string }[];
}

export interface ImportedFileText {
  readonly text: string;
  readonly displayName: string;
}

export interface MeasuredCaptureText {
  readonly text: string;
  readonly capturedAt: string;
}

export interface CompanionGuidanceReaders {
  readonly readWorkspace: (
    projectId: string,
  ) => Promise<LearningWorkspace | null>;
  readonly loadOwnedAttempt: (
    projectId: string,
    attemptId: string,
  ) => Promise<PracticalAttemptRecord | null>;
  readonly readImportedFile: (
    projectId: string,
    attemptId: string,
    selectionId: string,
  ) => Promise<ImportedFileText | null>;
  readonly lookupMeasuredCapture: (
    projectId: string,
    attemptId: string,
    captureId: string,
  ) => Promise<MeasuredCaptureText | null>;
  readonly boundToolSession: (
    projectId: string,
  ) => BoundCompanionToolSession | null;
  readonly now?: () => Date;
}

export type CompanionResolveResult =
  | { ok: true; value: CompanionResolvedGuidance }
  | { ok: false; reply: CompanionGuidanceReply };

function sha256Utf8(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function failed(
  outcome: Exclude<CompanionGuidanceReply['outcome'], 'success'>,
  requestId: string,
  message: string,
): CompanionResolveResult {
  return { ok: false, reply: { outcome, requestId, message } };
}

function identityKey(target: CompanionSelectedTarget): string {
  if (target.surface === 'practical-work') {
    return `${target.surface}:${target.projectId}:${target.attemptId}:${target.target}`;
  }
  if (target.target.kind === 'selected-source-highlight') {
    return `${target.surface}:${target.projectId}:highlight:${target.target.sourceRevisionId}:${target.target.highlightId}`;
  }
  if (target.target.kind === 'saved-question') {
    return `${target.surface}:${target.projectId}:question:${target.target.entry.entryId}:${target.target.entry.revision}`;
  }
  return `${target.surface}:${target.projectId}:record:${target.target.recordId}`;
}

function admitCanonicalizer(stored: string): string | null {
  if (isContractIdentifier(stored)) return stored;
  if (stored === '1') return LOCAL_PLAIN_CANONICALIZER;
  return null;
}

function httpsLocator(value: string | null): string | null {
  if (
    typeof value === 'string' &&
    /^https:\/\//.test(value) &&
    !value.includes('@')
  ) {
    return value;
  }
  return null;
}

function appSource(
  requestId: string,
  title: string,
  canonicalText: string,
  acquiredAt: string,
): SourceRevisionInput | null {
  if (
    canonicalText.length < 1 ||
    canonicalText.length > CONTEXTUAL_SOURCE_CHARACTER_LIMIT
  ) {
    return null;
  }
  return {
    sourceId: APP_CONTEXT_SOURCE_ID,
    revisionId: requestId,
    title: title.slice(0, 200),
    canonicalText,
    sha256: sha256Utf8(canonicalText),
    format: 'plain-text',
    canonicalizationVersion: LOCAL_PLAIN_CANONICALIZER,
    acquiredAt,
    provenance: { kind: 'human-imported', locator: null },
  };
}

function tutorSource(version: SourceVersion): SourceRevisionInput | null {
  const canonicalizer = admitCanonicalizer(version.canonicalizationVersion);
  if (
    canonicalizer === null ||
    !isContractIdentifier(version.sourceId) ||
    !isContractIdentifier(version.revisionId) ||
    version.canonicalText.length < 1 ||
    version.canonicalText.length > CONTEXTUAL_SOURCE_CHARACTER_LIMIT
  ) {
    return null;
  }
  return {
    sourceId: version.sourceId,
    revisionId: version.revisionId,
    title: version.title.slice(0, 200),
    canonicalText: version.canonicalText,
    sha256: sha256Utf8(version.canonicalText),
    format: version.format,
    canonicalizationVersion: canonicalizer,
    acquiredAt: version.acquiredAt,
    provenance: {
      kind: version.provenance.kind,
      locator: httpsLocator(version.provenance.locator),
    },
  };
}

function questionText(request: CompanionGuidanceRequest): string {
  if (request.utterance.kind === 'human') return request.utterance.text;
  if (request.utterance.kind === 'app-authored-intent') {
    return request.utterance.intent === 'explain-this-passage'
      ? 'Explain this passage.'
      : 'Ask about the selected material.';
  }
  if (request.target.surface === 'practical-work') {
    switch (request.target.target) {
      case 'activity-instructions':
        return 'Help me act on these activity instructions.';
      case 'tool-controls':
        return 'Help me use the supported application controls.';
      case 'selected-result':
        return 'Help me interpret the selected result.';
      case 'reflection':
        return 'Help me improve this reflection without rewriting it for me.';
    }
  }
  if (request.target.target.kind === 'selected-source-highlight') {
    return 'Explain this passage.';
  }
  if (request.target.target.kind === 'saved-question') {
    return 'Help me pursue this saved question.';
  }
  return 'Help me understand this selected canvas record.';
}

function learnerItems(
  request: CompanionGuidanceRequest,
  extra: LearnerContextItem[],
): LearnerContextItem[] {
  const items = [...extra];
  if (request.utterance.kind === 'human') {
    items.unshift({
      id: request.requestId,
      kind: 'human-question',
      text: request.utterance.text.slice(0, 4_000),
    });
  }
  return items.slice(0, 12);
}

function versionOf(
  workspace: LearningWorkspace,
  revisionId: string,
): SourceVersion | null {
  for (const source of workspace.sources) {
    if (source.currentVersion.revisionId === revisionId)
      return source.currentVersion;
    const match = source.versions.find(
      (item) => item.revisionId === revisionId,
    );
    if (match) return match;
  }
  return null;
}

function savedQuestion(
  workspace: LearningWorkspace,
  entryId: string,
  revision: number,
): LearningEntryRecord['revisions'][number] | null {
  const record = workspace.entries.find((item) => item.id === entryId);
  if (!record) return null;
  if (record.current.revision === revision) return record.current;
  return record.revisions.find((item) => item.revision === revision) ?? null;
}

async function resolveWorkspace(
  request: CompanionGuidanceRequest,
  target: Extract<CompanionSelectedTarget, { surface: 'reader' | 'canvas' }>,
  readers: CompanionGuidanceReaders,
  acquiredAt: string,
): Promise<CompanionResolveResult> {
  const workspace = await readers.readWorkspace(target.projectId);
  if (!workspace || workspace.project.id !== target.projectId) {
    return failed(
      'stale',
      request.requestId,
      'The selected learning space is no longer available.',
    );
  }
  if (target.target.kind === 'selected-source-highlight') {
    const focus = target.target;
    const highlight = workspace.highlights.find(
      (item) =>
        item.id === focus.highlightId &&
        item.revisionId === focus.sourceRevisionId &&
        item.projectId === target.projectId,
    );
    const version = versionOf(workspace, focus.sourceRevisionId);
    if (!highlight || !version) {
      return failed(
        'stale',
        request.requestId,
        'The selected source passage is no longer available.',
      );
    }
    if (
      !isExactExcerptMapping(
        version.canonicalText,
        highlight.start,
        highlight.end,
        highlight.quote,
      )
    ) {
      return failed(
        'invalid-request',
        request.requestId,
        'The selected passage no longer matches the retained source.',
      );
    }
    const source = tutorSource(version);
    if (!source) {
      return failed(
        'unsupported',
        request.requestId,
        'This source cannot be used for scientific grounding.',
      );
    }
    return {
      ok: true,
      value: {
        identityKey: identityKey(target),
        question: questionText(request),
        grounding: 'source',
        source,
        excerpt: {
          start: highlight.start,
          end: highlight.end,
          quote: highlight.quote,
        },
        learnerContext: learnerItems(request, []),
        attribution: 'retained-source',
        attributionSummary: `Retained source · ${version.title}`,
      },
    };
  }
  if (target.target.kind === 'saved-question') {
    const entry = savedQuestion(
      workspace,
      target.target.entry.entryId,
      target.target.entry.revision,
    );
    if (!entry) {
      return failed(
        'stale',
        request.requestId,
        'The saved question revision is no longer available.',
      );
    }
    if (entry.kind !== 'question' || entry.authorKind !== 'human') {
      return failed(
        'invalid-request',
        request.requestId,
        'Only a human-authored saved question can be selected.',
      );
    }
    const source = appSource(
      request.requestId,
      entry.title || 'Saved question',
      entry.body,
      acquiredAt,
    );
    if (!source) {
      return failed(
        'unavailable',
        request.requestId,
        'The selected question exceeds the guidance limit.',
      );
    }
    return {
      ok: true,
      value: {
        identityKey: identityKey(target),
        question: questionText(request),
        grounding: 'app-context',
        source,
        excerpt: null,
        learnerContext: learnerItems(request, [
          {
            id: 'saved-question-01',
            kind: 'human-question',
            text: entry.body.slice(0, 4_000),
          },
        ]),
        attribution: 'saved-human',
        attributionSummary: `Saved human question · revision ${target.target.entry.revision}`,
      },
    };
  }
  const recordId = target.target.recordId;
  const placement = workspace.placements.find(
    (item) => item.recordId === recordId && item.projectId === target.projectId,
  );
  if (!placement) {
    return failed(
      'stale',
      request.requestId,
      'The selected canvas record is no longer available.',
    );
  }
  const record =
    workspace.entries.find((item) => item.id === placement.recordId) ?? null;
  const placedSource =
    workspace.sources.find((item) => item.id === placement.recordId) ?? null;
  const placedPath =
    workspace.paths.find((item) => item.id === placement.recordId) ?? null;
  if (placedSource) {
    const source = tutorSource(placedSource.currentVersion);
    if (!source) {
      return failed(
        'unsupported',
        request.requestId,
        'This canvas source cannot be used for scientific grounding.',
      );
    }
    return {
      ok: true,
      value: {
        identityKey: identityKey(target),
        question: questionText(request),
        grounding: 'source',
        source,
        excerpt: null,
        learnerContext: learnerItems(request, []),
        attribution: 'retained-source',
        attributionSummary: `Selected canvas source · ${placedSource.currentVersion.title}`,
      },
    };
  }
  if (record) {
    if (record.current.authorKind === 'assistant') {
      return failed(
        'invalid-request',
        request.requestId,
        'AI writing cannot be selected as a human canvas record.',
      );
    }
    const source = appSource(
      request.requestId,
      record.current.title || 'Canvas record',
      record.current.body,
      acquiredAt,
    );
    if (!source) {
      return failed(
        'unavailable',
        request.requestId,
        'The selected canvas record exceeds the guidance limit.',
      );
    }
    return {
      ok: true,
      value: {
        identityKey: identityKey(target),
        question: questionText(request),
        grounding: 'app-context',
        source,
        excerpt: null,
        learnerContext: learnerItems(request, []),
        attribution:
          record.current.authorKind === 'human' ? 'saved-human' : 'app-control',
        attributionSummary:
          record.current.authorKind === 'human'
            ? 'Selected saved human canvas record'
            : 'Selected canvas record',
      },
    };
  }
  if (placedPath) {
    const text = placedPath.current.topics
      .flatMap((topic) => [
        topic.title,
        ...topic.lessons.map(
          (lesson) => `${lesson.title}: ${lesson.objective}`,
        ),
      ])
      .join('\n');
    const source = appSource(
      request.requestId,
      placedPath.current.title,
      text.length > 0 ? text : placedPath.current.title,
      acquiredAt,
    );
    if (!source) {
      return failed(
        'unavailable',
        request.requestId,
        'The selected path exceeds the guidance limit.',
      );
    }
    return {
      ok: true,
      value: {
        identityKey: identityKey(target),
        question: questionText(request),
        grounding: 'app-context',
        source,
        excerpt: null,
        learnerContext: learnerItems(request, []),
        attribution: 'app-control',
        attributionSummary: 'Selected learning path on the canvas',
      },
    };
  }
  return failed(
    'stale',
    request.requestId,
    'The selected canvas record is no longer available.',
  );
}

function utteranceRevision(
  utterance: CompanionHumanUtterance,
  currentRevision: number,
): CompanionResolveResult | null {
  if (utterance.kind !== 'human' || utterance.persistence !== 'saved')
    return null;
  if (utterance.savedRevision !== currentRevision) {
    return failed(
      'stale',
      '00000000-0000-4000-8000-000000000000',
      'The saved human revision changed. Select it again.',
    );
  }
  return null;
}

async function resolvePractical(
  request: CompanionGuidanceRequest,
  target: Extract<CompanionSelectedTarget, { surface: 'practical-work' }>,
  readers: CompanionGuidanceReaders,
  acquiredAt: string,
): Promise<CompanionResolveResult> {
  const attempt = await readers.loadOwnedAttempt(
    target.projectId,
    target.attemptId,
  );
  if (!attempt || attempt.activity.projectId !== target.projectId) {
    return failed(
      'stale',
      request.requestId,
      'The selected activity attempt is no longer available.',
    );
  }
  const saved = utteranceRevision(request.utterance, attempt.currentRevision);
  if (saved && !saved.ok) {
    return {
      ok: false,
      reply: { ...saved.reply, requestId: request.requestId },
    };
  }
  const draft = attempt.draft;
  if (target.target === 'activity-instructions') {
    const canonicalText = [
      attempt.activity.title,
      attempt.activity.objective,
      attempt.activity.instructions,
    ].join('\n');
    const source = appSource(
      request.requestId,
      attempt.activity.title,
      canonicalText,
      acquiredAt,
    );
    if (!source) {
      return failed(
        'unavailable',
        request.requestId,
        'The activity instructions exceed the guidance limit.',
      );
    }
    return {
      ok: true,
      value: {
        identityKey: identityKey(target),
        question: questionText(request),
        grounding: 'app-context',
        source,
        excerpt: null,
        learnerContext: learnerItems(request, []),
        attribution: 'app-control',
        attributionSummary: 'Activity instructions · no guest page',
      },
    };
  }
  if (target.target === 'tool-controls') {
    const session = readers.boundToolSession(target.projectId);
    if (!session) {
      return failed(
        'unavailable',
        request.requestId,
        'No bound application tool session is available.',
      );
    }
    const canonicalText = [
      `Application tool: ${session.title}`,
      'Page access: none. Guest page content is not included.',
      ...session.controls.map(
        (control) => `${control.name}: ${control.description}`,
      ),
    ].join('\n');
    const source = appSource(
      request.requestId,
      session.title,
      canonicalText,
      acquiredAt,
    );
    if (!source) {
      return failed(
        'unavailable',
        request.requestId,
        'The tool control description exceeds the guidance limit.',
      );
    }
    return {
      ok: true,
      value: {
        identityKey: identityKey(target),
        question: questionText(request),
        grounding: 'app-context',
        source,
        excerpt: null,
        learnerContext: learnerItems(request, []),
        attribution: 'app-control',
        attributionSummary: `App tool controls · ${session.title} · no page reads`,
      },
    };
  }
  if (target.target === 'reflection') {
    const persistence =
      request.utterance.kind === 'human' &&
      request.utterance.persistence === 'saved'
        ? 'saved-human'
        : 'human-draft';
    const text = draft.reflection.text;
    const source = appSource(
      request.requestId,
      'Human reflection',
      text.length > 0 ? text : 'No reflection text is saved yet.',
      acquiredAt,
    );
    if (!source) {
      return failed(
        'unavailable',
        request.requestId,
        'The reflection exceeds the guidance limit.',
      );
    }
    return {
      ok: true,
      value: {
        identityKey: identityKey(target),
        question: questionText(request),
        grounding: 'app-context',
        source,
        excerpt: null,
        learnerContext: learnerItems(request, [
          {
            id: 'human-reflection01',
            kind: 'human-note',
            text: text.slice(0, 4_000) || 'No reflection text is saved yet.',
          },
        ]),
        attribution: persistence,
        attributionSummary:
          persistence === 'saved-human'
            ? `Saved human reflection · revision ${attempt.currentRevision}`
            : 'Unsaved human reflection',
      },
    };
  }
  return resolveSelectedResult(request, target, attempt, readers, acquiredAt);
}

async function resolveSelectedResult(
  request: CompanionGuidanceRequest,
  target: Extract<CompanionSelectedTarget, { surface: 'practical-work' }>,
  attempt: PracticalAttemptRecord,
  readers: CompanionGuidanceReaders,
  acquiredAt: string,
): Promise<CompanionResolveResult> {
  const evidence: CompanionEvidenceReference = request.selectedEvidence;
  if (evidence.kind === 'user-selected-file') {
    const file = await readers.readImportedFile(
      target.projectId,
      target.attemptId,
      evidence.selectionId,
    );
    if (!file) {
      return failed(
        'stale',
        request.requestId,
        'The selected imported file is no longer available.',
      );
    }
    const source = appSource(
      request.requestId,
      file.displayName,
      file.text,
      acquiredAt,
    );
    if (!source) {
      return failed(
        'unsupported',
        request.requestId,
        'This imported file cannot be used as text evidence.',
      );
    }
    return {
      ok: true,
      value: {
        identityKey: identityKey(target),
        question: questionText(request),
        grounding: 'app-context',
        source,
        excerpt: null,
        learnerContext: learnerItems(request, [
          {
            id: 'imported-result-01',
            kind: 'reported-result',
            text: file.text.slice(0, 4_000),
          },
        ]),
        attribution: 'imported-file',
        attributionSummary: `Imported result · ${file.displayName}`,
      },
    };
  }
  if (evidence.kind === 'app-measured') {
    const capture = await readers.lookupMeasuredCapture(
      target.projectId,
      target.attemptId,
      evidence.captureId,
    );
    if (!capture) {
      return failed(
        'invalid-request',
        request.requestId,
        'Measured evidence must come from a main-owned capture.',
      );
    }
    const source = appSource(
      request.requestId,
      'App-measured result',
      capture.text,
      capture.capturedAt,
    );
    if (!source) {
      return failed(
        'unavailable',
        request.requestId,
        'The measured result exceeds the guidance limit.',
      );
    }
    return {
      ok: true,
      value: {
        identityKey: identityKey(target),
        question: questionText(request),
        grounding: 'app-context',
        source,
        excerpt: null,
        learnerContext: learnerItems(request, [
          {
            id: 'measured-result-01',
            kind: 'reported-result',
            text: capture.text.slice(0, 4_000),
          },
        ]),
        attribution: 'measured-capture',
        attributionSummary: `App-measured result · ${capture.capturedAt}`,
      },
    };
  }
  const reported = attempt.draft.reportedResult.text;
  const persistence =
    request.utterance.kind === 'human' &&
    request.utterance.persistence === 'saved'
      ? 'saved-human'
      : 'human-draft';
  const source = appSource(
    request.requestId,
    'Human-reported result',
    reported.length > 0 ? reported : 'No result text is saved yet.',
    acquiredAt,
  );
  if (!source) {
    return failed(
      'unavailable',
      request.requestId,
      'The reported result exceeds the guidance limit.',
    );
  }
  return {
    ok: true,
    value: {
      identityKey: identityKey(target),
      question: questionText(request),
      grounding: 'app-context',
      source,
      excerpt: null,
      learnerContext: learnerItems(request, [
        {
          id: 'reported-result-01',
          kind: 'reported-result',
          text: (reported || 'No result text is saved yet.').slice(0, 4_000),
        },
      ]),
      attribution: persistence,
      attributionSummary:
        persistence === 'saved-human'
          ? `Saved human-reported result · revision ${attempt.currentRevision}`
          : 'Unsaved human-reported result',
    },
  };
}

export function companionSelectionIdentity(
  target: CompanionSelectedTarget,
): string {
  return identityKey(target);
}

export async function resolveCompanionGuidanceContext(
  request: CompanionGuidanceRequest,
  readers: CompanionGuidanceReaders,
  signal: AbortSignal,
): Promise<CompanionResolveResult> {
  if (signal.aborted) {
    return failed(
      'cancelled',
      request.requestId,
      'The companion request was cancelled.',
    );
  }
  if (request.pageAccess !== 'none') {
    return failed(
      'invalid-request',
      request.requestId,
      'Companion guidance cannot read a guest page.',
    );
  }
  const question = questionText(request);
  if (question.length < 1 || question.length > CONTEXTUAL_HELP_QUESTION_LIMIT) {
    return failed(
      'invalid-request',
      request.requestId,
      'The companion question is invalid.',
    );
  }
  const acquiredAt = (readers.now?.() ?? new Date()).toISOString();
  const resolved =
    request.target.surface === 'practical-work'
      ? await resolvePractical(request, request.target, readers, acquiredAt)
      : await resolveWorkspace(request, request.target, readers, acquiredAt);
  if (signal.aborted) {
    return failed(
      'cancelled',
      request.requestId,
      'The companion request was cancelled.',
    );
  }
  return resolved;
}
