import { describe, expect, it, vi } from 'vitest';
import { AccountingFailure } from './accounting.js';
import { makeDiagnostics } from './diagnostics.js';

describe('safe backend diagnostics', () => {
  it('emits only allowlisted codes, messages, and own failure identity', () => {
    const write = vi.fn();
    const diagnostics = makeDiagnostics(write);
    diagnostics.report(
      'accounting.reservation-failed',
      new AccountingFailure({
        message: 'Usage accounting is unavailable.',
        cause: new Error('postgresql://secret@private/driver details'),
      }),
    );
    expect(write).toHaveBeenCalledWith({
      code: 'accounting.reservation-failed',
      message: 'Usage reservation failed.',
      errorClass: 'AccountingFailure',
    });
    expect(JSON.stringify(write.mock.calls)).not.toContain('secret');
  });

  it('never uses arbitrary error names or messages', () => {
    const records: unknown[] = [];
    const diagnostics = makeDiagnostics((record) => records.push(record));
    const error = new Error('credential-value');
    error.name = 'credential-name';
    diagnostics.report('backend.start-failed', error);
    diagnostics.report('http.handler-failed', {
      name: 'provider-body',
      message: 'authorization-header',
    });
    expect(records).toEqual([
      {
        code: 'backend.start-failed',
        message: 'Backend startup failed.',
        errorClass: 'Error',
      },
      {
        code: 'http.handler-failed',
        message: 'HTTP request handling failed.',
        errorClass: 'UnknownFailure',
      },
    ]);
    expect(JSON.stringify(records)).not.toMatch(
      /credential|provider-body|authorization-header/,
    );
  });

  it('survives an unknown object whose identity lookup throws', () => {
    const write = vi.fn();
    const diagnostics = makeDiagnostics(write);
    const hostile = new Proxy(
      {},
      {
        has: () => {
          throw new Error('credential-value');
        },
      },
    );
    expect(() =>
      diagnostics.report('http.handler-failed', hostile),
    ).not.toThrow();
    expect(write).toHaveBeenCalledWith({
      code: 'http.handler-failed',
      message: 'HTTP request handling failed.',
      errorClass: 'UnknownFailure',
    });
  });
});
