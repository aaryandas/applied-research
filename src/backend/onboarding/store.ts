import type { OnboardingSyllabus } from '../../contracts/learning-onboarding-api.js';
import type { DatabaseService } from '../database.js';

export interface StoredOnboardingProposal {
  readonly proposalId: string;
  readonly revision: number;
  readonly syllabus: OnboardingSyllabus;
  readonly diagnostic: OnboardingPersonalizationRecord;
}

export interface OnboardingPersonalizationRecord {
  readonly author: 'ai';
  readonly summary: string;
  readonly observedGaps: readonly string[];
  readonly masteryEstablished: false;
}

export interface OnboardingProposalStore {
  readonly get: (
    accountId: string,
    proposalId: string,
  ) => Promise<StoredOnboardingProposal | null>;
  readonly save: (
    accountId: string,
    proposal: StoredOnboardingProposal,
    now: Date,
  ) => Promise<void>;
}

export function makeMemoryOnboardingStore(): OnboardingProposalStore {
  const rows = new Map<string, StoredOnboardingProposal>();
  const keyFor = (accountId: string, proposalId: string): string =>
    `${accountId}\0${proposalId}`;
  return {
    async get(accountId, proposalId) {
      return rows.get(keyFor(accountId, proposalId)) ?? null;
    },
    async save(accountId, proposal) {
      rows.set(keyFor(accountId, proposal.proposalId), proposal);
    },
  };
}

export function makePostgresOnboardingStore(
  database: DatabaseService,
): OnboardingProposalStore {
  return {
    async get(accountId, proposalId) {
      const result = await database.pool.query<{
        revision: number;
        syllabus: OnboardingSyllabus;
        diagnostic: OnboardingPersonalizationRecord;
      }>(
        `SELECT revision, syllabus, diagnostic
         FROM onboarding_proposal
         WHERE account_id = $1 AND proposal_id = $2`,
        [accountId, proposalId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        proposalId,
        revision: row.revision,
        syllabus: row.syllabus,
        diagnostic: row.diagnostic,
      };
    },
    async save(accountId, proposal, now) {
      await database.pool.query(
        `INSERT INTO onboarding_proposal (
           account_id, proposal_id, revision, syllabus, diagnostic,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6)
         ON CONFLICT (account_id, proposal_id) DO UPDATE SET
           revision = EXCLUDED.revision,
           syllabus = EXCLUDED.syllabus,
           diagnostic = EXCLUDED.diagnostic,
           updated_at = EXCLUDED.updated_at`,
        [
          accountId,
          proposal.proposalId,
          proposal.revision,
          JSON.stringify(proposal.syllabus),
          JSON.stringify(proposal.diagnostic),
          now,
        ],
      );
    },
  };
}
