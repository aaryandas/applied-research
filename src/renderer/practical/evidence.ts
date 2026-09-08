import type {
  PracticalEvidenceReference,
  ReturnedPracticalEvidence,
} from '../../contracts/practical-work';

export type PracticalEvidenceStatus = 'loading' | 'ready' | 'unavailable';
export interface PracticalEvidenceState {
  status: PracticalEvidenceStatus;
  items: readonly ReturnedPracticalEvidence[];
}

export function evidenceReference(
  item: ReturnedPracticalEvidence,
): PracticalEvidenceReference {
  return item.kind === 'app-measured'
    ? { kind: item.kind, captureId: item.captureId }
    : { kind: item.kind, selectionId: item.selectionId };
}

export function matchesReference(
  reference: PracticalEvidenceReference | null,
  item: ReturnedPracticalEvidence,
): boolean {
  if (!reference || reference.kind !== item.kind) return false;
  return reference.kind === 'app-measured' && item.kind === 'app-measured'
    ? reference.captureId === item.captureId
    : reference.kind === 'user-selected-file' &&
        item.kind === 'user-selected-file' &&
        reference.selectionId === item.selectionId;
}

export function selectionIsAvailable(
  reference: PracticalEvidenceReference | null,
  evidence: PracticalEvidenceState,
): boolean {
  return (
    evidence.status === 'ready' &&
    (reference === null ||
      evidence.items.some((item) => matchesReference(reference, item)))
  );
}

export function mergeEvidence(
  incoming: readonly ReturnedPracticalEvidence[],
  local: readonly ReturnedPracticalEvidence[],
): ReturnedPracticalEvidence[] {
  return [
    ...incoming,
    ...local.filter(
      (item) =>
        !incoming.some((candidate) =>
          matchesReference(evidenceReference(item), candidate),
        ),
    ),
  ];
}
