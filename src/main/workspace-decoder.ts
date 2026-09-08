import type {
  Citation,
  Entry,
  EntryKind,
  Project,
} from '../contracts/workspace';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTRY_KINDS = new Set<EntryKind>([
  'note',
  'insight',
  'result',
  'source',
  'assistant',
  'experiment',
]);
const PROJECT_KEYS = ['createdAt', 'entries', 'goal', 'id', 'updatedAt'];
const ENTRY_KEYS = [
  'body',
  'citations',
  'createdAt',
  'id',
  'kind',
  'title',
  'url',
  'x',
  'y',
];
const CITATION_KEYS = ['end', 'start', 'title', 'url'];
const HUMAN_TITLE_LIMIT = 200;
const HUMAN_BODY_LIMIT = 20_000;
const ASSISTANT_TITLE_LIMIT = 4_000;
const ASSISTANT_BODY_LIMIT = 30_000;

export type EntryAuthorKind = 'human' | 'assistant' | 'system';

export interface DecodedEntryContent {
  kind: EntryKind;
  title: string;
  body: string;
  url: string;
  citations: Citation[];
  authorKind: EntryAuthorKind;
}

export function decodeEntryKind(value: unknown): EntryKind {
  if (typeof value !== 'string' || !ENTRY_KINDS.has(value as EntryKind)) {
    throw new Error('Invalid stored entry kind.');
  }
  return value as EntryKind;
}

export function expectedAuthorKind(kind: EntryKind): EntryAuthorKind {
  if (kind === 'assistant') return 'assistant';
  if (kind === 'experiment') return 'system';
  return 'human';
}

function object(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${description}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: string[],
  description: string,
): void {
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(
      `Invalid ${description}: unsupported or missing fields (${actual.join(', ')}).`,
    );
  }
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff)
        return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function decodeText(
  value: unknown,
  description: string,
  maximumLength = Number.POSITIVE_INFINITY,
): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${description}: expected text.`);
  }
  if (hasUnpairedSurrogate(value)) {
    throw new Error(`Invalid ${description}: text is not well-formed Unicode.`);
  }
  if (value.length > maximumLength) {
    throw new Error(`Invalid ${description}: text is too long.`);
  }
  return value;
}

export function decodeUuid(value: unknown, description: string): string {
  const decoded = decodeText(value, description);
  if (!UUID_PATTERN.test(decoded))
    throw new Error(`Invalid ${description}: expected a UUID.`);
  return decoded;
}

export function decodeTimestamp(value: unknown, description: string): string {
  const decoded = decodeText(value, description);
  if (
    !Number.isFinite(Date.parse(decoded)) ||
    new Date(decoded).toISOString() !== decoded
  ) {
    throw new Error(`Invalid ${description}: expected an ISO timestamp.`);
  }
  return decoded;
}

export function decodeCanvasCoordinate(
  value: unknown,
  description: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 10_000
  ) {
    throw new Error(`Invalid ${description}: expected a canvas coordinate.`);
  }
  return value;
}

export function decodeHttpsUrl(value: unknown, description: string): string {
  const decoded = decodeText(value, description);
  let url: URL;
  try {
    url = new URL(decoded);
  } catch {
    throw new Error(`Invalid ${description}: expected an HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`Invalid ${description}: expected a safe HTTPS URL.`);
  }
  return decoded;
}

function citation(value: unknown, bodyLength: number, index: number): Citation {
  const decoded = object(value, `citation ${index}`);
  exactKeys(decoded, CITATION_KEYS, `citation ${index}`);
  const start = decoded.start;
  const end = decoded.end;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    Number(start) < 0 ||
    Number(end) < Number(start) ||
    Number(end) > bodyLength
  ) {
    throw new Error(`Invalid citation ${index}: offsets are out of range.`);
  }
  return {
    title: decodeText(decoded.title, `citation ${index} title`, 200),
    url: decodeHttpsUrl(decoded.url, `citation ${index} URL`),
    start: Number(start),
    end: Number(end),
  };
}

export function decodeCitations(value: unknown, body: string): Citation[] {
  if (!Array.isArray(value))
    throw new Error('Invalid citations: expected a list.');
  return value.map((item, index) => citation(item, body.length, index));
}

export function decodeEntryAuthorKind(value: unknown): EntryAuthorKind {
  if (value !== 'human' && value !== 'assistant' && value !== 'system') {
    throw new Error('Invalid stored entry author attribution.');
  }
  return value;
}

export function decodeEntryContent(
  value: unknown,
  authorKind: EntryAuthorKind,
): DecodedEntryContent {
  const decoded = object(value, 'entry content');
  const kind = decodeEntryKind(decoded.kind);
  if (expectedAuthorKind(kind) !== authorKind) {
    throw new Error(
      'Entry kind does not match its immutable author attribution.',
    );
  }
  const titleLimit =
    authorKind === 'human' ? HUMAN_TITLE_LIMIT : ASSISTANT_TITLE_LIMIT;
  const bodyLimit =
    authorKind === 'human' ? HUMAN_BODY_LIMIT : ASSISTANT_BODY_LIMIT;
  const title = decodeText(decoded.title, 'entry title', titleLimit);
  const body = decodeText(decoded.body, 'entry body', bodyLimit);
  const citations = decodeCitations(decoded.citations, body);
  if (kind !== 'assistant' && citations.length > 0) {
    throw new Error(
      'Invalid entry content: only assistant entries can carry AI citations.',
    );
  }
  const url =
    decoded.url === '' ? '' : decodeHttpsUrl(decoded.url, 'entry URL');
  return { kind, title, body, url, citations, authorKind };
}

function entry(value: unknown, index: number): Entry {
  const decoded = object(value, `entry ${index}`);
  exactKeys(decoded, ENTRY_KEYS, `entry ${index}`);
  const kind = decodeEntryKind(decoded.kind);
  const content = decodeEntryContent(decoded, expectedAuthorKind(kind));
  return {
    id: decodeUuid(decoded.id, `entry ${index} id`),
    kind: content.kind,
    title: content.title,
    body: content.body,
    url: content.url,
    citations: content.citations,
    x: decodeCanvasCoordinate(decoded.x, `entry ${index} x`),
    y: decodeCanvasCoordinate(decoded.y, `entry ${index} y`),
    createdAt: decodeTimestamp(decoded.createdAt, `entry ${index} createdAt`),
  };
}

export function decodeLegacyProject(value: unknown): Project {
  const decoded = object(value, 'legacy project');
  if ('schemaVersion' in decoded) {
    throw new Error(
      'This learning-space document was written by a newer application version.',
    );
  }
  exactKeys(decoded, PROJECT_KEYS, 'legacy project');
  if (!Array.isArray(decoded.entries))
    throw new Error('Invalid legacy project: entries must be a list.');
  const entries = decoded.entries.map(entry);
  if (new Set(entries.map((item) => item.id)).size !== entries.length) {
    throw new Error('Invalid legacy project: duplicate entry id.');
  }
  return {
    id: decodeUuid(decoded.id, 'project id'),
    goal: decodeText(decoded.goal, 'project goal', 1_000),
    createdAt: decodeTimestamp(decoded.createdAt, 'project createdAt'),
    updatedAt: decodeTimestamp(decoded.updatedAt, 'project updatedAt'),
    entries,
  };
}
