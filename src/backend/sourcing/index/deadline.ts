import { IndexOperationError } from './results.js';

const DEFAULT_TIMEOUT_MILLISECONDS = 10_000;
const MAX_TIMEOUT_MILLISECONDS = 30_000;

export async function abortable<A>(
  operation: () => Promise<A>,
  signal: AbortSignal,
): Promise<A> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = (): void => reject(new IndexOperationError('cancelled'));
    signal.addEventListener('abort', abort, { once: true });
    operation()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function withDeadline<A>(
  parent: AbortSignal,
  milliseconds: number | undefined,
  operation: (signal: AbortSignal) => Promise<A>,
): Promise<A> {
  if (parent.aborted) throw new IndexOperationError('cancelled');
  const timeout =
    milliseconds !== undefined &&
    Number.isSafeInteger(milliseconds) &&
    milliseconds > 0 &&
    milliseconds <= MAX_TIMEOUT_MILLISECONDS
      ? milliseconds
      : DEFAULT_TIMEOUT_MILLISECONDS;
  const controller = new AbortController();
  const signal = AbortSignal.any([parent, controller.signal]);
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await abortable(() => operation(signal), signal);
  } catch (error) {
    if (parent.aborted) throw new IndexOperationError('cancelled');
    if (controller.signal.aborted) throw new IndexOperationError('timed-out');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
