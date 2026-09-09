import {
  LEARNING_API_VERSION,
  LEARNING_MODEL_ALLOWLIST,
  type LearningRequest,
} from '../contracts/learning-api';
import type { SourceGenerationResult } from '../contracts/source-desktop';
import { SourceAdoption } from './source-adoption';
import { decodeRecord, decodeUuid } from './workspace-decoder';
import {
  parseAcquireCanonicalSourceRequest,
  parseDiscoverSourcesRequest,
  parseDiscoverSourcesResponse,
  parseAcquireCanonicalSourceResponse,
} from './source-contract-validation';
import {
  SOURCING_PUBLIC_MESSAGES,
  type AcquireCanonicalSourceRequest,
  type DiscoverSourcesRequest,
  type SourceDescriptor,
} from '../contracts/sourcing';
import type {
  SourceAcquisitionResult,
  SourceDiscoveryResult,
} from '../contracts/source-desktop';
import type { WorkspaceStore } from './workspace-store';

/** Auth owner supplies cookie-bound, bounded HTTP composition. Responses are untrusted until parsed here. */
export interface AuthenticatedSourceTransport {
  discover(
    request: DiscoverSourcesRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
  acquire(
    request: AcquireCanonicalSourceRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
  generate?(request: LearningRequest, signal: AbortSignal): Promise<unknown>;
}
interface SourceDesktopOptions {
  store: WorkspaceStore;
  authenticated(): boolean;
  transport: AuthenticatedSourceTransport | null;
  openOriginal(url: string): Promise<void>;
}
export class SourceDesktopOperations {
  private readonly adoption: SourceAdoption;
  private projectId: string | null = null;
  private readonly pending = new Map<string, AbortController>();
  private readonly descriptors = new Map<string, SourceDescriptor>();
  constructor(private readonly options: SourceDesktopOptions) {
    this.adoption = new SourceAdoption(options.store);
  }
  activate(value: unknown): void {
    const next = value === null ? null : decodeUuid(value, 'project id');
    if (next === this.projectId) return;
    this.revoke();
    if (next) this.adoption.activateProject(next);
    this.projectId = next;
  }
  revoke(): void {
    this.adoption.cancel();
    for (const controller of this.pending.values()) controller.abort();
    this.pending.clear();
    this.descriptors.clear();
    this.projectId = null;
  }
  cancel(value: unknown): void {
    const input = decodeRecord(value, 'source cancellation');
    if (
      input.projectId !== this.projectId ||
      typeof input.requestId !== 'string'
    )
      return;
    this.pending.get(input.requestId)?.abort();
  }
  private scope(value: unknown): Record<string, unknown> {
    const input = decodeRecord(value, 'source operation');
    decodeUuid(input.projectId, 'project id');
    return input;
  }
  private unavailable(requestId: string) {
    return this.options.authenticated()
      ? {
          outcome: 'unavailable' as const,
          requestId,
          message: SOURCING_PUBLIC_MESSAGES.unavailable,
          retryable: true,
        }
      : {
          outcome: 'unauthenticated' as const,
          requestId,
          message: SOURCING_PUBLIC_MESSAGES.unauthenticated,
        };
  }
  async discover(value: unknown): Promise<SourceDiscoveryResult> {
    const input = this.scope(value);
    const request = parseDiscoverSourcesRequest(input.request);
    const stale = {
      outcome: 'stale-project' as const,
      requestId: request.requestId,
    };
    if (input.projectId !== this.projectId) return stale;
    if (
      !this.options.authenticated() ||
      !this.options.transport ||
      this.pending.has(request.requestId) ||
      this.pending.size >= 2
    )
      return this.unavailable(request.requestId);
    const controller = new AbortController();
    this.pending.set(request.requestId, controller);
    try {
      const value_ = await this.options.transport.discover(
        request,
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        input.projectId !== this.projectId ||
        !this.options.authenticated()
      )
        return stale;
      const result = parseDiscoverSourcesResponse(value_, request);
      if (result.outcome === 'success' || result.outcome === 'partial') {
        this.descriptors.clear();
        for (const candidate of result.candidates)
          this.descriptors.set(candidate.sourceId, candidate);
      }
      return result;
    } catch {
      return controller.signal.aborted
        ? stale
        : this.unavailable(request.requestId);
    } finally {
      if (this.pending.get(request.requestId) === controller)
        this.pending.delete(request.requestId);
    }
  }
  async acquire(value: unknown): Promise<SourceAcquisitionResult> {
    const input = this.scope(value);
    const request = parseAcquireCanonicalSourceRequest(input.request);
    const stale = {
      outcome: 'stale-project' as const,
      requestId: request.requestId,
    };
    if (input.projectId !== this.projectId) return stale;
    if (
      !this.options.authenticated() ||
      !this.options.transport ||
      this.pending.has(request.requestId) ||
      this.pending.size >= 2
    )
      return this.unavailable(request.requestId);
    const descriptor =
      this.descriptors.get(request.sourceId) ??
      this.retainedDescriptor(request.sourceId);
    if (
      !descriptor?.providerIds.some(
        (identity) =>
          identity.provider === request.providerIdentity.provider &&
          identity.id === request.providerIdentity.id,
      )
    )
      return {
        outcome: 'not-permitted',
        requestId: request.requestId,
        decision: 'unknown',
        message: SOURCING_PUBLIC_MESSAGES.notPermitted,
      };
    const controller = new AbortController();
    const pending = this.adoption.beginAcquisition({
      projectId: input.projectId,
      request,
    });
    controller.signal.addEventListener('abort', () => pending.cancel(), {
      once: true,
    });
    this.pending.set(request.requestId, controller);
    try {
      const value_ = await this.options.transport.acquire(
        request,
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        input.projectId !== this.projectId ||
        !this.options.authenticated()
      )
        return stale;
      const response = parseAcquireCanonicalSourceResponse(value_, request);
      const saved = pending.accept(response);
      if (saved.status === 'cancelled') return stale;
      if (saved.status === 'not-acquired') return saved.response;
      if (response.outcome !== 'success')
        return { outcome: 'save-failed', requestId: request.requestId };
      this.descriptors.set(response.source.sourceId, response.source);
      return {
        outcome: 'saved',
        requestId: request.requestId,
        source: response.source,
        saved: {
          projectId: saved.acknowledgement.projectId,
          sourceId: saved.record.id,
          revisionId: saved.acknowledgement.revisionId!,
        },
      };
    } catch {
      return controller.signal.aborted
        ? stale
        : { outcome: 'save-failed', requestId: request.requestId };
    } finally {
      pending.cancel();
      if (this.pending.get(request.requestId) === controller)
        this.pending.delete(request.requestId);
    }
  }
  async generate(value: unknown): Promise<SourceGenerationResult> {
    const input = this.scope(value);
    if (
      typeof input.requestId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(input.requestId) ||
      input.consent !== 'acquire-learning-evidence'
    )
      throw new Error('Approve learning evidence acquisition first.');
    const requestId = input.requestId;
    const stale = { outcome: 'stale-project' as const, requestId };
    if (input.projectId !== this.projectId) return stale;
    if (
      !this.options.authenticated() ||
      !this.options.transport?.generate ||
      this.pending.has(requestId) ||
      this.pending.size >= 2
    )
      return { outcome: 'unavailable', requestId };
    const projectId = this.projectId;
    const controller = new AbortController();
    this.pending.set(requestId, controller);
    try {
      const response = await this.options.transport.generate(
        {
          apiVersion: LEARNING_API_VERSION,
          requestId,
          model: LEARNING_MODEL_ALLOWLIST[0],
          operation: {
            kind: 'generate-learning-path',
            goal: this.options.store.getLearningWorkspace(projectId).project
              .goal,
            sources: [],
            learnerContext: [],
          },
        },
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        projectId !== this.projectId ||
        !this.options.authenticated()
      )
        return stale;
      const result = decodeRecord(response, 'sourced learning response');
      if (result.requestId !== requestId)
        return { outcome: 'save-failed', requestId };
      if (result.outcome === 'coverage-pending')
        return { outcome: 'coverage-pending', requestId };
      const saved = this.options.store.acceptSourcedLearning({
        projectId,
        requestId,
        response,
      });
      if (saved.status !== 'committed')
        return { outcome: 'save-failed', requestId };
      return {
        outcome: 'saved',
        requestId,
        pathId: saved.record.id,
        pathRevision: saved.record.currentRevision,
      };
    } catch {
      return controller.signal.aborted
        ? stale
        : { outcome: 'save-failed', requestId };
    } finally {
      if (this.pending.get(requestId) === controller)
        this.pending.delete(requestId);
    }
  }
  async openOriginal(value: unknown): Promise<'opened' | 'unavailable'> {
    const input = this.scope(value);
    if (
      input.projectId !== this.projectId ||
      typeof input.sourceId !== 'string'
    )
      return 'unavailable';
    const identity = decodeRecord(input.providerIdentity, 'provider identity');
    const descriptor =
      this.descriptors.get(input.sourceId) ??
      this.retainedDescriptor(input.sourceId);
    if (
      !descriptor ||
      !descriptor.providerIds.some(
        (item) =>
          item.provider === identity.provider && item.id === identity.id,
      )
    )
      return 'unavailable';
    // Only a retained/validated provider descriptor can supply navigation authority.
    const url = new URL(descriptor.originalLocation.url);
    if (url.protocol !== 'https:' || url.username || url.password)
      return 'unavailable';
    try {
      await this.options.openOriginal(url.href);
      return 'opened';
    } catch {
      return 'unavailable';
    }
  }
  private retainedDescriptor(sourceId: string): SourceDescriptor | undefined {
    if (!this.projectId) return;
    for (const source of this.options.store.getLearningWorkspace(this.projectId)
      .sources) {
      for (const version of source.versions) {
        const provenance = version.provenance;
        if (
          provenance.kind === 'discovered' &&
          provenance.remoteSourceId === sourceId
        )
          return provenance.descriptor;
      }
    }
    return;
  }
}
