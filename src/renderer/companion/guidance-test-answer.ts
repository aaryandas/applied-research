import type { CompanionGuidanceReply as SessionReply } from '../../contracts/companion';
import type { CompanionGuidanceReply } from '../../contracts/companion-guidance';
import { COMPANION_APP_CONTEXT_SOURCE_ID } from '../../contracts/companion-guidance';
import type { AiProvenance } from '../../contracts/learning-api';
import type { SourceCitation } from '../../contracts/learning-records';

export const TEST_GUIDANCE_CREATED_AT = '2026-09-09T08:00:00.000Z';

export const TEST_SCHOLARLY_CITATION: SourceCitation = {
  sourceId: 'a0000000-0000-4000-8000-000000000001',
  revisionId: 'b0000000-0000-4000-8000-000000000001',
  start: 0,
  end: 15,
  quote: 'Shear the basis',
};

export const TEST_APP_CONTEXT_CITATION: SourceCitation = {
  sourceId: COMPANION_APP_CONTEXT_SOURCE_ID,
  revisionId: '31000000-0000-4000-8000-000000000001',
  start: 0,
  end: 24,
  quote: 'Change one matrix entry.',
};

export const TEST_GUIDANCE_PROVENANCE: AiProvenance = {
  author: 'ai',
  provider: 'openrouter',
  providerRequestId: 'provreq03',
  model: 'google/gemini-3.8-flash',
  requestVersion: '2026-09-08',
  promptVersion: 'learning-v2-2026-09-09',
  createdAt: TEST_GUIDANCE_CREATED_AT,
  sourceRevisions: [
    {
      sourceId: TEST_SCHOLARLY_CITATION.sourceId,
      revisionId: TEST_SCHOLARLY_CITATION.revisionId,
      title: 'Linear maps',
      sha256: 'a'.repeat(64),
      format: 'plain-text',
      canonicalizationVersion: 'workspace-plain-v1',
      acquiredAt: TEST_GUIDANCE_CREATED_AT,
      provenance: { kind: 'human-imported', locator: null },
    },
  ],
};

export function ipcSuccessReply(
  text: string,
  extras: Partial<Extract<CompanionGuidanceReply, { outcome: 'success' }>> = {},
): Extract<CompanionGuidanceReply, { outcome: 'success' }> {
  return {
    outcome: 'success',
    requestId: '31000000-0000-4000-8000-000000000001',
    authorKind: 'ai',
    text,
    provenance: TEST_GUIDANCE_PROVENANCE,
    nextAction: 'Change one entry and predict the image.',
    citations: [TEST_SCHOLARLY_CITATION],
    ...extras,
  };
}

export function answeredGuidance(
  text: string,
): Extract<SessionReply, { status: 'answered' }> {
  return {
    status: 'answered',
    text,
    nextAction: 'Change one input and compare the result.',
    citations: [TEST_SCHOLARLY_CITATION],
    provenance: TEST_GUIDANCE_PROVENANCE,
  };
}
