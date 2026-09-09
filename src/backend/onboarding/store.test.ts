import { describe, expect, it } from 'vitest';
import type { OnboardingSyllabus } from '../../contracts/learning-onboarding-api.js';
import type { DatabaseService } from '../database.js';
import {
  makeMemoryOnboardingStore,
  makePostgresOnboardingStore,
} from './store.js';

const AT = new Date('2026-09-09T12:00:00.000Z');

const syllabus: OnboardingSyllabus = {
  title: 'Cited floating-point syllabus',
  topics: [
    {
      topicId: 'topic-01',
      title: 'Hardware fractions',
      outcome: 'Use the cited hardware-fraction constraint.',
      prerequisiteTopicIds: [],
      lessons: [
        {
          stepId: 'step-001',
          title: 'Hardware fractions',
          objective: 'Use the cited hardware-fraction constraint.',
          activity: 'Cite the binary-fraction sentence.',
          role: 'concept',
          prerequisiteStepIds: [],
          sourceState: 'ready',
          sourceIds: ['source-fp01'],
          practice: null,
        },
      ],
    },
  ],
  capstone: null,
};

const diagnostic = {
  author: 'ai' as const,
  summary: 'AI diagnostic review. This is not proof of mastery.',
  observedGaps: ['No diagnostic answer was supplied for this goal.'],
  masteryEstablished: false as const,
};

describe('onboarding proposal store claims', () => {
  it('inserts a first revision and rejects a duplicate proposal id', async () => {
    const store = makeMemoryOnboardingStore();
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 1, syllabus, diagnostic },
        null,
        'request-create',
        AT,
      ),
    ).toBe('saved');
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 1, syllabus, diagnostic },
        null,
        'request-dup',
        AT,
      ),
    ).toBe('conflict');
    expect(await store.get('account-1', 'proposal-01')).toMatchObject({
      revision: 1,
    });
  });

  it('requires an expected-revision claim before a paid rewrite can commit', async () => {
    const store = makeMemoryOnboardingStore();
    await store.commit(
      'account-1',
      { proposalId: 'proposal-01', revision: 1, syllabus, diagnostic },
      null,
      'request-create',
      AT,
    );
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 2, syllabus, diagnostic },
        1,
        'request-unclaimed',
        AT,
      ),
    ).toBe('conflict');
    expect(
      await store.claim('account-1', 'proposal-01', 1, 'request-rev-a', AT),
    ).toEqual({ kind: 'claimed', revision: 1 });
    expect(
      await store.claim('account-1', 'proposal-01', 1, 'request-rev-b', AT),
    ).toEqual({ kind: 'conflict' });
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 2, syllabus, diagnostic },
        1,
        'request-rev-b',
        AT,
      ),
    ).toBe('conflict');
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 2, syllabus, diagnostic },
        1,
        'request-rev-a',
        AT,
      ),
    ).toBe('saved');
    expect(await store.get('account-1', 'proposal-01')).toMatchObject({
      revision: 2,
    });
    expect(
      await store.claim('account-1', 'proposal-01', 1, 'request-stale', AT),
    ).toEqual({ kind: 'stale', currentRevision: 2 });
  });

  it('releases a claim so a later request can rewrite', async () => {
    const store = makeMemoryOnboardingStore();
    await store.commit(
      'account-1',
      { proposalId: 'proposal-01', revision: 1, syllabus, diagnostic },
      null,
      'request-create',
      AT,
    );
    await store.claim('account-1', 'proposal-01', 1, 'request-rev-a', AT);
    await store.releaseClaim('account-1', 'proposal-01', 'request-rev-a', AT);
    expect(
      await store.claim('account-1', 'proposal-01', 1, 'request-rev-b', AT),
    ).toEqual({ kind: 'claimed', revision: 1 });
  });
});

describe('postgres onboarding store adapter', () => {
  function fakeDatabase() {
    const rows = new Map<
      string,
      {
        revision: number;
        syllabus: OnboardingSyllabus;
        diagnostic: typeof diagnostic;
        claim: string | null;
      }
    >();
    const keyFor = (accountId: unknown, proposalId: unknown): string =>
      `${String(accountId)}\0${String(proposalId)}`;
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        const text = sql.replace(/\s+/g, ' ');
        if (text.includes('SELECT revision, syllabus, diagnostic')) {
          const row = rows.get(keyFor(params[0], params[1]));
          return {
            rowCount: row ? 1 : 0,
            rows: row
              ? [
                  {
                    revision: row.revision,
                    syllabus: row.syllabus,
                    diagnostic: row.diagnostic,
                  },
                ]
              : [],
          };
        }
        if (text.includes('SET claim_request_id = $4')) {
          const row = rows.get(keyFor(params[0], params[1]));
          if (
            row &&
            row.revision === params[2] &&
            (row.claim === null || row.claim === params[3])
          ) {
            row.claim = String(params[3]);
            return { rowCount: 1, rows: [{ revision: row.revision }] };
          }
          return { rowCount: 0, rows: [] };
        }
        if (text.includes('SELECT revision, claim_request_id')) {
          const row = rows.get(keyFor(params[0], params[1]));
          return {
            rowCount: row ? 1 : 0,
            rows: row
              ? [{ revision: row.revision, claim_request_id: row.claim }]
              : [],
          };
        }
        if (
          text.includes('SET claim_request_id = NULL') &&
          text.includes('$3')
        ) {
          const row = rows.get(keyFor(params[0], params[1]));
          if (row && row.claim === params[2]) row.claim = null;
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('INSERT INTO onboarding_proposal')) {
          const key = keyFor(params[0], params[1]);
          if (rows.has(key)) return { rowCount: 0, rows: [] };
          rows.set(key, {
            revision: Number(params[2]),
            syllabus: JSON.parse(String(params[3])) as OnboardingSyllabus,
            diagnostic: JSON.parse(String(params[4])) as typeof diagnostic,
            claim: null,
          });
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('SET revision = $3')) {
          const row = rows.get(keyFor(params[0], params[1]));
          if (row && row.revision === params[7] && row.claim === params[5]) {
            row.revision = Number(params[2]);
            row.syllabus = JSON.parse(String(params[3])) as OnboardingSyllabus;
            row.diagnostic = JSON.parse(String(params[4])) as typeof diagnostic;
            row.claim = null;
            return { rowCount: 1, rows: [] };
          }
          return { rowCount: 0, rows: [] };
        }
        if (text.includes('SELECT revision FROM onboarding_proposal')) {
          const row = rows.get(keyFor(params[0], params[1]));
          return {
            rowCount: row ? 1 : 0,
            rows: row ? [{ revision: row.revision }] : [],
          };
        }
        throw new Error(`unexpected sql: ${text}`);
      },
    };
    return {
      store: makePostgresOnboardingStore({
        pool,
        db: {},
      } as unknown as DatabaseService),
    };
  }

  it('claims, conflicts, and commits through the SQL adapter', async () => {
    const { store } = fakeDatabase();
    expect(await store.get('account-1', 'proposal-01')).toBeNull();
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 1, syllabus, diagnostic },
        null,
        'request-create',
        AT,
      ),
    ).toBe('saved');
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 1, syllabus, diagnostic },
        null,
        'request-dup',
        AT,
      ),
    ).toBe('conflict');
    expect(
      await store.claim('account-1', 'missing', 1, 'request-miss', AT),
    ).toEqual({ kind: 'missing' });
    expect(
      await store.claim('account-1', 'proposal-01', 1, 'request-rev-a', AT),
    ).toEqual({ kind: 'claimed', revision: 1 });
    expect(
      await store.claim('account-1', 'proposal-01', 1, 'request-rev-b', AT),
    ).toEqual({ kind: 'conflict' });
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 2, syllabus, diagnostic },
        1,
        'request-rev-a',
        AT,
      ),
    ).toBe('saved');
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 3, syllabus, diagnostic },
        1,
        'request-rev-b',
        AT,
      ),
    ).toBe('stale');
    expect(
      await store.claim('account-1', 'proposal-01', 1, 'request-old', AT),
    ).toEqual({ kind: 'stale', currentRevision: 2 });
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'missing', revision: 2, syllabus, diagnostic },
        1,
        'request-ghost',
        AT,
      ),
    ).toBe('conflict');
    await store.releaseClaim('account-1', 'proposal-01', 'unused-claim', AT);
    expect(await store.get('account-1', 'proposal-01')).toMatchObject({
      revision: 2,
      proposalId: 'proposal-01',
    });
  });
});
