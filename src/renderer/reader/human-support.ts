import type { LearningEntryRecord } from '../../contracts/learning-records';
export function isHumanSupport(entry: LearningEntryRecord): boolean {
  return (
    entry.current.authorKind === 'human' &&
    (entry.current.kind === 'note' || entry.current.kind === 'question')
  );
}
