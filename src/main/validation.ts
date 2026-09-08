import type {
  EntryDraft,
  EntryPosition,
  ToolBounds,
  TutorRequest,
} from '../contracts/workspace';
import { decodeRecord, decodeText } from './workspace-decoder';

export function record(value: unknown): Record<string, unknown> {
  return decodeRecord(value, 'input');
}
export function text(value: unknown, max = 20_000): string {
  return decodeText(value, 'text', max);
}
export function identifier(value: unknown): string {
  const id = text(value, 100);
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid identifier.');
  return id;
}
export function webUrl(value: unknown): string {
  const url = new URL(text(value, 4000));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Use an https URL without embedded credentials.');
  }
  return url.href;
}
function coordinate(value: unknown, max = 10_000): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  ) {
    throw new Error('Invalid position.');
  }
  return Math.round(value);
}
export function entryDraft(value: unknown): EntryDraft {
  const input = record(value);
  const kind = input.kind;
  if (
    kind !== 'note' &&
    kind !== 'insight' &&
    kind !== 'result' &&
    kind !== 'source'
  ) {
    throw new Error(
      'Only your own notes, insights, results and sources can be edited.',
    );
  }
  return {
    projectId: identifier(input.projectId),
    ...(input.id === undefined ? {} : { id: identifier(input.id) }),
    kind,
    title: text(input.title, 200),
    body: text(input.body),
    url: input.url === '' ? '' : webUrl(input.url),
  };
}
export function entryPosition(value: unknown): EntryPosition {
  const input = record(value);
  return {
    projectId: identifier(input.projectId),
    id: identifier(input.id),
    x: coordinate(input.x),
    y: coordinate(input.y),
  };
}
export function toolBounds(value: unknown): ToolBounds {
  const input = record(value);
  return {
    x: coordinate(input.x),
    y: coordinate(input.y),
    width: coordinate(input.width),
    height: coordinate(input.height),
  };
}
export function tutorRequest(value: unknown): TutorRequest {
  const input = record(value);
  if (typeof input.includePage !== 'boolean')
    throw new Error('Choose whether to share page context.');
  const prompt = text(input.prompt, 4000).trim();
  if (!prompt) throw new Error('Enter a question.');
  return {
    projectId: identifier(input.projectId),
    prompt,
    includePage: input.includePage,
  };
}
