import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeDesktopAuthDiagnostics } from './auth-diagnostics';
import { AUTH_STORAGE_KEYS, createAuthStorage } from './auth-storage';

const temporaryDirectories: string[] = [];

function temporaryFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ar12-auth-storage-'));
  temporaryDirectories.push(directory);
  return join(directory, 'auth', 'session.json');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('auth storage', () => {
  it.skipIf(process.platform === 'win32')('persists only SDK ciphertext with restrictive permissions', async () => {
    const path = temporaryFile();
    const storage = createAuthStorage(path);
    storage.acceptEpoch(1);

    await storage.runAtEpoch(1, async () => {
      storage.setItem(AUTH_STORAGE_KEYS[0], 'base64-sdk-ciphertext');
    });

    expect(readFileSync(path, 'utf8')).toBe(
      '{"applied-research-auth.cookie":"base64-sdk-ciphertext"}',
    );
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(createAuthStorage(path).getItem(AUTH_STORAGE_KEYS[0])).toBe(
      'base64-sdk-ciphertext',
    );
  });

  it('rejects unknown keys, oversized values, and malformed files', async () => {
    const path = temporaryFile();
    const reports: unknown[] = [];
    const storage = createAuthStorage(
      path,
      makeDesktopAuthDiagnostics((diagnostic) => reports.push(diagnostic)),
    );
    storage.acceptEpoch(1);

    expect(storage.getItem('raw-token')).toBeNull();
    await expect(
      storage.runAtEpoch(1, async () => {
        storage.setItem(AUTH_STORAGE_KEYS[0], 'x'.repeat(256 * 1024 + 1));
      }),
    ).rejects.toThrow('rejected');
    expect(reports).toHaveLength(2);
  });

  it('rejects malformed, unknown and oversized persisted records', () => {
    for (const contents of [
      'null',
      '[]',
      '{"unknown":"ciphertext"}',
      '{"applied-research-auth.cookie":42}',
      '{broken-json',
    ]) {
      const path = temporaryFile();
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, contents);
      const storage = createAuthStorage(path);
      expect(storage.getItem(AUTH_STORAGE_KEYS[0])).toBeNull();
      expect(storage.failureCount).toBeGreaterThan(0);
    }

    const oversizedPath = temporaryFile();
    mkdirSync(join(oversizedPath, '..'), { recursive: true });
    writeFileSync(oversizedPath, 'x'.repeat(2 * 256 * 1024 + 1_025));
    const oversized = createAuthStorage(oversizedPath);
    expect(oversized.hasPersistedSession()).toBe(false);
    expect(oversized.failureCount).toBe(1);
  });

  it('rejects non-string values even for allowlisted SDK keys', async () => {
    const storage = createAuthStorage(temporaryFile());
    storage.acceptEpoch(1);
    await expect(
      storage.runAtEpoch(1, async () => {
        storage.setItem(AUTH_STORAGE_KEYS[0], 42);
      }),
    ).rejects.toThrow('rejected');
  });

  it('denies stale async writes and exposes a read-only revocation snapshot', async () => {
    const path = temporaryFile();
    const storage = createAuthStorage(path);
    storage.acceptEpoch(1);
    let finishStaleWrite: (() => void) | undefined;
    const staleWrite = storage.runAtEpoch(
      1,
      () =>
        new Promise<void>((resolve) => {
          finishStaleWrite = () => {
            storage.setItem(AUTH_STORAGE_KEYS[0], 'stale-ciphertext');
            resolve();
          };
        }),
    );

    storage.acceptEpoch(2);
    finishStaleWrite?.();
    await staleWrite;
    expect(storage.hasPersistedSession()).toBe(false);

    await storage.runAtEpoch(2, async () => {
      storage.setItem(AUTH_STORAGE_KEYS[0], 'current-ciphertext');
    });
    const snapshot = storage.snapshot();
    expect(storage.clear()).toBe(true);
    await storage.runWithSnapshot(2, snapshot, async () => {
      expect(storage.getItem(AUTH_STORAGE_KEYS[0])).toBe('current-ciphertext');
      storage.setItem(AUTH_STORAGE_KEYS[0], 'late-ciphertext');
    });
    expect(storage.hasPersistedSession()).toBe(false);
  });

  it('records atomic write and clear failures without driver details', async () => {
    const path = temporaryFile();
    mkdirSync(path, { recursive: true });
    const write = vi.fn();
    const storage = createAuthStorage(path, makeDesktopAuthDiagnostics(write));
    storage.acceptEpoch(1);

    await expect(
      storage.runAtEpoch(1, async () => {
        storage.setItem(AUTH_STORAGE_KEYS[0], 'ciphertext');
      }),
    ).rejects.toThrow('could not be updated');
    expect(storage.clear()).toBe(false);
    expect(write).toHaveBeenCalled();
    expect(JSON.stringify(write.mock.calls)).not.toContain(path);
  });
});
