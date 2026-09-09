import { randomUUID } from 'node:crypto';
import {
  decodeContextualHelpRequest,
  retainedOriginFromRequest,
  type ContextualHelpRequest,
  type ContextualHelpResponse,
  type SourceGroundingState,
} from '../contracts/contextual-help';
import {
  decodeSceneCaptureRequest,
  decodeSceneLocalState,
  EXPLANATION_ARTIFACT_CONTRACT_VERSION,
  SCENE_ASSET_VERSION,
  type ExplanationAttempt,
  type ExplanationPlan,
  type RetainedExplanation,
  type RetainedExplanationResult,
  type SceneLocalState,
  type TrustedSceneCapture,
} from '../contracts/explanation-artifacts';
import {
  LEARNING_API_VERSION,
  LEARNING_MODEL_ALLOWLIST,
  type LearningRequest,
  type SourceCitation,
} from '../contracts/learning-api';
import type {
  LearningOrigin,
  SourceVersion,
} from '../contracts/learning-records';
import {
  admitCanonicalizer,
  learningRequestFitsNetwork,
  preferExcerptIfOversized,
  remapCitationToParent,
  tutorSourceInput,
} from './contextual-help-grounding';
import {
  decodeExplanationPlanResponse,
  decodeTutorLearningResponse,
} from './contextual-help-learning';
import {
  isSupportedClipPlan,
  requestClip,
  type ClipPlaybackResult,
  type RetainedClipRequestContext,
} from './contextual-help-clip';
import { acceptTrustedSceneCapture } from './explanation-capture';
import type { ExplanationRecords } from './explanation-records';
import {
  ContextualHelpTransportError,
  makeContextualHelpTransport,
} from './contextual-help-transport';
import { decodeRecord, decodeUuid } from './workspace-decoder';
import {
  isContractGeneration,
  isContractUuid,
} from '../contracts/contextual-contract-guards';

const APP_AUTHORED_TEXT = 'Explain this passage.';
const APP_AUTHORED_VISUAL = 'Explain this passage visually.';
const NEXT_ACTION_LIMIT = 400;

function retainedNextAction(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 1 && trimmed.length <= NEXT_ACTION_LIMIT) {
    return trimmed;
  }
  const sliced = trimmed.slice(0, NEXT_ACTION_LIMIT).trim();
  return sliced.length > 0 ? sliced : 'Continue in your own words.';
}

interface ResolvedAuthority {
  origin: LearningOrigin;
  version: SourceVersion;
  excerpt: { start: number; end: number; quote: string };
  grounding: SourceGroundingState;
}

export interface ContextualHelpOperationsOptions {
  records: ExplanationRecords;
  authenticated(): boolean;
  transport: ReturnType<typeof makeContextualHelpTransport> | null;
  now?: () => Date;
  randomUUID?: () => string;
  requestClip?: (
    context: RetainedClipRequestContext,
  ) => Promise<ClipPlaybackResult>;
}

function questionText(request: ContextualHelpRequest): string {
  if (request.question.kind === 'human') return request.question.text;
  return request.intent === 'visual' ? APP_AUTHORED_VISUAL : APP_AUTHORED_TEXT;
}

export class ContextualHelpOperations {
  private projectId: string | null = null;
  private projectGeneration = 0;
  private requestGeneration = 0;
  private readonly pending = new Map<string, AbortController>();

  constructor(private readonly options: ContextualHelpOperationsOptions) {}

  activate(value: unknown): {
    projectGeneration: number;
    requestGeneration: number;
  } {
    const next = value === null ? null : decodeUuid(value, 'project id');
    if (next === this.projectId) {
      return {
        projectGeneration: this.projectGeneration,
        requestGeneration: this.requestGeneration,
      };
    }
    this.revoke();
    this.projectId = next;
    if (next) this.projectGeneration += 1;
    return {
      projectGeneration: this.projectGeneration,
      requestGeneration: this.requestGeneration,
    };
  }

  revoke(): void {
    for (const controller of this.pending.values()) controller.abort();
    this.pending.clear();
    this.projectId = null;
    this.requestGeneration = 0;
  }

  cancel(value: unknown): void {
    const input = decodeRecord(value, 'contextual help cancellation');
    if (
      !isContractUuid(input.requestId) ||
      !isContractGeneration(input.expectedProjectGeneration) ||
      !isContractGeneration(input.expectedRequestGeneration)
    ) {
      return;
    }
    if (
      input.expectedProjectGeneration !== this.projectGeneration ||
      input.expectedRequestGeneration !== this.requestGeneration
    ) {
      return;
    }
    this.pending.get(input.requestId)?.abort();
  }

  async request(value: unknown): Promise<ContextualHelpResponse> {
    const decoded = decodeContextualHelpRequest(value);
    if (!decoded.ok) {
      return {
        outcome: 'invalid-request',
        requestId: null,
        message: 'The explanation request is invalid.',
      };
    }
    const request = decoded.value;
    if (request.projectId !== this.projectId) {
      return {
        outcome: 'invalid-request',
        requestId: request.requestId,
        message:
          'This explanation does not belong to the active learning space.',
      };
    }
    if (
      request.expectedProjectGeneration !== this.projectGeneration ||
      request.expectedRequestGeneration !== this.requestGeneration
    ) {
      return {
        outcome: 'conflict',
        requestId: request.requestId,
        expectedProjectGeneration: request.expectedProjectGeneration,
        currentProjectGeneration: this.projectGeneration,
      };
    }
    if (this.pending.size >= 1) {
      return {
        outcome: 'unavailable',
        requestId: request.requestId,
        message: 'Another explanation request is already in progress.',
        retryable: true,
      };
    }
    if (!this.options.authenticated() || !this.options.transport) {
      return {
        outcome: 'unauthenticated',
        requestId: request.requestId,
        message: 'Sign in to use remote learning.',
      };
    }
    const authority = this.resolveAuthority(request);
    if ('outcome' in authority) return authority;
    const controller = new AbortController();
    this.pending.set(request.requestId, controller);
    try {
      const response =
        request.intent === 'visual'
          ? await this.runPlanner(request, authority, controller.signal)
          : await this.runTutor(request, authority, controller.signal);
      if (
        controller.signal.aborted ||
        request.projectId !== this.projectId ||
        request.expectedProjectGeneration !== this.projectGeneration
      ) {
        return {
          outcome: 'cancelled',
          requestId: request.requestId,
          message: 'The explanation request was cancelled.',
        };
      }
      return response;
    } catch (error) {
      if (controller.signal.aborted) {
        return {
          outcome: 'cancelled',
          requestId: request.requestId,
          message: 'The explanation request was cancelled.',
        };
      }
      if (error instanceof ContextualHelpTransportError) {
        if (error.code === 'unauthenticated') {
          return {
            outcome: 'unauthenticated',
            requestId: request.requestId,
            message: error.message,
          };
        }
        return {
          outcome: 'unavailable',
          requestId: request.requestId,
          message: error.message,
          retryable: error.code !== 'oversized',
        };
      }
      return {
        outcome: 'unavailable',
        requestId: request.requestId,
        message: 'Remote learning is temporarily unavailable.',
        retryable: true,
      };
    } finally {
      this.pending.delete(request.requestId);
    }
  }

  load(value: unknown): RetainedExplanation | null {
    const input = decodeRecord(value, 'load explanation');
    const projectId = decodeUuid(input.projectId, 'project id');
    const explanationId = decodeUuid(input.explanationId, 'explanation id');
    if (projectId !== this.projectId) return null;
    return this.options.records.loadExplanation(projectId, explanationId);
  }

  list(value: unknown): RetainedExplanation[] {
    const input = decodeRecord(value, 'list explanations');
    const projectId = decodeUuid(input.projectId, 'project id');
    if (projectId !== this.projectId) return [];
    return this.options.records.listExplanations(projectId);
  }

  saveScene(value: unknown): SceneLocalState {
    const payload = decodeRecord(value, 'scene state');
    const projectId = decodeUuid(payload.projectId, 'project id');
    if (projectId !== this.projectId) {
      throw new Error('Scene does not belong to the active learning space.');
    }
    const state = decodeSceneLocalState(payload.state);
    if (!state.ok) throw new Error('Invalid scene local state.');
    this.options.records.saveSceneState(projectId, state.value);
    return state.value;
  }

  loadScene(value: unknown): SceneLocalState | null {
    const input = decodeRecord(value, 'load scene');
    const projectId = decodeUuid(input.projectId, 'project id');
    const explanationId = decodeUuid(input.explanationId, 'explanation id');
    if (projectId !== this.projectId) return null;
    return this.options.records.loadSceneState(projectId, explanationId);
  }

  capture(value: unknown): TrustedSceneCapture {
    const input = decodeRecord(value, 'scene capture');
    const projectId = decodeUuid(input.projectId, 'project id');
    if (projectId !== this.projectId) {
      throw new Error('Capture does not belong to the active learning space.');
    }
    const request = decodeSceneCaptureRequest(input.request);
    if (!request.ok) throw new Error('The capture request is invalid.');
    return acceptTrustedSceneCapture(
      this.options.records,
      projectId,
      request.value,
      this.clock(),
      this.options.randomUUID ?? randomUUID,
    );
  }

  loadCapture(value: unknown): TrustedSceneCapture | null {
    const input = decodeRecord(value, 'load capture');
    const projectId = decodeUuid(input.projectId, 'project id');
    const captureId = decodeUuid(input.captureId, 'capture id');
    if (projectId !== this.projectId) return null;
    return this.options.records.loadCapture(projectId, captureId);
  }

  private clock(): Date {
    return this.options.now?.() ?? new Date();
  }

  private stillOwnsRequest(
    request: ContextualHelpRequest,
    signal: AbortSignal,
  ): boolean {
    return (
      !signal.aborted &&
      request.projectId === this.projectId &&
      request.expectedProjectGeneration === this.projectGeneration
    );
  }

  private createId(): string {
    return this.options.randomUUID?.() ?? randomUUID();
  }

  private resolveAuthority(
    request: ContextualHelpRequest,
  ): ResolvedAuthority | ContextualHelpResponse {
    const retained = retainedOriginFromRequest(request);
    if (!retained.ok) {
      return {
        outcome: 'invalid-request',
        requestId: request.requestId,
        message: 'The explanation origin is invalid.',
      };
    }
    if (request.origin.kind === 'source-highlight') {
      const resolved = this.options.records.resolveHighlight(
        request.projectId,
        request.origin.highlightId,
      );
      if (
        !resolved ||
        resolved.highlight.revisionId !== request.origin.sourceRevisionId
      ) {
        return {
          outcome: 'invalid-request',
          requestId: request.requestId,
          message: 'The selected passage is no longer available.',
        };
      }
      return this.authorityFromHighlight(request, resolved);
    }
    const question = this.options.records.resolveSavedQuestion(
      request.projectId,
      request.origin.entry.entryId,
      request.origin.entry.revision,
    );
    if (!question) {
      return {
        outcome: 'invalid-request',
        requestId: request.requestId,
        message: 'The saved question is no longer available.',
      };
    }
    const highlightId = question.origin?.highlightId;
    if (!highlightId || !question.origin?.sourceRevisionId) {
      return {
        outcome: 'unsupported',
        requestId: request.requestId,
        message:
          'This saved question has no retained source passage to ground an answer.',
      };
    }
    const resolved = this.options.records.resolveHighlight(
      request.projectId,
      highlightId,
    );
    if (!resolved) {
      return {
        outcome: 'invalid-request',
        requestId: request.requestId,
        message: 'The selected passage is no longer available.',
      };
    }
    const base = this.authorityFromHighlight(request, resolved);
    return {
      ...base,
      origin: {
        ...base.origin,
        entry: request.origin.entry,
      },
    };
  }

  private authorityFromHighlight(
    request: ContextualHelpRequest,
    resolved: NonNullable<ReturnType<ExplanationRecords['resolveHighlight']>>,
  ): ResolvedAuthority {
    const excerpt = {
      start: resolved.highlight.start,
      end: resolved.highlight.end,
      quote: resolved.highlight.quote,
    };
    return {
      origin: {
        sourceRevisionId: resolved.highlight.revisionId,
        highlightId: resolved.highlight.id,
        ...(request.path === undefined ? {} : { path: request.path }),
      },
      version: resolved.version,
      excerpt,
      grounding: preferExcerptIfOversized(resolved.version, excerpt, (state) =>
        JSON.stringify({ grounding: state, question: questionText(request) }),
      ),
    };
  }

  private async runTutor(
    request: ContextualHelpRequest,
    authority: ResolvedAuthority,
    signal: AbortSignal,
  ): Promise<ContextualHelpResponse> {
    const blocked = this.refuseLongOrInadmissible(request, authority);
    if (blocked) return blocked;
    const source = tutorSourceInput(authority.version, authority.grounding);
    if (!source) {
      return this.rememberFailure(
        request,
        authority,
        'unsupported',
        'This source cannot be sent to the authenticated tutor.',
      );
    }
    const envelope: LearningRequest = {
      apiVersion: LEARNING_API_VERSION,
      requestId: request.requestId,
      model: LEARNING_MODEL_ALLOWLIST[0],
      operation: {
        kind: 'source-grounded-tutor',
        question: questionText(request),
        sources: [source],
        learnerContext: this.options.records.listHumanContext(
          request.projectId,
          authority.origin,
        ),
      },
    };
    if (!learningRequestFitsNetwork(JSON.stringify(envelope))) {
      return this.rememberFailure(
        request,
        authority,
        'unsupported',
        'The grounded request exceeds the 64KiB network limit.',
      );
    }
    const raw = await this.options.transport!.tutor(envelope, signal);
    const decoded = decodeTutorLearningResponse(
      raw,
      request.requestId,
      envelope.operation.sources,
    );
    if (!decoded.ok || decoded.value.outcome !== 'success') {
      return this.mapRemoteFailure(
        request,
        authority,
        decoded.ok ? decoded.value : null,
      );
    }
    const citations: SourceCitation[] = [];
    for (const citation of decoded.value.contribution.citations) {
      const mapped = remapCitationToParent(
        citation,
        authority.grounding,
        authority.version,
      );
      if (!mapped) {
        return this.rememberFailure(
          request,
          authority,
          'unavailable',
          'The tutor citations do not match the retained source revision.',
        );
      }
      citations.push({
        sourceId: authority.version.sourceId,
        revisionId: authority.version.revisionId,
        ...mapped,
      });
    }
    const now = this.clock().toISOString();
    const attemptId = this.createId();
    return this.commit(
      request,
      authority,
      {
        attemptId,
        explanationId: '',
        intent: 'text',
        status: 'ready',
        requestedAt: now,
        completedAt: now,
        humanQuestion: request.question,
        aiResponse: {
          kind: 'ai',
          body: decoded.value.contribution.body,
          nextAction: retainedNextAction(decoded.value.contribution.nextAction),
        },
        provenance: decoded.value.provenance,
        citations,
        plan: null,
        result: {
          kind: 'text-answer',
          body: decoded.value.contribution.body,
          nextAction: retainedNextAction(decoded.value.contribution.nextAction),
        },
      },
      true,
    );
  }

  private async runPlanner(
    request: ContextualHelpRequest,
    authority: ResolvedAuthority,
    signal: AbortSignal,
  ): Promise<ContextualHelpResponse> {
    const blocked = this.refuseLongOrInadmissible(request, authority);
    if (blocked) return blocked;
    const source = tutorSourceInput(authority.version, authority.grounding);
    if (!source) {
      return this.rememberFailure(
        request,
        authority,
        'unsupported',
        'This source cannot be sent to the explanation planner.',
      );
    }
    const envelope = {
      apiVersion: LEARNING_API_VERSION,
      requestId: request.requestId,
      model: LEARNING_MODEL_ALLOWLIST[0],
      operation: {
        kind: 'explanation-planner' as const,
        question: questionText(request),
        sources: [source],
        learnerContext: this.options.records.listHumanContext(
          request.projectId,
          authority.origin,
        ),
      },
    };
    if (!learningRequestFitsNetwork(JSON.stringify(envelope))) {
      return this.rememberFailure(
        request,
        authority,
        'unsupported',
        'The grounded planner request exceeds the 64KiB network limit.',
      );
    }
    const raw = await this.options.transport!.plan(envelope, signal);
    const decoded = decodeExplanationPlanResponse(raw, request.requestId);
    if (!decoded.ok || decoded.value.outcome !== 'success') {
      return this.mapRemoteFailure(
        request,
        authority,
        decoded.ok ? decoded.value : null,
      );
    }
    const plan = remapPlanCitations(decoded.value.plan, authority);
    const now = this.clock().toISOString();
    const attemptId = this.createId();
    if (plan.status === 'unsupported') {
      return this.commit(
        request,
        authority,
        {
          attemptId,
          explanationId: '',
          intent: 'visual',
          status: 'unsupported',
          requestedAt: now,
          completedAt: now,
          humanQuestion: request.question,
          aiResponse: {
            kind: 'ai',
            body: plan.textualContinuation,
            nextAction: retainedNextAction(plan.practicalContinuation),
          },
          provenance: decoded.value.provenance,
          citations: [],
          plan,
          result: null,
        },
        false,
      );
    }
    if (plan.family === 'spatial-assembly' || plan.family === 'two-link-arm') {
      const result: RetainedExplanationResult = {
        kind: 'scene',
        family: plan.family,
        assetVersion: SCENE_ASSET_VERSION,
        initialParameters: plan.parameters,
      };
      const persisted = this.commit(
        request,
        authority,
        {
          attemptId,
          explanationId: '',
          intent: 'visual',
          status: 'ready',
          requestedAt: now,
          completedAt: now,
          humanQuestion: request.question,
          aiResponse: null,
          provenance: decoded.value.provenance,
          citations:
            plan.sourceSupport.kind === 'cited-source'
              ? [...plan.sourceSupport.citations]
              : [],
          plan,
          result,
        },
        true,
      );
      if (persisted.outcome === 'success') {
        this.options.records.saveSceneState(request.projectId, {
          kind: 'scene-local-state',
          explanationId: persisted.explanationId,
          parameterRevision: 1,
          parameters: plan.parameters,
          camera: {
            position: { x: 0, y: 0, z: 13 },
            target: { x: 0, y: 0, z: 0 },
          },
        });
      }
      return persisted;
    }
    if (isSupportedClipPlan(plan)) {
      this.commit(
        request,
        authority,
        {
          attemptId,
          explanationId: '',
          intent: 'visual',
          status: 'rendering',
          requestedAt: now,
          completedAt: null,
          humanQuestion: request.question,
          aiResponse: null,
          provenance: decoded.value.provenance,
          citations: [],
          plan,
          result: null,
        },
        false,
      );
      const explanationId = this.options.records.findByOrigin(
        request.projectId,
        authority.origin,
        'visual',
      )?.explanationId;
      if (!explanationId) {
        return this.rememberFailure(
          request,
          authority,
          'unavailable',
          'The explanation identity could not be reserved before clip join.',
        );
      }
      const clip = await (this.options.requestClip ?? requestClip)({
        explanationId,
        attemptId,
        origin: authority.origin,
        plan,
        signal,
      });
      if (!this.stillOwnsRequest(request, signal)) {
        return {
          outcome: 'cancelled',
          requestId: request.requestId,
          message: 'The explanation request was cancelled.',
        };
      }
      if (clip.kind === 'ready') {
        return this.commit(
          request,
          authority,
          {
            attemptId,
            explanationId,
            intent: 'visual',
            status: 'ready',
            requestedAt: now,
            completedAt: this.clock().toISOString(),
            humanQuestion: request.question,
            aiResponse: null,
            provenance: decoded.value.provenance,
            citations: [],
            plan,
            result: clip.result,
          },
          true,
        );
      }
      return this.commit(
        request,
        authority,
        {
          attemptId,
          explanationId,
          intent: 'visual',
          status: 'unsupported',
          requestedAt: now,
          completedAt: this.clock().toISOString(),
          humanQuestion: request.question,
          aiResponse: {
            kind: 'ai',
            body: `${plan.caption} ${clip.message}`,
            nextAction:
              'Continue with the textual explanation of this passage.',
          },
          provenance: decoded.value.provenance,
          citations: [],
          plan,
          result: null,
        },
        false,
      );
    }
    return this.rememberFailure(
      request,
      authority,
      'unsupported',
      'This concept does not fit an installed visual family.',
    );
  }

  private refuseLongOrInadmissible(
    request: ContextualHelpRequest,
    authority: ResolvedAuthority,
  ): ContextualHelpResponse | null {
    if (authority.grounding.kind === 'unsupported-long-source') {
      return this.rememberFailure(
        request,
        authority,
        'unsupported',
        'This source is longer than the 48,000-character learning limit. Continue with a shorter excerpt once that mapping exists.',
      );
    }
    if (
      admitCanonicalizer(authority.version.canonicalizationVersion) === null
    ) {
      return this.rememberFailure(
        request,
        authority,
        'unsupported',
        'This source uses an unadmitted canonicalizer.',
      );
    }
    return null;
  }

  private mapRemoteFailure(
    request: ContextualHelpRequest,
    authority: ResolvedAuthority,
    remote: { outcome: string; message?: string } | null,
  ): ContextualHelpResponse {
    if (remote?.outcome === 'unauthenticated') {
      return {
        outcome: 'unauthenticated',
        requestId: request.requestId,
        message: remote.message ?? 'Sign in to use remote learning.',
      };
    }
    if (remote?.outcome === 'quota-exceeded') {
      return this.rememberFailure(
        request,
        authority,
        'quota-exceeded',
        remote.message ?? 'The monthly AI allowance is exhausted.',
      );
    }
    if (remote?.outcome === 'cancelled') {
      return {
        outcome: 'cancelled',
        requestId: request.requestId,
        message: remote.message ?? 'The explanation request was cancelled.',
      };
    }
    if (
      remote?.outcome === 'unsupported' ||
      remote?.outcome === 'invalid-request'
    ) {
      return this.rememberFailure(
        request,
        authority,
        remote.outcome,
        remote.message ?? 'The learning service rejected this request.',
      );
    }
    return this.rememberFailure(
      request,
      authority,
      'unavailable',
      typeof remote?.message === 'string'
        ? remote.message
        : 'Remote learning is temporarily unavailable.',
    );
  }

  private rememberFailure(
    request: ContextualHelpRequest,
    authority: ResolvedAuthority,
    outcome:
      'unsupported' | 'unavailable' | 'invalid-request' | 'quota-exceeded',
    message: string,
  ): ContextualHelpResponse {
    const now = this.clock().toISOString();
    this.commit(
      request,
      authority,
      {
        attemptId: this.createId(),
        explanationId: '',
        intent: request.intent,
        status: outcome === 'unsupported' ? 'unsupported' : 'failed',
        requestedAt: now,
        completedAt: now,
        humanQuestion: request.question,
        aiResponse: null,
        provenance: null,
        citations: [],
        plan: null,
        result: null,
      },
      false,
    );
    if (outcome === 'quota-exceeded') {
      return { outcome, requestId: request.requestId, message };
    }
    if (outcome === 'unavailable') {
      return {
        outcome,
        requestId: request.requestId,
        message,
        retryable: true,
      };
    }
    return { outcome, requestId: request.requestId, message };
  }

  private commit(
    request: ContextualHelpRequest,
    authority: ResolvedAuthority,
    attempt: ExplanationAttempt,
    ready: boolean,
  ): ContextualHelpResponse {
    const existing = this.options.records.findByOrigin(
      request.projectId,
      authority.origin,
      request.intent,
    );
    const explanationId = existing?.explanationId ?? this.createId();
    const now = this.clock().toISOString();
    const completed: ExplanationAttempt = { ...attempt, explanationId };
    const attempts = [
      ...(existing?.attempts ?? []).filter(
        (item) => item.attemptId !== completed.attemptId,
      ),
      completed,
    ];
    const previousUseful = existing?.attempts.find(
      (item) =>
        item.attemptId === existing.usefulAttemptId && item.status === 'ready',
    );
    const record: RetainedExplanation = {
      contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
      explanationId,
      projectId: request.projectId,
      origin: authority.origin,
      intent: request.intent,
      attempts,
      usefulAttemptId: ready
        ? completed.attemptId
        : (previousUseful?.attemptId ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const grounding = new Map<string, SourceGroundingState>();
    for (const item of existing?.attempts ?? []) {
      const stored = this.options.records.loadGrounding(
        request.projectId,
        item.attemptId,
      );
      if (stored) grounding.set(item.attemptId, stored);
    }
    grounding.set(completed.attemptId, authority.grounding);
    this.options.records.saveExplanation(record, grounding);
    if (ready) {
      return {
        outcome: 'success',
        requestId: request.requestId,
        explanationId,
        attemptId: completed.attemptId,
      };
    }
    if (attempt.status === 'unsupported' && attempt.aiResponse) {
      return {
        outcome: 'unsupported',
        requestId: request.requestId,
        message: attempt.aiResponse.body,
      };
    }
    return {
      outcome: 'unavailable',
      requestId: request.requestId,
      message:
        'The explanation attempt failed. The previous useful answer is unchanged.',
      retryable: true,
    };
  }
}

function remapPlanCitations(
  plan: ExplanationPlan,
  authority: ResolvedAuthority,
): ExplanationPlan {
  if (plan.status !== 'supported') return plan;
  if (plan.sourceSupport.kind !== 'cited-source') return plan;
  const citations: SourceCitation[] = [];
  for (const citation of plan.sourceSupport.citations) {
    const mapped = remapCitationToParent(
      citation,
      authority.grounding,
      authority.version,
    );
    if (!mapped) {
      return {
        ...plan,
        sourceSupport: {
          kind: 'illustrative-assumption',
          note: 'The planner did not cite an exact retained passage. Treat this scene as an app illustration.',
        },
      };
    }
    citations.push({
      sourceId: authority.version.sourceId,
      revisionId: authority.version.revisionId,
      ...mapped,
    });
  }
  return {
    ...plan,
    sourceSupport: { kind: 'cited-source', citations },
  };
}
