import { normalizeArxiv, normalizeDoi, normalizePaper } from './normalize.js';
import { appendPaper } from './pages.js';
import { providerFailure, publicIssue } from './transport.js';
import type { SemanticScholarResult } from './types.js';

const BATCH_SIZE = 10;

export interface LookupPapersRequest {
  requestId: string;
  ids: string[];
}

export function normalizeLookupId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^[a-f\d]{40}$/i.test(value)) return value.toLowerCase();
  if (/^CorpusId:\d{1,16}$/i.test(value))
    return `CorpusId:${BigInt(value.slice(9))}`;
  const doi = normalizeDoi(value);
  if (doi) return `DOI:${doi}`;
  const arxiv = normalizeArxiv(value);
  return arxiv ? `ARXIV:${arxiv}` : null;
}

export interface BatchLookup {
  ids: string[];
  result: SemanticScholarResult;
  observedAt: string;
  fetchBatch: (ids: string[]) => Promise<unknown>;
}

export async function collectBatches(options: BatchLookup): Promise<void> {
  for (let offset = 0; offset < options.ids.length; offset += BATCH_SIZE) {
    const ids = options.ids.slice(offset, offset + BATCH_SIZE);
    const response = await options.fetchBatch(ids);
    if (!Array.isArray(response) || response.length !== ids.length)
      throw providerFailure('invalid-response');
    for (const value of response) {
      if (value === null) {
        options.result.issues.push(publicIssue(providerFailure('not-found')));
        continue;
      }
      const paper = normalizePaper(value, options.observedAt);
      if (paper) appendPaper(options.result, paper);
      else
        options.result.issues.push(
          publicIssue(providerFailure('invalid-response')),
        );
    }
  }
}
