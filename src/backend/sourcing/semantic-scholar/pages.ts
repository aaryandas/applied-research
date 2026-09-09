import type { SemanticScholarPaper, SemanticScholarResult } from './types.js';
import { isRecord, normalizePaper } from './normalize.js';
import { providerFailure, publicIssue } from './transport.js';

const MAX_PAGES = 3;
const PAGE_SIZE = 10;
const MAX_OFFSET = 1000;

export interface PageRequest {
  url: URL;
  limit: number;
  observedAt: string;
  result: SemanticScholarResult;
  readPaper?: (value: unknown) => unknown;
  onPaper?: (paper: SemanticScholarPaper) => void;
  fetchJson: (url: URL) => Promise<unknown>;
}

export function appendPaper(
  result: SemanticScholarResult,
  paper: SemanticScholarPaper,
): void {
  const fields = [...Object.values(paper), ...Object.values(paper.identifiers)];
  if (fields.some((field) => isRecord(field) && field.absence === 'invalid'))
    result.issues.push(publicIssue(providerFailure('invalid-response')));
  if (
    !result.papers.some((existing) => existing.snapshotId === paper.snapshotId)
  )
    result.papers.push(paper);
}

export async function collectPages(options: PageRequest): Promise<void> {
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const limit = Math.min(
      PAGE_SIZE,
      options.limit - options.result.papers.length,
    );
    const url = new URL(options.url);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(limit));
    const envelope = await options.fetchJson(url);
    if (
      !isRecord(envelope) ||
      !Array.isArray(envelope.data) ||
      envelope.data.length > limit ||
      envelope.offset !== offset
    )
      throw providerFailure('invalid-response');
    for (const value of envelope.data) {
      const paper = normalizePaper(
        options.readPaper ? options.readPaper(value) : value,
        options.observedAt,
      );
      if (paper) {
        appendPaper(options.result, paper);
        options.onPaper?.(paper);
      } else
        options.result.issues.push(
          publicIssue(providerFailure('invalid-response')),
        );
    }
    if (envelope.next === undefined || envelope.next === null) return;
    if (
      !Number.isSafeInteger(envelope.next) ||
      typeof envelope.next !== 'number' ||
      envelope.next <= offset ||
      envelope.next !== offset + envelope.data.length ||
      envelope.next > MAX_OFFSET
    )
      throw providerFailure('invalid-response');
    if (options.result.papers.length >= options.limit) return;
    offset = envelope.next;
  }
  throw providerFailure('limit-reached');
}
