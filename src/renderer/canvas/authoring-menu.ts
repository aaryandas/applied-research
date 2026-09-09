import type { CanvasContent } from './graph';
import type { CanvasMenuItem } from './CanvasMenu';
import {
  isCurrentHumanInsight,
  isHumanNoteOrQuestion,
  pathOriginChoices,
} from './authoring';
import type {
  LearningEntryRecord,
  LearningOrigin,
  LearningWorkspace,
} from '../../contracts/learning-records';

export interface CanvasMenuModel {
  items: CanvasMenuItem[];
  createOrigin: LearningOrigin | null;
}

export type CanvasMenuAction =
  | { type: 'create'; kind: 'note' | 'question' }
  | { type: 'insight' }
  | { type: 'edit'; entryId: string }
  | { type: 'relink-selected' }
  | { type: 'relink'; entryId: string; choiceId: string };

export function parseCanvasMenuAction(id: string): CanvasMenuAction | null {
  if (id === 'create:note' || id === 'create:question')
    return { type: 'create', kind: id === 'create:note' ? 'note' : 'question' };
  if (id === 'insight') return { type: 'insight' };
  if (id.startsWith('edit:')) return { type: 'edit', entryId: id.slice(5) };
  if (id.startsWith('relink-selected:')) return { type: 'relink-selected' };
  if (id.startsWith('relink:')) {
    const rest = id.slice('relink:'.length);
    const separator = rest.indexOf(':');
    if (separator <= 0) return null;
    return {
      type: 'relink',
      entryId: rest.slice(0, separator),
      choiceId: rest.slice(separator + 1),
    };
  }
  return null;
}

function originOrNull(content: CanvasContent | null) {
  if (!content) return null;
  if (
    content.kind === 'topic' ||
    content.kind === 'lesson' ||
    content.kind === 'source' ||
    content.kind === 'highlight'
  )
    return content.origin;
  return null;
}

function writingLabel(entry: LearningEntryRecord): string {
  const wording = entry.current.title || entry.current.body;
  const preview = wording.length > 48 ? `${wording.slice(0, 48)}…` : wording;
  return preview || entry.id;
}

export function canvasMenuModel(
  content: CanvasContent | null,
  workspace: LearningWorkspace,
  selected: readonly LearningEntryRecord[],
): CanvasMenuModel {
  const items: CanvasMenuItem[] = [];
  const createOrigin = originOrNull(content);
  if (!content) {
    items.push(
      { id: 'create:note', label: 'New note' },
      { id: 'create:question', label: 'Ask a question' },
    );
  } else if (content.kind === 'topic' || content.kind === 'lesson') {
    const about = content.kind === 'topic' ? 'this topic' : 'this chapter';
    items.push(
      { id: 'create:note', label: `Note about ${about}` },
      { id: 'create:question', label: `Ask a question about ${about}` },
    );
    if (selected.length === 1) {
      items.push({
        id: `relink-selected:${selected[0]!.id}`,
        label: `Use as learning origin for “${writingLabel(selected[0]!)}”`,
      });
    }
  } else if (content.kind === 'source' || content.kind === 'highlight') {
    const about =
      content.kind === 'highlight' ? 'this highlight' : 'this source';
    items.push(
      { id: 'create:note', label: `Note about ${about}` },
      { id: 'create:question', label: `Ask a question about ${about}` },
    );
  } else if (content.entry) {
    const entry = workspace.entries.find(
      (item) => item.id === content.entry?.entryId,
    );
    if (
      entry &&
      entry.currentRevision === content.entry.revision &&
      isHumanNoteOrQuestion(entry)
    ) {
      items.push({
        id: `edit:${entry.id}`,
        label: `Edit this ${entry.current.kind}`,
      });
      for (const choice of pathOriginChoices(workspace)) {
        items.push({
          id: `relink:${entry.id}:${choice.id}`,
          label: `Use ${choice.label} as learning origin`,
        });
      }
    } else if (
      entry &&
      entry.currentRevision === content.entry.revision &&
      isCurrentHumanInsight(entry)
    ) {
      items.push({ id: `edit:${entry.id}`, label: 'Edit this insight' });
    }
  }
  if (selected.length >= 2) {
    items.push({
      id: 'insight',
      label: 'Connect selected notes and questions into an insight',
    });
  }
  return { items, createOrigin };
}
