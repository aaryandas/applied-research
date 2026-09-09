import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMPANION_BACKEND_API_VERSION,
  CompanionEnvelopeError,
  decodeCompanionBackendEnvelope,
  failureReply,
} from './envelope.js';

const requestId = '31000000-0000-4000-8000-000000000001';
const projectId = '10000000-0000-4000-8000-000000000001';
const canonicalText = 'Shear the basis and compare the image.';
const sha256 = createHash('sha256').update(canonicalText, 'utf8').digest('hex');
const acquiredAt = '2026-09-09T08:00:00.000Z';

function companionEnvelope(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    apiVersion: COMPANION_BACKEND_API_VERSION,
    requestId,
    projectId,
    projectGeneration: 1,
    requestGeneration: 0,
    cause: 'ask-once',
    question: 'What happens if I shear the basis?',
    grounding: 'source',
    source: {
      sourceId: 'source-01',
      revisionId: 'revision01',
      title: 'Linear maps',
      canonicalText,
      sha256,
      format: 'plain-text',
      canonicalizationVersion: 'workspace-plain-v1',
      acquiredAt,
      provenance: { kind: 'human-imported', locator: null },
    },
    excerpt: { start: 0, end: 15, quote: canonicalText.slice(0, 15) },
    learnerContext: [],
    ...overrides,
  };
}

describe('companion backend envelope', () => {
  it('accepts a hash-verified source-grounded envelope and app-context material', () => {
    expect(
      decodeCompanionBackendEnvelope(companionEnvelope()).source.sha256,
    ).toBe(sha256);
    const app = decodeCompanionBackendEnvelope(
      companionEnvelope({
        grounding: 'app-context',
        excerpt: null,
        cause: 'activity-start',
        source: {
          sourceId: 'companion-app-context',
          revisionId: requestId,
          title: 'Application control description',
          canonicalText: 'Reset matrix · supported app control',
          sha256: createHash('sha256')
            .update('Reset matrix · supported app control', 'utf8')
            .digest('hex'),
          format: 'plain-text',
          canonicalizationVersion: 'workspace-plain-v1',
          acquiredAt,
          provenance: { kind: 'human-imported', locator: null },
        },
      }),
    );
    expect(app.grounding).toBe('app-context');
    expect(app.excerpt).toBeNull();
  });

  it('rejects renderer authority keys, hash mismatches, and non-matching excerpts', () => {
    expect(() =>
      decodeCompanionBackendEnvelope(companionEnvelope({ account: 'secret' })),
    ).toThrow(CompanionEnvelopeError);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          source: {
            ...(companionEnvelope().source as object),
            sha256: 'd'.repeat(64),
          },
        }),
      ),
    ).toThrow(/integrity/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          excerpt: { start: 0, end: 4, quote: 'nope' },
        }),
      ),
    ).toThrow(/excerpt/);
  });

  it('rejects unsupported versions and causes', () => {
    try {
      decodeCompanionBackendEnvelope(
        companionEnvelope({ apiVersion: '1999-01-01' }),
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ outcome: 'unsupported', requestId });
    }
    try {
      decodeCompanionBackendEnvelope(
        companionEnvelope({ cause: 'tool-navigation' }),
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ outcome: 'unsupported' });
    }
  });

  it('accepts a hash-verified https locator and bounded learner context', () => {
    const decoded = decodeCompanionBackendEnvelope(
      companionEnvelope({
        source: {
          ...(companionEnvelope().source as object),
          provenance: {
            kind: 'human-imported',
            locator: 'https://example.test/paper',
          },
        },
        learnerContext: [
          {
            id: 'note-item01',
            kind: 'human-note',
            text: 'I changed one entry.',
          },
        ],
      }),
    );
    expect(decoded.source.provenance.locator).toBe(
      'https://example.test/paper',
    );
    expect(decoded.learnerContext).toHaveLength(1);
  });

  it('rejects extra keys, bad generations, and non-https locators', () => {
    expect(() =>
      decodeCompanionBackendEnvelope(companionEnvelope({ extra: true })),
    ).toThrow(CompanionEnvelopeError);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          projectGeneration: 1.5,
          requestGeneration: 0,
        }),
      ),
    ).toThrow(/generation/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          source: {
            ...(companionEnvelope().source as object),
            provenance: {
              kind: 'human-imported',
              locator: 'http://example.test/paper',
            },
          },
        }),
      ),
    ).toThrow(/locator/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          excerpt: {
            start: 0,
            end: 15,
            quote: canonicalText.slice(0, 15),
            extra: 1,
          },
        }),
      ),
    ).toThrow(/excerpt/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({ learnerContext: [{ extra: true }] }),
      ),
    ).toThrow(/context/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({ grounding: 'guest-page' }),
      ),
    ).toThrow(/grounding/);
    expect(() =>
      decodeCompanionBackendEnvelope(companionEnvelope({ question: '' })),
    ).toThrow(/question/);
  });

  it('bounds failure copy', () => {
    expect(failureReply('unavailable', null, '')).toMatchObject({
      message: 'Companion guidance is unavailable.',
    });
    expect(failureReply('unavailable', null, 'x'.repeat(401))).toMatchObject({
      message: 'Companion guidance is unavailable.',
    });
  });

  it('rejects non-records, missing identity, and oversized learner context', () => {
    expect(() => decodeCompanionBackendEnvelope(null)).toThrow(
      CompanionEnvelopeError,
    );
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          projectId: 'not-a-uuid',
        }),
      ),
    ).toThrow(/identity/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          learnerContext: Array.from({ length: 13 }, (_, index) => ({
            id: `noteitem${index + 10}`,
            kind: 'human-note',
            text: 'note',
          })),
        }),
      ),
    ).toThrow(/context/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          source: 'plain',
        }),
      ),
    ).toThrow(/source/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          excerpt: 'quote',
        }),
      ),
    ).toThrow(/excerpt/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          source: {
            ...(companionEnvelope().source as object),
            acquiredAt: 'yesterday',
          },
        }),
      ),
    ).toThrow(/integrity/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          source: {
            ...(companionEnvelope().source as object),
            extra: true,
          },
        }),
      ),
    ).toThrow(/source/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          source: {
            ...(companionEnvelope().source as object),
            provenance: {
              kind: 'human-imported',
              locator: null,
              account: 'nope',
            },
          },
        }),
      ),
    ).toThrow(/provenance/);
    expect(() =>
      decodeCompanionBackendEnvelope(
        companionEnvelope({
          learnerContext: [
            {
              id: 'noteitem01',
              kind: 'human-note',
              text: 'x',
              url: 'https://x.test',
            },
          ],
        }),
      ),
    ).toThrow(/context/);
  });
});
