import {
  MAX_PRACTICAL_FIELD_LENGTH,
  type PracticalDraft,
} from '../../contracts/practical-work';
export { MAX_PRACTICAL_FIELD_LENGTH } from '../../contracts/practical-work';

export function exceedsPracticalFieldLimit(draft: PracticalDraft): boolean {
  return [
    draft.prediction,
    draft.attempt,
    draft.reportedResult.text,
    draft.reflection.text,
  ].some((text) => text.length > MAX_PRACTICAL_FIELD_LENGTH);
}
