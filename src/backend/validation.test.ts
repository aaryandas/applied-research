import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseLearningRequest, RequestValidationError } from './validation.js';

const canonicalText = 'Exact 😀 canonical source text.';
const source = {
  sourceId: 'source-01',
  revisionId: 'revision-01',
  title: 'A source',
  canonicalText,
  sha256: createHash('sha256').update(canonicalText).digest('hex'),
  format: 'plain-text',
  canonicalizationVersion: 'version-01',
  acquiredAt: '2026-09-08T00:00:00.000Z',
  provenance: { kind: 'human-imported', locator: null },
};
const request = {
  apiVersion: '2026-09-08',
  requestId: 'request-01',
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'source-grounded-tutor',
    question: 'Explain the source.',
    sources: [source],
    learnerContext: [
      { id: 'context-01', kind: 'human-note', text: 'My own note.' },
    ],
  },
};

function withSourceText(text: string) {
  return {
    ...source,
    canonicalText: text,
    sha256: createHash('sha256').update(text).digest('hex'),
  };
}

describe('learning API request validation', () => {
  it('reconstructs a bounded request with explicit human/source provenance', () => {
    expect(parseLearningRequest(request)).toEqual(request);
  });

  it.each([
    { ...request, accountId: 'attacker' },
    {
      ...request,
      operation: { ...request.operation, arbitraryTool: { command: 'run' } },
    },
    {
      ...request,
      operation: {
        ...request.operation,
        sources: [{ ...source, sha256: 'a'.repeat(64) }],
      },
    },
    {
      ...request,
      operation: { ...request.operation, learnerContext: [{ kind: 'AI' }] },
    },
    {},
  ])(
    'rejects malformed, identity-bearing, or untrusted extra input',
    (input) => {
      expect(() => parseLearningRequest(input)).toThrow(RequestValidationError);
    },
  );

  it.each([
    { ...request, apiVersion: 'future' },
    { ...request, model: 'unapproved/model' },
    {
      ...request,
      operation: { kind: 'external-web-discovery', sources: [] },
    },
  ])('returns an explicit unsupported classification', (input) => {
    try {
      parseLearningRequest(input);
      throw new Error('Expected validation to fail.');
    } catch (error) {
      expect(error).toMatchObject({ outcome: 'unsupported' });
    }
  });

  it.each([
    null,
    [],
    { ...request, requestId: 'short' },
    { ...request, requestId: 'x'.repeat(101) },
    {
      ...request,
      operation: { ...request.operation, question: ' ' },
    },
    {
      ...request,
      operation: { ...request.operation, sources: [] },
    },
    {
      ...request,
      operation: {
        ...request.operation,
        sources: Array.from({ length: 5 }, (_, index) => ({
          ...source,
          sourceId: `source-${index.toString().padStart(2, '0')}`,
        })),
      },
    },
    {
      ...request,
      operation: { ...request.operation, sources: [source, source] },
    },
    {
      ...request,
      operation: { ...request.operation, learnerContext: null },
    },
    {
      ...request,
      operation: {
        ...request.operation,
        learnerContext: Array.from({ length: 13 }, (_, index) => ({
          id: `context-${index.toString().padStart(2, '0')}`,
          kind: 'human-note',
          text: 'note',
        })),
      },
    },
  ])('rejects request boundary case %#', (input) => {
    expect(() => parseLearningRequest(input)).toThrow(RequestValidationError);
  });

  it.each([
    { ...source, sha256: 'not-a-hash' },
    { ...source, format: 'binary' },
    { ...source, provenance: { kind: 'machine', locator: null } },
    {
      ...source,
      provenance: { kind: 'human-imported', locator: 'not a url' },
    },
    {
      ...source,
      provenance: { kind: 'human-imported', locator: 'http://example.com' },
    },
    {
      ...source,
      provenance: {
        kind: 'human-imported',
        locator: 'https://user:password@example.com',
      },
    },
    { ...source, acquiredAt: 'yesterday' },
    { ...source, canonicalizationVersion: '!' },
  ])('rejects invalid source metadata %#', (candidate) => {
    expect(() =>
      parseLearningRequest({
        ...request,
        operation: { ...request.operation, sources: [candidate] },
      }),
    ).toThrow(RequestValidationError);
  });

  it('accepts a normalized HTTPS locator and rejects aggregate context bounds', () => {
    const located = {
      ...source,
      provenance: {
        kind: 'human-imported',
        locator: 'https://example.com/source',
      },
    };
    expect(
      parseLearningRequest({
        ...request,
        operation: { ...request.operation, sources: [located] },
      }).operation.sources[0]?.provenance.locator,
    ).toBe('https://example.com/source');

    const longText = 'x'.repeat(25_000);
    expect(() =>
      parseLearningRequest({
        ...request,
        operation: {
          ...request.operation,
          sources: [
            withSourceText(longText),
            {
              ...withSourceText(longText),
              sourceId: 'source-02',
              revisionId: 'revision-02',
            },
          ],
        },
      }),
    ).toThrow(RequestValidationError);

    expect(() =>
      parseLearningRequest({
        ...request,
        operation: {
          ...request.operation,
          learnerContext: Array.from({ length: 5 }, (_, index) => ({
            id: `context-${index.toString().padStart(2, '0')}`,
            kind: 'human-note',
            text: 'x'.repeat(3_500),
          })),
        },
      }),
    ).toThrow(RequestValidationError);
  });

  it('rejects fields belonging to the other supported operation', () => {
    expect(() =>
      parseLearningRequest({
        ...request,
        operation: { ...request.operation, goal: 'unexpected' },
      }),
    ).toThrow(RequestValidationError);
    expect(() =>
      parseLearningRequest({
        ...request,
        operation: {
          kind: 'generate-learning-path',
          goal: 'Learn',
          question: 'unexpected',
          sources: [],
          learnerContext: [],
        },
      }),
    ).toThrow(RequestValidationError);
  });

  it.each([
    {
      ...request,
      operation: { ...request.operation, question: 'bad\uD800question' },
    },
    {
      ...request,
      operation: {
        ...request.operation,
        sources: [{ ...source, title: 'bad\u0000title' }],
      },
    },
    {
      ...request,
      operation: {
        ...request.operation,
        sources: [withSourceText('bad\u0000canonical text')],
      },
    },
    {
      ...request,
      operation: {
        ...request.operation,
        learnerContext: [
          { id: 'context-01', kind: 'human-note', text: 'bad\uDFFFnote' },
        ],
      },
    },
  ])('rejects non-scalar or PostgreSQL-incompatible remote text', (input) => {
    expect(() => parseLearningRequest(input)).toThrow(RequestValidationError);
  });
});
