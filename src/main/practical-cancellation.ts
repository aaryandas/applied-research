import { addAbortListener } from 'node:events';

/** Stops waiting without granting late work permission to commit or publish. */
export async function awaitPracticalOperation<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let listener: ReturnType<typeof addAbortListener> | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    listener = addAbortListener(signal, () =>
      reject(new Error('Practical operation stopped.')),
    );
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    listener?.[Symbol.dispose]();
    // The loser keeps running and may reject later (a read that hits
    // throwIfAborted); that late rejection must not surface as unhandled.
    void operation.catch(() => undefined);
  }
}
