export type DesktopAuthDiagnosticCode =
  | 'auth.callback-rejected'
  | 'auth.exchange-failed'
  | 'auth.protocol-registration-failed'
  | 'auth.remote-revocation-unconfirmed'
  | 'auth.session-refresh-failed'
  | 'auth.storage-failed';

export interface DesktopAuthDiagnostic {
  readonly code: DesktopAuthDiagnosticCode;
  readonly message: string;
  readonly errorClass: 'Error' | 'TypeError' | 'Unknown';
}

export interface DesktopAuthDiagnostics {
  report(code: DesktopAuthDiagnosticCode, cause?: unknown): void;
}

const MESSAGES: Record<DesktopAuthDiagnosticCode, string> = {
  'auth.callback-rejected': 'Authentication callback rejected.',
  'auth.exchange-failed': 'Authentication exchange failed.',
  'auth.protocol-registration-failed':
    'Authentication protocol registration failed.',
  'auth.remote-revocation-unconfirmed':
    'Remote session revocation was not confirmed.',
  'auth.session-refresh-failed': 'Session refresh failed.',
  'auth.storage-failed': 'Secure session storage failed.',
};

function safeErrorClass(cause: unknown): DesktopAuthDiagnostic['errorClass'] {
  if (cause instanceof TypeError) return 'TypeError';
  if (cause instanceof Error) return 'Error';
  return 'Unknown';
}

export function makeDesktopAuthDiagnostics(
  write: (diagnostic: DesktopAuthDiagnostic) => void,
): DesktopAuthDiagnostics {
  return {
    report(code, cause) {
      write({
        code,
        message: MESSAGES[code],
        errorClass: safeErrorClass(cause),
      });
    },
  };
}

export const consoleDesktopAuthDiagnostics = makeDesktopAuthDiagnostics(
  (diagnostic) => console.error(JSON.stringify(diagnostic)),
);

export const silentDesktopAuthDiagnostics = makeDesktopAuthDiagnostics(
  () => undefined,
);
