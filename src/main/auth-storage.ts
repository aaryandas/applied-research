import { AsyncLocalStorage } from 'node:async_hooks';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { Storage } from '@better-auth/electron/client';
import type { DesktopAuthDiagnostics } from './auth-diagnostics';
import { silentDesktopAuthDiagnostics } from './auth-diagnostics';

export const AUTH_STORAGE_KEYS = [
  'applied-research-auth.cookie',
  'applied-research-auth.local_cache',
] as const;

const ALLOWED_KEYS: ReadonlySet<string> = new Set(AUTH_STORAGE_KEYS);
const MAX_STORED_VALUE_BYTES = 256 * 1024;
const MAX_STORAGE_FILE_BYTES = 2 * MAX_STORED_VALUE_BYTES + 1024;

interface StorageContext {
  readonly epoch: number;
  readonly snapshot: ReadonlyMap<string, string> | null;
  readonly permitsWrites: boolean;
}

export interface AuthStorage extends Storage {
  readonly failureCount: number;
  acceptEpoch(epoch: number): void;
  clear(): boolean;
  hasPersistedSession(): boolean;
  runAtEpoch<A>(epoch: number, operation: () => Promise<A>): Promise<A>;
  runWithSnapshot<A>(
    epoch: number,
    snapshot: ReadonlyMap<string, string>,
    operation: () => Promise<A>,
  ): Promise<A>;
  snapshot(): ReadonlyMap<string, string>;
}

function storedRecord(value: unknown): Map<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const stored = new Map<string, string>();
  for (const [key, item] of Object.entries(value)) {
    if (
      !ALLOWED_KEYS.has(key) ||
      typeof item !== 'string' ||
      Buffer.byteLength(item, 'utf8') > MAX_STORED_VALUE_BYTES
    ) {
      return null;
    }
    stored.set(key, item);
  }
  return stored;
}

export function createAuthStorage(
  filePath: string,
  diagnostics: DesktopAuthDiagnostics = silentDesktopAuthDiagnostics,
): AuthStorage {
  const context = new AsyncLocalStorage<StorageContext>();
  let acceptedEpoch = 0;
  let cached: Map<string, string> | null = null;
  let failures = 0;
  let temporarySequence = 0;

  const reportFailure = (cause?: unknown): void => {
    failures += 1;
    diagnostics.report('auth.storage-failed', cause);
  };

  const load = (): Map<string, string> => {
    if (cached) return cached;
    try {
      const metadata = statSync(filePath, { throwIfNoEntry: false });
      if (!metadata) {
        cached = new Map();
        return cached;
      }
      if (!metadata.isFile() || metadata.size > MAX_STORAGE_FILE_BYTES) {
        reportFailure();
        cached = new Map();
        return cached;
      }
      const parsed = storedRecord(JSON.parse(readFileSync(filePath, 'utf8')));
      if (!parsed) {
        reportFailure();
        cached = new Map();
        return cached;
      }
      cached = parsed;
      return cached;
    } catch (cause) {
      reportFailure(cause);
      cached = new Map();
      return cached;
    }
  };

  const persist = (values: ReadonlyMap<string, string>): void => {
    const directory = dirname(filePath);
    const temporaryPath = `${filePath}.${process.pid}.${temporarySequence++}.tmp`;
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const serialized = JSON.stringify(Object.fromEntries(values));
      if (Buffer.byteLength(serialized, 'utf8') > MAX_STORAGE_FILE_BYTES) {
        throw new RangeError('Secure session storage is too large.');
      }
      writeFileSync(temporaryPath, serialized, {
        encoding: 'utf8',
        flag: 'wx',
        flush: true,
        mode: 0o600,
      });
      renameSync(temporaryPath, filePath);
      chmodSync(filePath, 0o600);
      cached = new Map(values);
    } catch (cause) {
      rmSync(temporaryPath, { force: true });
      reportFailure(cause);
      throw new Error('Secure session storage could not be updated.', {
        cause,
      });
    }
  };

  return {
    get failureCount() {
      return failures;
    },
    acceptEpoch(epoch) {
      acceptedEpoch = epoch;
    },
    getItem(name) {
      if (!ALLOWED_KEYS.has(name)) {
        reportFailure();
        return null;
      }
      const active = context.getStore();
      if (active?.snapshot?.has(name)) return active.snapshot.get(name) ?? null;
      return load().get(name) ?? null;
    },
    setItem(name, value) {
      if (!ALLOWED_KEYS.has(name) || typeof value !== 'string') {
        reportFailure();
        throw new TypeError('Secure session storage rejected a value.');
      }
      if (Buffer.byteLength(value, 'utf8') > MAX_STORED_VALUE_BYTES) {
        reportFailure();
        throw new RangeError('Secure session storage rejected a value.');
      }
      const active = context.getStore();
      if (!active || !active.permitsWrites || active.epoch !== acceptedEpoch) {
        return;
      }
      const next = new Map(load());
      next.set(name, value);
      persist(next);
    },
    clear() {
      try {
        rmSync(filePath, { force: true });
        cached = new Map();
        return true;
      } catch (cause) {
        reportFailure(cause);
        cached = new Map();
        return false;
      }
    },
    hasPersistedSession() {
      return load().has(AUTH_STORAGE_KEYS[0]);
    },
    runAtEpoch(epoch, operation) {
      return context.run(
        { epoch, snapshot: null, permitsWrites: true },
        operation,
      );
    },
    runWithSnapshot(epoch, snapshot, operation) {
      return context.run({ epoch, snapshot, permitsWrites: false }, operation);
    },
    snapshot() {
      return new Map(load());
    },
  };
}
