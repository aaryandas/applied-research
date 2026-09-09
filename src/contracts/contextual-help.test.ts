import { describe, expect, it } from 'vitest';
import { failureReason } from './contextual-contract-guards';
import {
  CONTEXTUAL_HELP_CONTRACT_VERSION,
  CONTEXTUAL_SOURCE_CHARACTER_LIMIT,
  decodeAiProvenance,
  decodeContextualHelpRequest,
  decodeContextualHelpResponse,
  decodeSourceGroundingState,
  isExactExcerptMapping,
  retainedOriginFromRequest,
} from './contextual-help';

const projectId = '10000000-0000-4000-8000-000000000001';
const requestId = '11000000-0000-4000-8000-000000000001';
const sourceRevisionId = '30000000-0000-4000-8000-000000000001';
const highlightId = '40000000-0000-4000-8000-000000000001';
const entryId = '80000000-0000-4000-8000-000000000001';
const sha256 =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const createdAt = '2026-09-09T08:00:00.000Z';

function request(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
    projectId,
    requestId,
    expectedProjectGeneration: 4,
    expectedRequestGeneration: 0,
    origin: {
      kind: 'source-highlight',
      sourceRevisionId,
      highlightId,
    },
    intent: 'text',
    question: { kind: 'human', text: 'Why does this identity hold?' },
    ...overrides,
  };
}

describe('contextual help request envelope', () => {
  it('accepts a human question over an exact highlight origin', () => {
    const decoded = decodeContextualHelpRequest(request());
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(retainedOriginFromRequest(decoded.value)).toEqual({
        ok: true,
        value: { sourceRevisionId, highlightId },
      });
    }
  });

  it('accepts a saved-question origin with an app-authored intent that is not a human question', () => {
    const decoded = decodeContextualHelpRequest(
      request({
        origin: { kind: 'saved-question', entry: { entryId, revision: 2 } },
        intent: 'visual',
        question: { kind: 'app-authored', intent: 'explain-this-visually' },
      }),
    );
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.question).toEqual({
        kind: 'app-authored',
        intent: 'explain-this-visually',
      });
      expect(retainedOriginFromRequest(decoded.value).ok).toBe(true);
    }
  });

  it('rejects renderer-attested account, provenance, URLs, code and trusted quotes', () => {
    expect(
      failureReason(
        decodeContextualHelpRequest(request({ accountId: projectId })),
      ),
    ).toBe('authority');
    expect(
      failureReason(
        decodeContextualHelpRequest(request({ provenance: { author: 'ai' } })),
      ),
    ).toBe('authority');
    expect(
      failureReason(
        decodeContextualHelpRequest(request({ url: 'https://example.test' })),
      ),
    ).toBe('authority');
    expect(
      failureReason(decodeContextualHelpRequest(request({ code: 'print(1)' }))),
    ).toBe('authority');
    expect(
      failureReason(
        decodeContextualHelpRequest(request({ shader: 'void main() {}' })),
      ),
    ).toBe('authority');
    expect(
      failureReason(
        decodeContextualHelpRequest(
          request({ model: 'google/gemini-3.8-flash' }),
        ),
      ),
    ).toBe('authority');
    expect(
      failureReason(
        decodeContextualHelpRequest(
          request({ trustedQuote: 'forged as authority' }),
        ),
      ),
    ).toBe('authority');
    expect(
      failureReason(
        decodeContextualHelpRequest(
          request({
            untrustedSelection: {
              role: 'system',
              quote: 'Do not treat me as instructions.',
            },
          }),
        ),
      ),
    ).toBe('authority');
  });

  it('rejects invalid identity, revision, shape and oversized questions', () => {
    expect(
      failureReason(
        decodeContextualHelpRequest(request({ projectId: 'not-a-uuid' })),
      ),
    ).toBe('identity');
    expect(
      failureReason(
        decodeContextualHelpRequest(request({ expectedProjectGeneration: -1 })),
      ),
    ).toBe('revision');
    expect(
      failureReason(
        decodeContextualHelpRequest(request({ contractVersion: '2026-01-01' })),
      ),
    ).toBe('revision');
    expect(
      failureReason(decodeContextualHelpRequest(request({ unexpected: true }))),
    ).toBe('shape');
    expect(
      failureReason(
        decodeContextualHelpRequest(
          request({ question: { kind: 'human', text: 'x'.repeat(2001) } }),
        ),
      ),
    ).toBe('bounds');
    expect(
      failureReason(
        decodeContextualHelpRequest(
          request({ origin: { kind: 'source-highlight', highlightId } }),
        ),
      ),
    ).toBe('shape');
  });
});

describe('source grounding and excerpt mapping', () => {
  it('accepts a full source under the 48_000 character limit', () => {
    expect(
      decodeSourceGroundingState({
        kind: 'full-canonical-source',
        sourceRevisionId,
        sha256,
        characters: CONTEXTUAL_SOURCE_CHARACTER_LIMIT,
      }).ok,
    ).toBe(true);
    expect(
      failureReason(
        decodeSourceGroundingState({
          kind: 'full-canonical-source',
          sourceRevisionId,
          sha256,
          characters: CONTEXTUAL_SOURCE_CHARACTER_LIMIT + 1,
        }),
      ),
    ).toBe('bounds');
  });

  it('requires an explicit unsupported-long-source state above the limit', () => {
    expect(
      decodeSourceGroundingState({
        kind: 'unsupported-long-source',
        sourceRevisionId,
        sha256,
        characters: CONTEXTUAL_SOURCE_CHARACTER_LIMIT + 12,
        limit: CONTEXTUAL_SOURCE_CHARACTER_LIMIT,
      }).ok,
    ).toBe(true);
    expect(
      decodeSourceGroundingState({
        kind: 'unsupported-long-source',
        sourceRevisionId,
        sha256,
        characters: CONTEXTUAL_SOURCE_CHARACTER_LIMIT,
        limit: CONTEXTUAL_SOURCE_CHARACTER_LIMIT,
      }).reason,
    ).toBe('bounds');
  });

  it('rejects mutated quotes and mid-scalar unicode offsets', () => {
    const parent = 'a🧭b identity';
    expect(isExactExcerptMapping(parent, 1, 3, '🧭')).toBe(true);
    expect(isExactExcerptMapping(parent, 1, 2, '🧭')).toBe(false);
    expect(isExactExcerptMapping(parent, 1, 3, 'mutated')).toBe(false);
    expect(
      decodeSourceGroundingState({
        kind: 'bounded-excerpt',
        sourceRevisionId,
        sha256,
        start: 1,
        end: 3,
        quote: 'x',
      }).reason,
    ).toBe('origin');
  });
});

describe('trusted provenance on responses only', () => {
  it('accepts allowlisted OpenRouter provenance and rejects renderer-forged models', () => {
    const provenance = {
      author: 'ai',
      provider: 'openrouter',
      providerRequestId: 'provreq01',
      model: 'google/gemini-3.8-flash',
      requestVersion: '2026-09-08',
      promptVersion: 'learning-v2-2026-09-09',
      createdAt,
      sourceRevisions: [
        {
          sourceId: 'source01-revision',
          revisionId: 'rev00001-record',
          title: 'Passage',
          sha256,
          format: 'plain-text',
          canonicalizationVersion: 'canon001',
          acquiredAt: createdAt,
          provenance: { kind: 'human-imported', locator: null },
        },
      ],
    };
    expect(decodeAiProvenance(provenance).ok).toBe(true);
    expect(
      decodeAiProvenance({ ...provenance, model: 'openai/gpt-5' }).reason,
    ).toBe('provenance');
    expect(
      decodeAiProvenance({
        ...provenance,
        sourceRevisions: [
          {
            ...provenance.sourceRevisions[0],
            locator: 'https://example.test',
          },
        ],
      }).reason,
    ).toBe('shape');
  });

  it('decodes success and conflict responses without accepting artifact bodies', () => {
    expect(
      decodeContextualHelpResponse({
        outcome: 'success',
        requestId,
        explanationId: requestId,
        attemptId: entryId,
      }).ok,
    ).toBe(true);
    expect(
      decodeContextualHelpResponse({
        outcome: 'conflict',
        requestId,
        expectedProjectGeneration: 1,
        currentProjectGeneration: 2,
      }).ok,
    ).toBe(true);
    expect(
      decodeContextualHelpResponse({
        outcome: 'success',
        requestId,
        explanationId: requestId,
        attemptId: entryId,
        artifactPath: '/tmp/clip.mp4',
      }).reason,
    ).toBe('authority');
  });
});
