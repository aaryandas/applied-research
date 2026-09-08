const DIAGNOSTIC_MESSAGES = {
  'accounting.reservation-failed': 'Usage reservation failed.',
  'accounting.settlement-failed': 'Usage settlement failed.',
  'authentication.session-lookup-failed': 'Session lookup failed.',
  'backend.configuration-invalid': 'Backend configuration is invalid.',
  'backend.start-failed': 'Backend startup failed.',
  'database.readiness-failed': 'Database readiness check failed.',
  'database.migration-failed': 'Database migration failed.',
  'http.handler-failed': 'HTTP request handling failed.',
  'learning.execution-failed': 'Learning request execution failed.',
  'learning.quota-failed': 'Monthly quota lookup failed.',
  'provider.request-failed': 'Provider request failed.',
} as const;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_MESSAGES;

export interface DiagnosticRecord {
  readonly code: DiagnosticCode;
  readonly message: (typeof DIAGNOSTIC_MESSAGES)[DiagnosticCode];
  readonly errorClass: SafeErrorClass;
}

export interface Diagnostics {
  readonly report: (code: DiagnosticCode, cause?: unknown) => void;
}

type SafeErrorClass =
  | 'AccountingFailure'
  | 'ConfigurationError'
  | 'DatabaseConfigurationError'
  | 'Error'
  | 'ProviderFailure'
  | 'TypeError'
  | 'UnknownFailure';

const OWN_FAILURE_TAGS = new Set<SafeErrorClass>([
  'AccountingFailure',
  'ConfigurationError',
  'DatabaseConfigurationError',
  'ProviderFailure',
]);

function safeErrorClass(cause: unknown): SafeErrorClass {
  try {
    if (typeof cause === 'object' && cause !== null && '_tag' in cause) {
      const tag = cause._tag;
      if (
        typeof tag === 'string' &&
        OWN_FAILURE_TAGS.has(tag as SafeErrorClass)
      ) {
        return tag as SafeErrorClass;
      }
    }
  } catch {
    return 'UnknownFailure';
  }
  if (cause instanceof TypeError) return 'TypeError';
  if (cause instanceof Error) return 'Error';
  return 'UnknownFailure';
}

export function makeDiagnostics(
  write: (record: DiagnosticRecord) => void,
): Diagnostics {
  return {
    report(code, cause) {
      write({
        code,
        message: DIAGNOSTIC_MESSAGES[code],
        errorClass: safeErrorClass(cause),
      });
    },
  };
}

export const silentDiagnostics: Diagnostics = makeDiagnostics(() => undefined);

export const consoleDiagnostics: Diagnostics = makeDiagnostics((record) => {
  console.error(JSON.stringify(record));
});
