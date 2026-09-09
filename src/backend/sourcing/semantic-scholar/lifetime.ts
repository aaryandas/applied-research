export interface Deadline {
  signal: AbortSignal;
  dispose: () => void;
}

export function deadline(parent: AbortSignal, milliseconds: number): Deadline {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) controller.abort();
  const timer = setTimeout(abort, milliseconds);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent.removeEventListener('abort', abort);
    },
  };
}

/** Settle on cancellation even when an injected transport fails to honor abort. */
export function withAbort<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted)
    return Promise.reject(new Error('Semantic Scholar request interrupted.'));
  return new Promise((resolve, reject) => {
    const abort = (): void =>
      reject(new Error('Semantic Scholar request interrupted.'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return operation();
      })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function pause(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await withAbort(
      () =>
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, milliseconds);
        }),
      signal,
    );
  } finally {
    clearTimeout(timer);
  }
}
