import { spawn } from 'node:child_process';

export interface ProcessRequest {
  command: string;
  args: readonly string[];
  signal: AbortSignal;
  timeoutMs: number;
  maxOutputBytes?: number;
}
export interface ProcessResult {
  launch: 'not-started' | 'started' | 'unknown';
  status: 'exited' | 'cancelled' | 'timeout' | 'output-limit' | 'unavailable';
  code: number | null;
  stdout: string;
  stderr: string;
}
export type ProcessRunner = (request: ProcessRequest) => Promise<ProcessResult>;

/** Detached process group includes grandchildren. Docker containers are removed separately. */
export const runProcess: ProcessRunner = (request) => {
  if (request.signal.aborted)
    return Promise.resolve({
      status: 'cancelled',
      launch: 'not-started',
      code: null,
      stdout: '',
      stderr: '',
    });
  return new Promise((resolve) => {
    const child = spawn(request.command, [...request.args], {
      detached: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      // CLI infrastructure only. No provider/auth environment reaches the child.
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
      },
    });
    let status: ProcessResult['status'] = 'exited';
    let launch: ProcessResult['launch'] = 'not-started';
    child.once('spawn', () => {
      launch = 'started';
    });
    let stdout: Buffer = Buffer.alloc(0);
    let stderr: Buffer = Buffer.alloc(0);
    const limit = request.maxOutputBytes ?? 32_768;
    function stop(reason: ProcessResult['status']): void {
      if (status !== 'exited') return;
      status = reason;
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* Already exited. */
        }
      }
    }
    function append(current: Buffer, chunk: Buffer): Buffer {
      const remaining = limit - current.length;
      const result = Buffer.concat([
        current,
        chunk.subarray(0, Math.max(0, remaining)),
      ]);
      if (chunk.length > remaining) stop('output-limit');
      return result;
    }
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      status = 'unavailable';
      // Node error codes are trusted infrastructure data; never retain error.message/argv.
      const diagnostic =
        error.code === 'ENOENT'
          ? 'Executable not found'
          : error.code === 'EACCES'
            ? 'permission denied'
            : 'Process launch failed';
      stderr = Buffer.from(diagnostic);
    });
    const abort = (): void => stop('cancelled');
    request.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop('timeout'), request.timeoutMs);
    child.once('close', (code) => {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', abort);
      resolve({
        launch,
        status,
        code,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
      });
    });
    if (request.signal.aborted) abort();
  });
};

/** Only fixed diagnostics survive; third-party tracebacks may contain user labels. */
export function safeDiagnostics(result: ProcessResult): {
  stdout: string;
  stderr: string;
} {
  const summarize = (output: string): string => {
    // Docker 29 uses a different connection-error sentence; normalize to one safe marker.
    const normalized = output.replace(
      /failed to connect to the docker API/gi,
      'Cannot connect to the Docker daemon',
    );
    const messages = [
      'Executable not found',
      'Process launch failed',
      'Process runner failed',
      'AR_RENDER_COMPLETE',
      'AR_RENDER_FAILED',
      'permission denied',
      'Cannot connect to the Docker daemon',
      'No such image',
    ];
    return (
      messages.filter((message) => normalized.includes(message)).join('\n') ||
      (output.length > 0 ? 'Third-party output withheld.' : '')
    );
  };
  return { stdout: summarize(result.stdout), stderr: summarize(result.stderr) };
}
