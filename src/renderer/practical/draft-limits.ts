import type { PracticalDraft } from '../../contracts/practical-work';

/** UTF-16 code units, matching the named main-operation validation contract. */
export const MAX_PRACTICAL_FIELD_LENGTH = 12_000;

export function exceedsPracticalFieldLimit(draft: PracticalDraft): boolean {
  return [
    draft.prediction,
    draft.attempt,
    draft.reportedResult.text,
    draft.reflection.text,
  ].some((text) => text.length > MAX_PRACTICAL_FIELD_LENGTH);
}
