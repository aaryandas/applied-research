import { expect, it, vi } from 'vitest';
import {
  handleWorkspaceStartupFailure,
  WORKSPACE_STARTUP_ERROR_TITLE,
  workspaceStartupDiagnostic,
  workspaceStartupErrorMessage,
} from './startup-error';
import { WorkspaceMigrationError } from './workspace-migration';

const PROJECT_ID = 'a2e62710-a381-4c9a-a4ad-5ee746415475';
const SENSITIVE_DETAILS =
  'near "DROP TABLE": syntax error; OPENROUTER_API_KEY=private-value';

function corruptLegacyError(): WorkspaceMigrationError {
  const cause = Object.assign(new SyntaxError(SENSITIVE_DETAILS), {
    code: 'SQLITE_CORRUPT',
    stack: `SyntaxError: ${SENSITIVE_DETAILS}\n    at decode (/Users/private/vault/workspace-migration.ts:123:4)`,
  });
  return new WorkspaceMigrationError(SENSITIVE_DETAILS, {
    code: 'legacy-json-corrupt',
    projectId: PROJECT_ID,
    cause,
  });
}

it('retains typed migration details while exposing only allow-listed recovery guidance', () => {
  const error = corruptLegacyError();
  const message = workspaceStartupErrorMessage(error);

  expect(error).toMatchObject({
    name: 'WorkspaceMigrationError',
    code: 'legacy-json-corrupt',
    projectId: PROJECT_ID,
    message: SENSITIVE_DETAILS,
  });
  expect(error.cause).toBeInstanceOf(SyntaxError);
  expect(message).toContain(PROJECT_ID);
  expect(message).toContain('corrupt saved JSON');
  expect(message).toContain('No data was changed');
  expect(message).not.toContain('DROP TABLE');
  expect(message).not.toContain('private-value');
});

it('reports actionable typed distinctions without reflecting arbitrary messages', () => {
  const cases = [
    {
      error: new WorkspaceMigrationError('private newer marker', {
        code: 'newer-migration-version',
      }),
      expected: 'Install the latest version',
    },
    {
      error: new WorkspaceMigrationError('private table name', {
        code: 'unsupported-schema',
      }),
      expected: 'unsupported table layout',
    },
    { error: corruptLegacyError(), expected: 'corrupt saved JSON' },
  ];

  for (const { error, expected } of cases) {
    expect(workspaceStartupErrorMessage(error)).toContain(expected);
    expect(workspaceStartupErrorMessage(error)).not.toContain(error.message);
  }
});

it('logs typed codes and sanitized cause identity without paths or secrets', () => {
  const diagnostic = workspaceStartupDiagnostic(corruptLegacyError());

  expect(diagnostic).toContain('code=legacy-json-corrupt');
  expect(diagnostic).toContain(`project=${PROJECT_ID}`);
  expect(diagnostic).toContain(
    'cause=SyntaxError(SQLITE_CORRUPT)@workspace-migration.ts:123:4',
  );
  expect(diagnostic).not.toContain('/Users/private');
  expect(diagnostic).not.toContain('DROP TABLE');
  expect(diagnostic).not.toContain('private-value');
});

it('omits absent project, driver code and source-frame fields', () => {
  const nestedCause = new TypeError(SENSITIVE_DETAILS);
  delete nestedCause.stack;
  const cause = Object.assign(
    new Error(SENSITIVE_DETAILS, { cause: nestedCause }),
    {
      code: 'PRIVATE_VALUE',
      stack: `Error: ${SENSITIVE_DETAILS}\n    at native code`,
    },
  );
  const error = new WorkspaceMigrationError(SENSITIVE_DETAILS, {
    code: 'migration-execution-failed',
    cause,
  });
  delete error.stack;

  expect(workspaceStartupDiagnostic(error)).toBe(
    'WorkspaceMigrationError [code=migration-execution-failed cause=Error cause=TypeError]',
  );
});

it('gives generic guidance and identity-only diagnostics for unknown errors', () => {
  const error = Object.assign(new Error(SENSITIVE_DETAILS), {
    name: 'CredentialprivatevalueError',
    code: 'PRIVATE_VALUE',
  });
  const message = workspaceStartupErrorMessage(error);
  const diagnostic = workspaceStartupDiagnostic(error);

  expect(WORKSPACE_STARTUP_ERROR_TITLE).toBe(
    'Applied Research cannot open your workspace',
  );
  expect(message).toContain('Your data was not reset');
  expect(message).toContain('workspace.sqlite');
  expect(diagnostic).toBe('Unexpected workspace startup failure [type=Error]');
  expect(`${message} ${diagnostic}`).not.toContain('private-value');
  expect(`${message} ${diagnostic}`).not.toContain('PRIVATE_VALUE');
  expect(workspaceStartupDiagnostic('private primitive')).toBe(
    'Unexpected workspace startup failure [type=string]',
  );
});

it('logs safe diagnostics and shows the native error before exiting', () => {
  const calls: string[] = [];
  const log = vi.fn((message: string) => calls.push(`log:${message}`));
  const showErrorBox = vi.fn((title: string, message: string) =>
    calls.push(`dialog:${title}:${message}`),
  );
  const exit = vi.fn((code: number) => calls.push(`exit:${code}`));

  handleWorkspaceStartupFailure(corruptLegacyError(), {
    log,
    showErrorBox,
    exit,
  });

  expect(calls).toHaveLength(3);
  expect(calls[0]).toContain('log:WorkspaceMigrationError');
  expect(calls[0]).toContain('code=legacy-json-corrupt');
  expect(calls[1]).toContain(
    'dialog:Applied Research cannot open your workspace',
  );
  expect(calls[1]).toContain('corrupt saved JSON');
  expect(calls[2]).toBe('exit:1');
  expect(calls.join(' ')).not.toContain('DROP TABLE');
  expect(calls.join(' ')).not.toContain('private-value');
});
