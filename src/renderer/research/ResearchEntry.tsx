import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  SOURCE_KINDS,
  SOURCING_API_VERSION,
  SOURCING_LIMITS,
  SOURCING_PUBLIC_MESSAGES,
  type ProviderIssue,
  type SourceDiscoveryProvider,
  type MetadataOnlySource,
} from '../../contracts/sourcing';
import type {
  ResearchAdoptionResult,
  ResearchEntryProps,
  ResearchOperation,
} from './research-contract';
import { ResearchSource } from './ResearchSource';
import './research.css';
import {
  acquiredVersion,
  providerName,
  researchMessage,
  retryDelay,
} from './research-presentation';

type SavedResult = Extract<ResearchAdoptionResult, { outcome: 'saved' }>;
const OPENING_MESSAGE = 'Opening the saved version in Reader…';
const SAVED_REFERENCE_HINT =
  'Open it from Saved references when you are ready.';
interface SavedReference {
  result: SavedResult;
  operation: Omit<ResearchOperation, 'signal'>;
}

export function ResearchEntry(
  props: Readonly<ResearchEntryProps>,
): ReactElement {
  return <ProjectResearch key={props.context.projectId} {...props} />;
}

function ProjectResearch(props: Readonly<ResearchEntryProps>): ReactElement {
  const [question, setQuestion] = useState(props.initialQuestion ?? '');
  const [results, setResults] = useState<{
    sources: MetadataOnlySource[];
    operation: Omit<ResearchOperation, 'signal'>;
  } | null>(null);
  const [references, setReferences] = useState<SavedReference[]>([]);
  const [message, setMessage] = useState('');
  const [issues, setIssues] = useState<
    ProviderIssue<SourceDiscoveryProvider>[]
  >([]);
  const [noResults, setNoResults] = useState(false);
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const acquisitions = useRef(new Map<string, AbortController>());
  const [acquiringIds, setAcquiringIds] = useState<readonly string[]>([]);
  const [deniedIds, setDeniedIds] = useState<readonly string[]>([]);
  const [sourceAlerts, setSourceAlerts] = useState<
    Readonly<Record<string, string>>
  >({});
  const questionField = useRef<HTMLTextAreaElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      for (const controller of acquisitions.current.values())
        controller.abort();
    },
    [],
  );
  function setSourceAlert(sourceId: string, message: string): void {
    setSourceAlerts((current) => {
      if ((current[sourceId] ?? '') === message) return current;
      if (!message) {
        return Object.fromEntries(
          Object.entries(current).filter(([id]) => id !== sourceId),
        );
      }
      return { ...current, [sourceId]: message };
    });
  }
  function releaseAcquisition(
    sourceId: string,
    controller: AbortController,
  ): void {
    if (acquisitions.current.get(sourceId) !== controller) return;
    acquisitions.current.delete(sourceId);
    setAcquiringIds((ids) =>
      ids.includes(sourceId) ? ids.filter((id) => id !== sourceId) : ids,
    );
  }
  function retainAcquisition(
    sourceId: string,
    controller: AbortController,
  ): () => void {
    acquisitions.current.set(sourceId, controller);
    setAcquiringIds((ids) =>
      ids.includes(sourceId) ? ids : [...ids, sourceId],
    );
    return () => releaseAcquisition(sourceId, controller);
  }
  function cancelAcquisition(sourceId: string): void {
    const controller = acquisitions.current.get(sourceId);
    if (!controller) return;
    controller.abort();
    releaseAcquisition(sourceId, controller);
    setSourceAlert(sourceId, SOURCING_PUBLIC_MESSAGES.cancelled);
  }
  function denyAcquisition(sourceId: string): void {
    setDeniedIds((ids) => (ids.includes(sourceId) ? ids : [...ids, sourceId]));
  }
  useLayoutEffect(() => {
    if (results) resultsHeading.current?.focus();
  }, [results]);
  const [searching, setSearching] = useState(false);
  async function discover(): Promise<void> {
    const query = question.trim();
    if (
      pending.current ||
      !query ||
      query.length > SOURCING_LIMITS.queryCharacters
    )
      return;
    const controller = new AbortController();
    pending.current = controller;
    setSearching(true);
    setMessage('');
    setIssues([]);
    setNoResults(false);
    setResults(null);
    setDeniedIds([]);
    setSourceAlerts({});
    const operation = {
      context: structuredClone(props.context),
      question: query,
    };
    const requestId = crypto.randomUUID();
    try {
      const response = await props.onDiscover(
        {
          apiVersion: SOURCING_API_VERSION,
          requestId,
          intent: 'research',
          query,
          kinds: [...SOURCE_KINDS],
          limit: 20,
        },
        { ...operation, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (response.requestId !== null && response.requestId !== requestId) {
        setMessage(
          'The source response did not match this request. Search again.',
        );
        return;
      }
      const found =
        response.outcome === 'success' || response.outcome === 'partial';
      if (response.outcome === 'partial') setIssues(response.issues);
      if (found && response.candidates.length > 0) {
        setResults({ sources: response.candidates, operation });
        if (response.outcome === 'partial')
          setMessage(
            'Partial results. Some providers could not return sources.',
          );
      } else {
        const empty = found || response.outcome === 'no-results';
        setNoResults(empty);
        setMessage(
          empty
            ? SOURCING_PUBLIC_MESSAGES.noResults
            : researchMessage(response),
        );
        questionField.current?.focus();
      }
    } catch {
      if (!controller.signal.aborted)
        setMessage(SOURCING_PUBLIC_MESSAGES.unavailable);
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setSearching(false);
      }
    }
  }
  function cancelSearch(): void {
    pending.current?.abort();
    pending.current = null;
    setSearching(false);
    setMessage(SOURCING_PUBLIC_MESSAGES.cancelled);
    questionField.current?.focus();
  }
  async function openReference(reference: SavedReference): Promise<void> {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setMessage(OPENING_MESSAGE);
    const { result, operation } = reference;
    try {
      const outcome = await props.onOpenReader({
        ...result.saved,
        question: operation.question,
        origin: operation.context.origin,
      });
      const messages = {
        blocked:
          'Save your current work before opening Reader. Your reference is saved.',
        'missing-source':
          'This saved source version is missing. It has not been replaced with another version.',
        'stale-project':
          'This project changed. Search again in the current project.',
      };
      // A source saved while this open was in flight has already replaced the
      // opening notice with where to find it; keep that.
      if (outcome === 'opened')
        setMessage((current) => (current === OPENING_MESSAGE ? '' : current));
      else setMessage(messages[outcome]);
    } catch {
      setMessage(
        'Reader could not open this version. Your reference is saved; try again.',
      );
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }
  async function saveReference(
    result: SavedResult,
    operation: Omit<ResearchOperation, 'signal'>,
    open: boolean,
  ): Promise<void> {
    const reference = { result, operation };
    setReferences((current) => [
      ...current.filter(
        (entry) => entry.result.saved.revisionId !== result.saved.revisionId,
      ),
      reference,
    ]);
    if (open && !openingRef.current) return openReference(reference);
    // Reader navigation is serialized while the shell flushes drafts; a second
    // saved source is recorded and the learner is told where it is.
    setMessage(
      `${
        open
          ? 'This source was saved while Reader was opening another version.'
          : 'This source was saved before the cancellation took effect.'
      } ${SAVED_REFERENCE_HINT}`,
    );
  }
  return (
    <section className="research-entry" aria-label="Research">
      <header>
        <h1>Research</h1>
        <p>Follow a question into papers and learning material.</p>
      </header>
      <form
        aria-label="Find research sources"
        onSubmit={(event) => {
          event.preventDefault();
          void discover();
        }}
      >
        <label>
          Research question
          <textarea
            ref={questionField}
            readOnly={searching}
            value={question}
            maxLength={SOURCING_LIMITS.queryCharacters}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <div className="research-actions">
          <button
            type="submit"
            className="primary"
            disabled={!question.trim()}
            aria-disabled={searching}
          >
            {searching ? 'Finding sources…' : 'Find sources'}
          </button>
          {searching && (
            <button
              type="button"
              className="text-button"
              onClick={cancelSearch}
            >
              Cancel search
            </button>
          )}
        </div>
      </form>
      <p role="status">{searching ? 'Finding sources…' : message}</p>
      {noResults && <p>Try a broader question or different terms.</p>}
      {issues.length > 0 && (
        <ul className="research-provider-issues">
          {issues.map((issue) => (
            <li key={issue.provider}>
              <p>
                {providerName(issue.provider)}:{' '}
                {issue.reason.replaceAll('-', ' ')}.
              </p>
              {issue.retryAfterMilliseconds !== null && (
                <p>{retryDelay(issue.retryAfterMilliseconds)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {references.length > 0 && (
        <section aria-label="Saved references" className="research-references">
          <h2>Saved references</h2>
          <p>
            Source material saved for reading. Your notes and insights stay in
            Reader.
          </p>
          {references.map((reference) => (
            <article key={reference.result.saved.revisionId}>
              <h3>{reference.result.source.title}</h3>
              <p>{acquiredVersion(reference.result.source.content.revision)}</p>
              <p>{reference.result.source.content.revision.extraction.note}</p>
              <details>
                <summary>Source provenance</summary>
                <dl>
                  <div>
                    <dt>Saved version</dt>
                    <dd>{reference.result.saved.revisionId}</dd>
                  </div>
                  <div>
                    <dt>Original source</dt>
                    <dd>{reference.result.source.originalLocation.url}</dd>
                  </div>
                </dl>
              </details>
              <button
                className="secondary"
                aria-disabled={opening}
                onClick={() => void openReference(reference)}
              >
                Open in Reader
              </button>
            </article>
          ))}
        </section>
      )}
      {results && (
        <section aria-label="Search results">
          <h2 tabIndex={-1} ref={resultsHeading}>
            Search results
          </h2>
          <p className="research-muted">
            Provider metadata matches for “{results.operation.question}”.
            Relevance has not been verified.
          </p>
          {results.sources.map((source) => (
            <ResearchSource
              key={source.sourceId}
              source={source}
              operation={results.operation}
              callbacks={props}
              opening={opening}
              acquiring={acquiringIds.includes(source.sourceId)}
              permissionDenied={deniedIds.includes(source.sourceId)}
              acquisitionMessage={sourceAlerts[source.sourceId] ?? ''}
              retainAcquisition={(controller) =>
                retainAcquisition(source.sourceId, controller)
              }
              onCancelAcquisition={() => cancelAcquisition(source.sourceId)}
              onPermissionDenied={() => denyAcquisition(source.sourceId)}
              onAcquisitionMessage={(message) =>
                setSourceAlert(source.sourceId, message)
              }
              onSaved={(result, open) =>
                saveReference(result, results.operation, open)
              }
              saved={
                references.find(
                  (reference) =>
                    reference.result.source.sourceId === source.sourceId,
                )?.result
              }
              onOpenSaved={async () => {
                const reference = references.find(
                  (entry) => entry.result.source.sourceId === source.sourceId,
                );
                if (reference) await openReference(reference);
              }}
            />
          ))}
        </section>
      )}
    </section>
  );
}
