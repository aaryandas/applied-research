import { providerFailure } from './transport.js';

const MAX_QUEUED_OPERATIONS = 4;
interface Waiter {
  resolve: (release: () => void) => void;
  abort: () => void;
  signal: AbortSignal;
}

/** One in-flight operation per configured provider credential, with four waiting callers. */
export function makeProviderQueue(): (
  signal: AbortSignal,
) => Promise<() => void> {
  let active = false;
  const waiters: Waiter[] = [];
  function release(): void {
    const next = waiters.shift();
    if (!next) {
      active = false;
      return;
    }
    next.signal.removeEventListener('abort', next.abort);
    next.resolve(release);
  }
  return async (signal) => {
    signal.throwIfAborted();
    if (!active) {
      active = true;
      return release;
    }
    if (waiters.length >= MAX_QUEUED_OPERATIONS)
      throw providerFailure('queue-full');
    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        signal,
        abort: () => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error('Semantic Scholar queue interrupted.'));
        },
      };
      waiters.push(waiter);
      signal.addEventListener('abort', waiter.abort, { once: true });
    });
  };
}
