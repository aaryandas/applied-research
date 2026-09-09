import { describe, expect, it } from 'vitest';
import {
  backendEvidenceOriginOwnership,
  failClosedOriginOwnership,
} from './ownership.js';

const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const origin = {
  projectId: PROJECT,
  sourceVersionId: null,
  questionId: null,
  lessonId: null,
};

describe('origin ownership seams', () => {
  it('fails closed until account-bound backend evidence is injected', async () => {
    const ownership = failClosedOriginOwnership();
    expect(await ownership.assertOwned(ACCOUNT, origin)).toBe(false);
    expect(await ownership.assertOwned(ACCOUNT, origin)).toBe(false);
  });

  it('asks the injected account/project grant and never treats UUID syntax as proof', async () => {
    const seen: string[] = [];
    const ownership = backendEvidenceOriginOwnership({
      async assertAccountOwnsProject(accountId, projectId) {
        seen.push(`${accountId}:${projectId}`);
        return accountId === ACCOUNT && projectId === PROJECT;
      },
    });
    expect(await ownership.assertOwned(ACCOUNT, origin)).toBe(true);
    expect(
      await ownership.assertOwned(ACCOUNT, {
        ...origin,
        projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      }),
    ).toBe(false);
    expect(await ownership.assertOwned('', origin)).toBe(false);
    expect(
      await ownership.assertOwned(ACCOUNT, { ...origin, projectId: '' }),
    ).toBe(false);
    expect(seen).toEqual([
      `${ACCOUNT}:${PROJECT}`,
      `${ACCOUNT}:dddddddd-dddd-4ddd-8ddd-dddddddddddd`,
    ]);
  });
});
