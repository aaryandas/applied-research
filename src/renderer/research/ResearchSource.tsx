import { useRef, useState, type ReactElement } from 'react';
import {
  SOURCING_API_VERSION,
  type MetadataOnlySource,
} from '../../contracts/sourcing';
import type {
  ResearchCallbacks,
  ResearchOperation,
  ResearchAdoptionResult,
  ResearchLinkTarget,
} from './research-contract';
import {
  AVAILABILITY_LABELS,
  acquiredVersion,
  canAcquire,
  isAbstract,
  providerName,
  researchMessage,
  sourceAvailability,
} from './research-presentation';

type SavedResult = Extract<ResearchAdoptionResult, { outcome: 'saved' }>;

interface ResearchSourceProps {
  source: MetadataOnlySource;
  operation: Omit<ResearchOperation, 'signal'>;
  callbacks: ResearchCallbacks;
  /** `open` is false when the commit landed after the learner cancelled. */
  onSaved: (result: SavedResult, open: boolean) => Promise<void>;
  saved: SavedResult | undefined;
  onOpenSaved: () => Promise<void>;
  opening: boolean;
  acquiring: boolean;
  permissionDenied: boolean;
  acquisitionMessage: string;
  retainAcquisition: (controller: AbortController) => () => void;
  onCancelAcquisition: () => void;
  onPermissionDenied: () => void;
  onAcquisitionMessage: (message: string) => void;
}

export function ResearchSource({
  source,
  operation,
  callbacks,
  onSaved,
  saved,
  onOpenSaved,
  opening,
  acquiring,
  permissionDenied,
  acquisitionMessage,
  retainAcquisition,
  onCancelAcquisition,
  onPermissionDenied,
  onAcquisitionMessage,
}: Readonly<ResearchSourceProps>): ReactElement {
  const [linkMessage, setLinkMessage] = useState('');
  const message = acquisitionMessage || linkMessage;
  const acquisitionAllowed = canAcquire(source) && !permissionDenied && !saved;
  const acquireButton = useRef<HTMLButtonElement>(null);
  const pending = useRef<AbortController | null>(null);
  const providerIdentity = source.providerIds[0];
  async function acquire(): Promise<void> {
    if (pending.current || acquiring || !providerIdentity) return;
    const controller = new AbortController();
    pending.current = controller;
    const release = retainAcquisition(controller);
    setLinkMessage('');
    onAcquisitionMessage('');
    const requestId = crypto.randomUUID();
    try {
      const result = await callbacks.onAcquireAndSave(
        {
          apiVersion: SOURCING_API_VERSION,
          requestId,
          sourceId: source.sourceId,
          providerIdentity,
        },
        { ...operation, signal: controller.signal },
      );
      // A commit can land after the learner cancelled; it is still a real
      // local revision, so it is recorded but not opened.
      const aborted = controller.signal.aborted;
      const wrongRequest =
        result.requestId !== null && result.requestId !== requestId;
      const wrongSource =
        result.outcome === 'saved' &&
        (result.saved.projectId !== operation.context.projectId ||
          result.source.sourceId !== source.sourceId ||
          result.source.content.revision.sourceId !== source.sourceId);
      if (wrongRequest || wrongSource) {
        if (!aborted)
          onAcquisitionMessage(
            'The saved source did not match this request. Search again.',
          );
        return;
      }
      if (result.outcome === 'saved') {
        if (pending.current === controller) pending.current = null;
        release();
        if (aborted) onAcquisitionMessage('');
        await onSaved(result, !aborted);
      } else if (!aborted) {
        if (result.outcome === 'not-permitted') onPermissionDenied();
        onAcquisitionMessage(researchMessage(result));
      }
    } catch {
      if (!controller.signal.aborted)
        onAcquisitionMessage(
          'The source could not be saved. Try acquiring it again.',
        );
    } finally {
      release();
      setLinkMessage('');
      if (pending.current === controller) pending.current = null;
    }
  }
  function cancelAcquisition(): void {
    pending.current = null;
    onCancelAcquisition();
    // The learner cancelled, so return focus here; a shell-side `cancelled`
    // outcome for a request they did not cancel must not steal focus.
    acquireButton.current?.focus();
  }
  async function openOriginal(target: ResearchLinkTarget): Promise<void> {
    try {
      setLinkMessage(
        (await callbacks.onOpenOriginal(target)) === 'opened'
          ? ''
          : 'The original link is unavailable.',
      );
    } catch {
      setLinkMessage('The original link is unavailable.');
    }
  }
  const abstract = isAbstract(source);
  const availability = sourceAvailability(source, {
    saved: saved !== undefined,
    acquiring,
    permissionDenied,
  });
  return (
    <article className="research-source">
      <h3>{source.title}</h3>
      <p className="research-source-kind">
        {source.kind} ·{' '}
        {source.providerIds.map((id) => providerName(id.provider)).join(', ') ||
          'Provider not recorded'}
      </p>
      <p>
        {source.authorship.kind === 'authored'
          ? source.authorship.creators.join(', ') || 'Authors not recorded'
          : `AI-generated by ${source.authorship.generator}`}
      </p>
      <dl className="research-metadata">
        <div>
          <dt>Published</dt>
          <dd>{source.publicationDate ?? 'Date not recorded'}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>
            {saved
              ? acquiredVersion(saved.source.content.revision)
              : 'Version not acquired'}
          </dd>
        </div>
        <div>
          <dt>Access</dt>
          <dd>{source.usePolicy.access.replaceAll('-', ' ')}</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>
            {source.usePolicy.license.status === 'known'
              ? source.usePolicy.license.name
              : 'Not recorded'}
          </dd>
        </div>
      </dl>
      <p className="research-availability">
        {AVAILABILITY_LABELS[availability]}
      </p>
      {source.metadataSummary && (
        <details>
          <summary>
            {abstract ? 'Read abstract' : 'Read provider metadata'}
          </summary>
          <p className="research-abstract">{source.metadataSummary}</p>
          <p>
            {saved
              ? 'Provider metadata, separate from the acquired text.'
              : 'Provider metadata only. Full text has not been read.'}
          </p>
        </details>
      )}
      <details>
        <summary>Source provenance</summary>
        <dl>
          <div>
            <dt>Original source</dt>
            <dd>{source.originalLocation.url}</dd>
          </div>
          <div>
            <dt>Discovered</dt>
            <dd>{source.discoveredAt}</dd>
          </div>
          {saved && (
            <div>
              <dt>Saved version</dt>
              <dd>{saved.saved.revisionId}</dd>
            </div>
          )}
          {source.scholarlyIdentity.doi && (
            <div>
              <dt>DOI</dt>
              <dd>{source.scholarlyIdentity.doi}</dd>
            </div>
          )}
          {source.scholarlyIdentity.arxivId && (
            <div>
              <dt>arXiv</dt>
              <dd>{source.scholarlyIdentity.arxivId}</dd>
            </div>
          )}
        </dl>
      </details>
      {source.relationships.length > 0 && (
        <section aria-label="Related source material">
          <h4>Related material</h4>
          <ul>
            {source.relationships.map((relationship) => {
              const parentIdentity = relationship.parentProviderIds[0];
              return (
                <li key={`${relationship.kind}:${relationship.parentSourceId}`}>
                  <p>
                    {relationship.kind.replaceAll('-', ' ')}
                    {parentIdentity &&
                      ` · ${providerName(parentIdentity.provider)}`}
                  </p>
                  {parentIdentity && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void openOriginal({
                          projectId: operation.context.projectId,
                          sourceId: relationship.parentSourceId,
                          providerIdentity: parentIdentity,
                        })
                      }
                    >
                      Open related source
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className="research-actions">
        {saved && (
          <button
            className="secondary"
            aria-disabled={opening}
            onClick={() => void onOpenSaved()}
          >
            Open saved version
          </button>
        )}
        {acquisitionAllowed && (
          <button
            ref={acquireButton}
            className="secondary"
            aria-disabled={acquiring}
            onClick={() => void acquire()}
          >
            {acquiring ? 'Acquiring and saving…' : 'Acquire & read'}
          </button>
        )}
        {acquiring && (
          <button className="text-button" onClick={cancelAcquisition}>
            Cancel acquisition
          </button>
        )}
        {providerIdentity && (
          <button
            className="text-button"
            onClick={() =>
              void openOriginal({
                projectId: operation.context.projectId,
                sourceId: source.sourceId,
                providerIdentity,
              })
            }
          >
            Open original link
          </button>
        )}
      </div>
      {!acquisitionAllowed && !saved && (
        <p className="research-muted">
          Link only. Readable text and acquisition permission are required
          before saving a source in Reader.
        </p>
      )}
      {message && <p role="alert">{message}</p>}
    </article>
  );
}
