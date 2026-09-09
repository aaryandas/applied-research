import {
  decodeExactRecord,
  failed,
  isContractUuid,
  type ContractDecode,
} from './contextual-contract-guards';
import {
  decodeEntryRevisionReference,
  type EntryRevisionReference,
} from './learning-records';

export function decodeHighlightLocator<Kind extends string>(
  value: unknown,
  kind: Kind,
): ContractDecode<{
  kind: Kind;
  sourceRevisionId: string;
  highlightId: string;
}> {
  const decoded = decodeExactRecord(value, [
    'kind',
    'sourceRevisionId',
    'highlightId',
  ]);
  if (!decoded.ok) return decoded;
  if (decoded.value.kind !== kind) return failed('origin');
  if (
    !isContractUuid(decoded.value.sourceRevisionId) ||
    !isContractUuid(decoded.value.highlightId)
  ) {
    return failed('identity');
  }
  return {
    ok: true,
    value: {
      kind,
      sourceRevisionId: decoded.value.sourceRevisionId,
      highlightId: decoded.value.highlightId,
    },
  };
}

export function decodeSavedQuestionLocator(value: unknown): ContractDecode<{
  kind: 'saved-question';
  entry: EntryRevisionReference;
}> {
  const decoded = decodeExactRecord(value, ['kind', 'entry']);
  if (!decoded.ok) return decoded;
  if (decoded.value.kind !== 'saved-question') return failed('origin');
  const entry = decodeEntryRevisionReference(decoded.value.entry);
  if (!entry.ok) return entry;
  return { ok: true, value: { kind: 'saved-question', entry: entry.value } };
}
