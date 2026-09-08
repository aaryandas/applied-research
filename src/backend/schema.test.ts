import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  account,
  learningRequest,
  session,
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
});
