import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { ExportPracticalFileResult } from '../contracts/practical-records';
import type { PracticalRecords } from './practical-records';
import { decodePreviewInput } from './practical-journey-validation';
import { awaitPracticalOperation } from './practical-cancellation';

const EXPORT_TIMEOUT_MS = 60_000;

interface PracticalExportOptions {
  records: Pick<PracticalRecords, 'readPracticalFile'>;
  chooseSavePath: (
    displayName: string,
    signal: AbortSignal,
  ) => Promise<string | null>;
  currentGeneration: () => number;
  isCurrent: (value: unknown, generation: number) => boolean;
}

export class PracticalFileExport {
  private pending: AbortController | null = null;
  private dialogPending = false;
  constructor(private readonly options: PracticalExportOptions) {}

  get occupied(): boolean {
    return this.pending !== null || this.dialogPending;
  }

  async export(value: unknown): Promise<ExportPracticalFileResult> {
    if (this.pending || this.dialogPending) return { status: 'failed' };
    const captured = this.options.currentGeneration();
    const stillCurrent = (): boolean => this.options.isCurrent(value, captured);
    const controller = new AbortController();
    this.pending = controller;
    const timer = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);
    const signal = controller.signal;
    try {
      const input = decodePreviewInput(value);
      if (!stillCurrent()) return { status: 'failed' };
      const retained = this.options.records.readPracticalFile(
        input,
        input.selectionId,
      );
      if (!retained) return { status: 'failed' };
      this.dialogPending = true;
      const path = await awaitPracticalOperation(
        this.chooseSavePath(retained.displayName, signal),
        signal,
      );
      signal.throwIfAborted();
      if (!stillCurrent()) return { status: 'cancelled' };
      if (!path) return { status: 'cancelled' };
      await awaitPracticalOperation(
        writeExactBytes(path, retained.bytes),
        signal,
      );
      signal.throwIfAborted();
      if (!stillCurrent()) return { status: 'cancelled' };
      return {
        status: 'exported',
        byteLength: retained.bytes.length,
        displayName: retained.displayName,
      };
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

  private async chooseSavePath(
    displayName: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    try {
      return await this.options.chooseSavePath(displayName, signal);
    } finally {
      this.dialogPending = false;
    }
  }
}

async function writeExactBytes(path: string, bytes: Buffer): Promise<void> {
  const handle = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
  );
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = await handle.write(bytes, offset, bytes.length - offset);
      offset += written.bytesWritten;
    }
    await handle.datasync();
  } finally {
    await handle.close();
  }
}
