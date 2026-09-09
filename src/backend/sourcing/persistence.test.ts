import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { STARTER_CATALOG_SOURCES } from './catalog.js';
import { makeMemorySourcePersistence } from './persistence.js';

const source = STARTER_CATALOG_SOURCES.find((item) =>
  item.sourceId.includes('python'),
);

describe('account-owned source persistence', () => {
  it('refuses cross-account descriptor lookup and keeps revisions immutable', async () => {
    if (!source) throw new Error('expected reviewed PSF chapter');
    const persistence = makeMemorySourcePersistence();
    const now = new Date('2026-09-09T00:00:00.000Z');
    await Effect.runPromise(
      persistence.saveDescriptor('account-a', source, now),
    );
    expect(
      await Effect.runPromise(
        persistence.getDescriptor(
          'account-b',
          source.sourceId,
          source.providerIds[0],
        ),
      ),
    ).toBeNull();
    expect(
      await Effect.runPromise(
        persistence.getDescriptor(
          'account-a',
          source.sourceId,
          source.providerIds[0],
        ),
      ),
    ).toMatchObject({ sourceId: source.sourceId });
  });
});
