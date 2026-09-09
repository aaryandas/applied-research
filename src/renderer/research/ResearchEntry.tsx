import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
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
import { providerName, researchMessage } from './research-presentation';

type SavedResult = Extract<ResearchAdoptionResult, { outcome: 'saved' }>;
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
  const acquisitions = useRef(new Set<AbortController>());
  const questionField = useRef<HTMLTextAreaElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      for (const controller of acquisitions.current) controller.abort();
    },
    [],
  );
  function retainAcquisition(controller: AbortController): () => void {
    acquisitions.current.add(controller);
    return () => {
      acquisitions.current.delete(controller);
    };
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
          kinds: ['paper', 'textbook', 'course', 'chapter', 'lecture'],
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
      if (response.outcome === 'success' || response.outcome === 'partial') {
        setResults({ sources: response.candidates, operation });
        if (response.outcome === 'partial') {
          setIssues(response.issues);
          setMessage(
            'Partial results. Some providers could not return sources.',
          );
        } else if (response.candidates.length === 0) {
          setNoResults(true);
          setMessage(SOURCING_PUBLIC_MESSAGES.noResults);
        }
      } else {
        setMessage(researchMessage(response));
        setNoResults(response.outcome === 'no-results');
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
    setMessage('Opening the saved version in Reader…');
    const { result, operation } = reference;
    try {
      const outcome = await props.onOpenReader({
        ...result.saved,
        question: operation.question,
        origin: operation.context.origin,
      });
      const messages = {
        opened: '',
        blocked:
          'Save your current work before opening Reader. Your reference is saved.',
        'missing-source':
          'This saved source version is missing. It has not been replaced with another version.',
        'stale-project':
          'This project changed. Search again in the current project.',
      };
      setMessage(messages[outcome]);
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
  ): Promise<void> {
    const reference = { result, operation };
    setReferences((current) => [
      ...current.filter(
        (entry) => entry.result.saved.revisionId !== result.saved.revisionId,
      ),
      reference,
    ]);
    await openReference(reference);
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
        <button type="submit" disabled={searching || !question.trim()}>
          {searching ? 'Finding sources…' : 'Find sources'}
        </button>
        {searching && (
          <button type="button" onClick={cancelSearch}>
            Cancel search
          </button>
        )}
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
                <p>
                  Suggested retry delay:{' '}
                  {Math.ceil(issue.retryAfterMilliseconds / 1000)} seconds.
                </p>
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
              <p>
                Acquired ·{' '}
                {reference.result.source.content.revision.extraction
                  .coverage === 'partial'
                  ? 'Partial text'
                  : 'Complete extraction'}
              </p>
              <p>Saved version: {reference.result.saved.revisionId}</p>
              <p>{reference.result.source.content.revision.extraction.note}</p>
              <button
                disabled={opening}
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
          {results.sources.map((source) => (
            <ResearchSource
              key={source.sourceId}
              source={source}
              operation={results.operation}
              callbacks={props}
              opening={opening}
              retainAcquisition={retainAcquisition}
              onSaved={(result) => saveReference(result, results.operation)}
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
