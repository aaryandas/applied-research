import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  MAX_PRACTICAL_FILE_BYTES,
  type ImportPracticalFileResult,
} from '../contracts/practical-records';
import type { PracticalRecords } from './practical-records';
import { decodePracticalScope } from './practical-validation';
import { awaitPracticalOperation } from './practical-cancellation';

const SELECTION_TIMEOUT_MS = 60_000;

interface PracticalSelectionOptions {
  records: Pick<
    PracticalRecords,
    'loadPracticalAttempt' | 'importPracticalFile'
  >;
  /** Main-owned native dialog. Its path is never accepted from renderer input. */
  chooseFile: (signal: AbortSignal) => Promise<string | null>;
}

export class PracticalFileSelection {
  private pending: AbortController | null = null;
  private dialogPending = false;
  constructor(private readonly options: PracticalSelectionOptions) {}

  async select(value: unknown): Promise<ImportPracticalFileResult> {
    if (this.pending || this.dialogPending) return { status: 'failed' };
    const controller = new AbortController();
    this.pending = controller;
    const timer = setTimeout(() => controller.abort(), SELECTION_TIMEOUT_MS);
    const signal = controller.signal;
    try {
      const scope = decodePracticalScope(value);
      if (this.options.records.loadPracticalAttempt(scope).status !== 'loaded')
        return { status: 'failed' };
      this.dialogPending = true;
      const selection = this.chooseFile(signal);
      const path = await awaitPracticalOperation(selection, signal);
      signal.throwIfAborted();
      if (!path) return { status: 'cancelled' };
      const bytes = await awaitPracticalOperation(
        readSelectedFile(path, signal),
        signal,
      );
      signal.throwIfAborted();
      return this.options.records.importPracticalFile(scope, {
        displayName: basename(path),
        bytes,
      });
    } catch {
      return { status: signal.aborted ? 'cancelled' : 'failed' };
    } finally {
      clearTimeout(timer);
      if (this.pending === controller) this.pending = null;
    }
  }

  cancel(): void {
    this.pending?.abort();
  }

  private async chooseFile(signal: AbortSignal): Promise<string | null> {
    try {
      return await this.options.chooseFile(signal);
    } finally {
      this.dialogPending = false;
    }
  }
}

async function readSelectedFile(
  path: string,
  signal: AbortSignal,
): Promise<Buffer> {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.size < 1 ||
      before.size > MAX_PRACTICAL_FILE_BYTES
    )
      throw new Error('Choose a supported regular evidence file.');
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let count = 0;
    while (count < buffer.length) {
      signal.throwIfAborted();
      const { bytesRead } = await handle.read(
        buffer,
        count,
        buffer.length - count,
        count,
      );
      if (bytesRead === 0) break;
      count += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (
      BigInt(count) !== before.size ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs
    )
      throw new Error('The selected file changed during import.');
    return buffer.subarray(0, count);
  } finally {
    await handle.close();
  }
}
