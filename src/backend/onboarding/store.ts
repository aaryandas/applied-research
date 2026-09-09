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

export type OnboardingClaimResult =
  | { readonly kind: 'claimed'; readonly revision: number }
  | { readonly kind: 'missing' }
  | { readonly kind: 'stale'; readonly currentRevision: number }
  | { readonly kind: 'conflict' };

export type OnboardingCommitResult = 'saved' | 'stale' | 'conflict';

export interface OnboardingProposalStore {
  readonly get: (
    accountId: string,
    proposalId: string,
  ) => Promise<StoredOnboardingProposal | null>;
  readonly claim: (
    accountId: string,
    proposalId: string,
    expectedRevision: number,
    requestId: string,
    now: Date,
  ) => Promise<OnboardingClaimResult>;
  readonly releaseClaim: (
    accountId: string,
    proposalId: string,
    requestId: string,
    now: Date,
  ) => Promise<void>;
  readonly commit: (
    accountId: string,
    proposal: StoredOnboardingProposal,
    previousRevision: number | null,
    requestId: string,
    now: Date,
  ) => Promise<OnboardingCommitResult>;
}

interface MemoryRow extends StoredOnboardingProposal {
  claimRequestId: string | null;
}

export function makeMemoryOnboardingStore(): OnboardingProposalStore {
  const rows = new Map<string, MemoryRow>();
  const keyFor = (accountId: string, proposalId: string): string =>
    `${accountId}\0${proposalId}`;
  return {
    async get(accountId, proposalId) {
      const row = rows.get(keyFor(accountId, proposalId));
      if (!row) return null;
      return {
        proposalId: row.proposalId,
        revision: row.revision,
        syllabus: row.syllabus,
        diagnostic: row.diagnostic,
      };
    },
    async claim(accountId, proposalId, expectedRevision, requestId) {
      const row = rows.get(keyFor(accountId, proposalId));
      if (!row) return { kind: 'missing' };
      if (row.revision !== expectedRevision) {
        return { kind: 'stale', currentRevision: row.revision };
      }
      if (row.claimRequestId && row.claimRequestId !== requestId) {
        return { kind: 'conflict' };
      }
      row.claimRequestId = requestId;
      return { kind: 'claimed', revision: row.revision };
    },
    async releaseClaim(accountId, proposalId, requestId) {
      const row = rows.get(keyFor(accountId, proposalId));
      if (row && row.claimRequestId === requestId) {
        row.claimRequestId = null;
      }
    },
    async commit(accountId, proposal, previousRevision, requestId) {
      const key = keyFor(accountId, proposal.proposalId);
      if (previousRevision === null) {
        if (rows.has(key)) return 'conflict';
        rows.set(key, { ...proposal, claimRequestId: null });
        return 'saved';
      }
      const row = rows.get(key);
      if (!row) return 'conflict';
      if (row.revision !== previousRevision) {
        return 'stale';
      }
      if (row.claimRequestId !== requestId) return 'conflict';
      rows.set(key, { ...proposal, claimRequestId: null });
      return 'saved';
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
    async claim(accountId, proposalId, expectedRevision, requestId, now) {
      const claimed = await database.pool.query<{ revision: number }>(
        `UPDATE onboarding_proposal
         SET claim_request_id = $4, updated_at = $5
         WHERE account_id = $1 AND proposal_id = $2 AND revision = $3
           AND (claim_request_id IS NULL OR claim_request_id = $4)
         RETURNING revision`,
        [accountId, proposalId, expectedRevision, requestId, now],
      );
      if ((claimed.rowCount ?? 0) > 0) {
        return { kind: 'claimed', revision: expectedRevision };
      }
      const existing = await database.pool.query<{
        revision: number;
        claim_request_id: string | null;
      }>(
        `SELECT revision, claim_request_id
         FROM onboarding_proposal
         WHERE account_id = $1 AND proposal_id = $2`,
        [accountId, proposalId],
      );
      const row = existing.rows[0];
      if (!row) return { kind: 'missing' };
      if (row.revision !== expectedRevision) {
        return { kind: 'stale', currentRevision: row.revision };
      }
      return { kind: 'conflict' };
    },
    async releaseClaim(accountId, proposalId, requestId, now) {
      await database.pool.query(
        `UPDATE onboarding_proposal
         SET claim_request_id = NULL, updated_at = $4
         WHERE account_id = $1 AND proposal_id = $2 AND claim_request_id = $3`,
        [accountId, proposalId, requestId, now],
      );
    },
    async commit(accountId, proposal, previousRevision, requestId, now) {
      if (previousRevision === null) {
        const inserted = await database.pool.query(
          `INSERT INTO onboarding_proposal (
             account_id, proposal_id, revision, syllabus, diagnostic,
             created_at, updated_at, claim_request_id
           ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6, NULL)
           ON CONFLICT (account_id, proposal_id) DO NOTHING`,
          [
            accountId,
            proposal.proposalId,
            proposal.revision,
            JSON.stringify(proposal.syllabus),
            JSON.stringify(proposal.diagnostic),
            now,
          ],
        );
        return (inserted.rowCount ?? 0) > 0 ? 'saved' : 'conflict';
      }
      const updated = await database.pool.query(
        `UPDATE onboarding_proposal
         SET revision = $3, syllabus = $4::jsonb, diagnostic = $5::jsonb,
             claim_request_id = NULL, updated_at = $7
         WHERE account_id = $1 AND proposal_id = $2
           AND revision = $8 AND claim_request_id = $6`,
        [
          accountId,
          proposal.proposalId,
          proposal.revision,
          JSON.stringify(proposal.syllabus),
          JSON.stringify(proposal.diagnostic),
          requestId,
          now,
          previousRevision,
        ],
      );
      if ((updated.rowCount ?? 0) > 0) return 'saved';
      const existing = await database.pool.query<{ revision: number }>(
        `SELECT revision FROM onboarding_proposal
         WHERE account_id = $1 AND proposal_id = $2`,
        [accountId, proposal.proposalId],
      );
      const row = existing.rows[0];
      if (row && row.revision !== previousRevision) return 'stale';
      return 'conflict';
    },
  };
}
