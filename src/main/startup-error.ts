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

function sanitizedStackFrame(error_: Error): string | undefined {
  for (const line of error_.stack?.split('\n').slice(1) ?? []) {
    const match = line.match(
      /([a-zA-Z0-9_.-]+\.(?:ts|js|cjs|mjs)):(\d+):(\d+)/,
    );
    if (match) return `${match[1]}:${match[2]}:${match[3]}`;
  }
  return undefined;
}

function causeIdentities(error_: Error): string[] {
  const identities: string[] = [];
  let cause: unknown = error_.cause;
  while (cause instanceof Error && identities.length < 3) {
    const frame = sanitizedStackFrame(cause);
    const code = safeErrorCode(cause);
    identities.push(
      `${safeErrorName(cause)}${code ? `(${code})` : ''}${frame ? `@${frame}` : ''}`,
    );
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
