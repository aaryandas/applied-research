import { getTableConfig } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EMBEDDING_EVAL_ALLOWANCE_ID,
  EMBEDDING_EVAL_LIMIT_MICROUSD,
  EMBEDDING_EVAL_PRIOR_OPERATION_IDS,
  EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
  EMBEDDING_EVAL_REMAINING_MICROUSD,
} from './policy.js';
import {
  account,
  learningRequest,
  providerBudget,
  session,
  sharedBudget,
  sourceDescriptor,
  sourceIndexState,
  sourceOperation,
  sourceRevision,
  usageMonth,
  user,
  verification,
} from './schema.js';

describe('PostgreSQL schema declarations', () => {
  it.each([
    [user, 'user'],
    [session, 'session'],
    [account, 'account'],
    [verification, 'verification'],
    [usageMonth, 'usage_month'],
    [learningRequest, 'learning_request'],
    [sourceDescriptor, 'source_descriptor'],
    [sourceRevision, 'source_revision'],
    [sourceOperation, 'source_operation'],
    [sourceIndexState, 'source_index_state'],
    [providerBudget, 'provider_budget'],
    [sharedBudget, 'shared_budget'],
  ])('declares the reviewed %s table', (table, name) => {
    expect(getTableConfig(table).name).toBe(name);
  });

  it('declares auth indexes and composite usage keys', () => {
    expect(
      getTableConfig(user).indexes.map(({ config }) => config.name),
    ).toContain('user_email_unique');
    expect(
      getTableConfig(session).indexes.map(({ config }) => config.name),
    ).toContain('session_token_unique');
    expect(getTableConfig(usageMonth).primaryKeys).toHaveLength(1);
    expect(getTableConfig(learningRequest).primaryKeys).toHaveLength(1);
  });

  it('reconciles the coordinator embedding probe into the shared eval ledger', () => {
    const sql = readFileSync(
      new URL('./migrations/0002_sourced_backend.sql', import.meta.url),
      'utf8',
    );
    expect(EMBEDDING_EVAL_REMAINING_MICROUSD).toBe(249_996);
    expect(EMBEDDING_EVAL_LIMIT_MICROUSD).toBe(250_000);
    expect(EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD).toBe(4);
    expect(sql).toContain("'embedding-eval'");
    expect(sql).toContain('250000');
    expect(sql).toContain(EMBEDDING_EVAL_ALLOWANCE_ID);
    expect(sql).toContain('  4,\n  0,\n  250000,');
    for (const operationId of EMBEDDING_EVAL_PRIOR_OPERATION_IDS) {
      expect(sql).toContain(operationId);
    }
  });

  it('seeds an unused global generation-eval allowance without resetting embeddings', () => {
    const sql = readFileSync(
      new URL('./migrations/0003_generation_eval.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("'generation-eval'");
    expect(sql).toContain('2000000');
    expect(sql).toContain('  10,');
    expect(sql).toContain('onboarding_proposal');
    expect(sql).not.toContain('250000');
    expect(sql).not.toContain(EMBEDDING_EVAL_ALLOWANCE_ID);
  });
});
