import { WorkspaceMigrationError } from './workspace-migration';

export const WORKSPACE_STARTUP_ERROR_TITLE =
  'Applied Research cannot open your workspace';

const RECOVERY_MESSAGE =
  'Applied Research could not safely validate or migrate the local workspace. Your data was not reset. Keep workspace.sqlite and every pre-migration backup, then retry after updating the app or contact support with those files available.';
const SAFE_ERROR_NAMES = new Set([
  'AggregateError',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SqliteError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'WorkspaceMigrationError',
]);
const MAX_STACK_LINES = 8;
const MAX_STACK_LINE_LENGTH = 512;
const SAFE_SOURCE_FILENAMES = new Set([
  'index.js',
  'index.ts',
  'startup-error.ts',
  'workspace-decoder.ts',
  'workspace-migration.ts',
  'workspace-store.ts',
]);

export interface WorkspaceStartupActions {
  log(message: string): void;
  showErrorBox(title: string, message: string): void;
  exit(code: number): void;
}

export function workspaceStartupErrorMessage(error_: unknown): string {
  if (error_ instanceof WorkspaceMigrationError) return error_.userMessage;
  return RECOVERY_MESSAGE;
}

function safeErrorName(error_: Error): string {
  return SAFE_ERROR_NAMES.has(error_.name) ? error_.name : 'Error';
}

function safeErrorCode(error_: Error): string | undefined {
  const code = (error_ as Error & { code?: unknown }).code;
  return typeof code === 'string' && /^(?:ERR|SQLITE)_[A-Z0-9_]+$/.test(code)
    ? code
    : undefined;
}

function boundedStackLines(error_: Error): string[] {
  const stack = error_.stack;
  if (!stack) return [];
  const lines: string[] = [];
  let cursor = 0;
  for (let index = 0; index <= MAX_STACK_LINES; index += 1) {
    const segment = stack.slice(cursor, cursor + MAX_STACK_LINE_LENGTH + 1);
    const newline = segment.indexOf('\n');
    const finalLine = newline === -1;
    const line = finalLine ? segment : segment.slice(0, newline);
    if (line.length > MAX_STACK_LINE_LENGTH) break;
    if (index > 0) lines.push(line);
    if (finalLine) break;
    cursor += newline + 1;
  }
  return lines;
}

function isDecimal(value: string): boolean {
  return (
    value.length > 0 &&
    [...value].every((character) => character >= '0' && character <= '9')
  );
}

function stackFrameFromLine(line: string): string | undefined {
  const trimmed = line.trimEnd();
  const location = trimmed.endsWith(')') ? trimmed.slice(0, -1) : trimmed;
  const columnSeparator = location.lastIndexOf(':');
  if (columnSeparator === -1) return undefined;
  const lineSeparator = location.lastIndexOf(':', columnSeparator - 1);
  if (lineSeparator === -1) return undefined;
  const lineNumber = location.slice(lineSeparator + 1, columnSeparator);
  const columnNumber = location.slice(columnSeparator + 1);
  if (!isDecimal(lineNumber) || !isDecimal(columnNumber)) return undefined;
  const sourceLocation = location.slice(0, lineSeparator);
  const pathSeparator = Math.max(
    sourceLocation.lastIndexOf('/'),
    sourceLocation.lastIndexOf('\\'),
  );
  const filename = sourceLocation.slice(pathSeparator + 1);
  if (!SAFE_SOURCE_FILENAMES.has(filename)) return undefined;
  return `${filename}:${lineNumber}:${columnNumber}`;
}

function sanitizedStackFrame(error_: Error): string | undefined {
  for (const line of boundedStackLines(error_)) {
    const frame = stackFrameFromLine(line);
    if (frame) return frame;
  }
  return undefined;
}

function causeIdentities(error_: Error): string[] {
  const identities: string[] = [];
  let cause: unknown = error_.cause;
  while (cause instanceof Error && identities.length < 3) {
    const frame = sanitizedStackFrame(cause);
    const code = safeErrorCode(cause);
    let identity = safeErrorName(cause);
    if (code) identity += `(${code})`;
    if (frame) identity += `@${frame}`;
    identities.push(identity);
    cause = cause.cause;
  }
  return identities;
}

export function workspaceStartupDiagnostic(error_: unknown): string {
  if (!(error_ instanceof WorkspaceMigrationError)) {
    const identity =
      error_ instanceof Error ? safeErrorName(error_) : typeof error_;
    return `Unexpected workspace startup failure [type=${identity}]`;
  }
  const frame = sanitizedStackFrame(error_);
  const fields = [
    `code=${error_.code}`,
    ...(error_.projectId ? [`project=${error_.projectId}`] : []),
    ...causeIdentities(error_).map((identity) => `cause=${identity}`),
    ...(frame ? [`frame=${frame}`] : []),
  ];
  return `${error_.name} [${fields.join(' ')}]`;
}

export function handleWorkspaceStartupFailure(
  error_: unknown,
  actions: WorkspaceStartupActions,
): void {
  const message = workspaceStartupErrorMessage(error_);
  actions.log(workspaceStartupDiagnostic(error_));
  actions.showErrorBox(WORKSPACE_STARTUP_ERROR_TITLE, message);
  actions.exit(1);
}
