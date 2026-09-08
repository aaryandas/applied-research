import { describe, expect, it, vi } from 'vitest';
import { makeDesktopAuthDiagnostics } from './auth-diagnostics';

describe('desktop auth diagnostics', () => {
  it('emits only allowlisted messages and safe error classes', () => {
    const write = vi.fn();
    const diagnostics = makeDesktopAuthDiagnostics(write);
    const secret = 'postgresql://user:password@example.invalid/database';

    diagnostics.report(
      'auth.session-refresh-failed',
      Object.assign(new Error(secret), { name: secret }),
    );
    diagnostics.report('auth.storage-failed', new TypeError(secret));
    diagnostics.report('auth.exchange-failed', { body: secret });

    expect(write.mock.calls).toEqual([
      [
        {
          code: 'auth.session-refresh-failed',
          message: 'Session refresh failed.',
          errorClass: 'Error',
        },
      ],
      [
        {
          code: 'auth.storage-failed',
          message: 'Secure session storage failed.',
          errorClass: 'TypeError',
        },
      ],
      [
        {
          code: 'auth.exchange-failed',
          message: 'Authentication exchange failed.',
          errorClass: 'Unknown',
        },
      ],
    ]);
    expect(JSON.stringify(write.mock.calls)).not.toContain(secret);
  });
});
