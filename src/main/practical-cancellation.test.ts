import { expect, it } from 'vitest';
import { awaitPracticalOperation } from './practical-cancellation';

it('refuses an already aborted signal without waiting for the operation', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    awaitPracticalOperation(new Promise(() => {}), controller.signal),
  ).rejects.toThrow('Practical operation stopped.');
});

it('stops on abort and absorbs the late rejection of the dropped operation', async () => {
  const controller = new AbortController();
  const late = new Promise<never>((_resolve, reject) =>
    setTimeout(() => reject(new Error('late read')), 5),
  );
  const waiting = awaitPracticalOperation(late, controller.signal);
  controller.abort();
  await expect(waiting).rejects.toThrow('Practical operation stopped.');
  // The loser settles after the race; an unhandled rejection here fails the run.
  await new Promise((resolve) => setTimeout(resolve, 20));
});
