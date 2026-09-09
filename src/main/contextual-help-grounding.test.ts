import { describe, expect, it } from 'vitest';
import { CONTEXTUAL_SOURCE_CHARACTER_LIMIT } from '../contracts/contextual-help';
import type { SourceVersion } from '../contracts/learning-records';
import {
  admitCanonicalizer,
  groundingForSource,
  learningRequestFitsNetwork,
  preferExcerptIfOversized,
  remapCitationToParent,
  sha256Utf8,
  tutorSourceInput,
} from './contextual-help-grounding';

const sourceId = '10000000-0000-4000-8000-000000000001';
const revisionId = '20000000-0000-4000-8000-000000000001';
const text = 'Attention is a weighted combination of values.';

function version(overrides: Partial<SourceVersion> = {}): SourceVersion {
  const canonicalText = overrides.canonicalText ?? text;
  return {
    revisionId,
    sourceId,
    revision: 1,
    title: 'Passage',
    canonicalText,
    sha256: sha256Utf8(canonicalText),
    format: 'plain-text',
    canonicalizationVersion: '1',
    acquiredAt: '2026-09-09T08:00:00.000Z',
    provenance: { kind: 'human-imported', locator: null },
    ...overrides,
  };
}

describe('contextual source grounding', () => {
  it('maps the stored local paste canonicalizer without changing bytes or hash', () => {
    expect(admitCanonicalizer('1')).toBe('workspace-plain-v1');
    expect(admitCanonicalizer('pdf-text-v1')).toBe('pdf-text-v1');
    expect(admitCanonicalizer('v2')).toBeNull();
    const source = version();
    const input = tutorSourceInput(source, groundingForSource(source, null));
    expect(input?.canonicalText).toBe(text);
    expect(input?.sha256).toBe(source.sha256);
    expect(input?.canonicalizationVersion).toBe('workspace-plain-v1');
  });

  it('records an exact parent hash and offsets for a bounded excerpt', () => {
    const source = version();
    const start = source.canonicalText.indexOf('weighted');
    const quote = 'weighted combination';
    const grounding = groundingForSource(source, {
      start,
      end: start + quote.length,
      quote,
    });
    expect(grounding).toEqual({
      kind: 'bounded-excerpt',
      sourceRevisionId: revisionId,
      sha256: source.sha256,
      start,
      end: start + quote.length,
      quote,
    });
    const input = tutorSourceInput(source, grounding);
    expect(input?.canonicalText).toBe(quote);
    expect(input?.sha256).toBe(sha256Utf8(quote));
    expect(input?.sha256).not.toBe(source.sha256);
  });

  it('does not silently truncate a long source under its original hash', () => {
    const canonicalText = 'α'.repeat(CONTEXTUAL_SOURCE_CHARACTER_LIMIT + 1);
    const source = version({
      canonicalText,
      sha256: sha256Utf8(canonicalText),
    });
    const grounding = groundingForSource(source, {
      start: 0,
      end: 1,
      quote: 'α',
    });
    expect(grounding.kind).toBe('unsupported-long-source');
    if (grounding.kind === 'unsupported-long-source') {
      expect(grounding.sha256).toBe(source.sha256);
      expect(grounding.characters).toBe(canonicalText.length);
    }
    expect(tutorSourceInput(source, grounding)).toBeNull();
  });

  it('falls back to the exact excerpt when a full source would exceed 64KiB', () => {
    const canonicalText = 'b'.repeat(48_000);
    const source = version({
      canonicalText,
      sha256: sha256Utf8(canonicalText),
      title: 'Huge',
    });
    const excerpt = { start: 0, end: 12, quote: 'b'.repeat(12) };
    const grounding = preferExcerptIfOversized(source, excerpt, (state) => {
      if (state.kind === 'full-canonical-source') {
        return JSON.stringify({
          padding: 'x'.repeat(20_000),
          text: canonicalText,
        });
      }
      return JSON.stringify({ quote: excerpt.quote });
    });
    expect(grounding.kind).toBe('bounded-excerpt');
    expect(learningRequestFitsNetwork('ok')).toBe(true);
  });

  it('remaps excerpt citations onto the parent revision and rejects mismatches', () => {
    const source = version();
    const start = source.canonicalText.indexOf('weighted');
    const quote = 'weighted combination';
    const grounding = groundingForSource(source, {
      start,
      end: start + quote.length,
      quote,
    });
    const mapped = remapCitationToParent(
      {
        sourceId,
        revisionId,
        start: 0,
        end: quote.length,
        quote,
      },
      grounding,
      source,
    );
    expect(mapped).toEqual({
      start,
      end: start + quote.length,
      quote,
    });
    expect(
      remapCitationToParent(
        {
          sourceId,
          revisionId,
          start: 0,
          end: 4,
          quote: 'nope',
        },
        grounding,
        source,
      ),
    ).toBeNull();
    expect(
      remapCitationToParent(
        {
          sourceId: '30000000-0000-4000-8000-000000000099',
          revisionId,
          start: 0,
          end: quote.length,
          quote,
        },
        grounding,
        source,
      ),
    ).toBeNull();
  });
});
