import {
  bigint,
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { LearningResponse } from '../contracts/learning-api.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
};

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    ...timestamps,
  },
  (table) => [uniqueIndex('user_email_unique').on(table.email)],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('session_token_unique').on(table.token),
    index('session_user_id_index').on(table.userId),
  ],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('account_provider_account_unique').on(
      table.providerId,
      table.accountId,
    ),
    index('account_user_id_index').on(table.userId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('verification_identifier_index').on(table.identifier)],
);

export const usageMonth = pgTable(
  'usage_month',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    monthStart: date('month_start', { mode: 'string' }).notNull(),
    committedMicrousd: bigint('committed_microusd', { mode: 'number' })
      .notNull()
      .default(0),
    reservedMicrousd: bigint('reserved_microusd', { mode: 'number' })
      .notNull()
      .default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.monthStart] })],
);

export const learningRequest = pgTable(
  'learning_request',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    requestId: text('request_id').notNull(),
    requestHash: text('request_hash').notNull(),
    monthStart: date('month_start', { mode: 'string' }).notNull(),
    operation: text('operation').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    state: text('state').notNull(),
    reservedMicrousd: bigint('reserved_microusd', { mode: 'number' }).notNull(),
    actualMicrousd: bigint('actual_microusd', { mode: 'number' }),
    providerRequestId: text('provider_request_id'),
    publicResponse: jsonb('public_response').$type<LearningResponse>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.requestId] }),
    index('learning_request_month_index').on(table.accountId, table.monthStart),
  ],
);

export const sourceDescriptor = pgTable(
  'source_descriptor',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull(),
    provider: text('provider').notNull(),
    providerKey: text('provider_id').notNull(),
    descriptor: jsonb('descriptor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.sourceId] }),
    uniqueIndex('source_descriptor_provider_unique').on(
      table.accountId,
      table.provider,
      table.providerKey,
    ),
  ],
);

export const sourceRevision = pgTable(
  'source_revision',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull(),
    revisionId: text('revision_id').notNull(),
    sha256: text('sha256').notNull(),
    canonicalizationVersion: text('canonicalization_version').notNull(),
    embeddingGeneration: text('embedding_generation'),
    acquired: jsonb('acquired').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.accountId, table.sourceId, table.revisionId],
    }),
    uniqueIndex('source_revision_content_unique').on(
      table.accountId,
      table.sourceId,
      table.sha256,
      table.canonicalizationVersion,
    ),
  ],
);

export const sourceIndexState = pgTable(
  'source_index_state',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull(),
    revisionId: text('revision_id').notNull(),
    embeddingGeneration: text('embedding_generation').notNull(),
    passageCount: bigint('passage_count', { mode: 'number' }).notNull(),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.accountId,
        table.sourceId,
        table.revisionId,
        table.embeddingGeneration,
      ],
    }),
  ],
);

export const sourceOperation = pgTable(
  'source_operation',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    requestId: text('request_id').notNull(),
    kind: text('kind').notNull(),
    inputHash: text('input_hash').notNull(),
    state: text('state').notNull(),
    publicResponse: jsonb('public_response'),
    frozenPayload: jsonb('frozen_payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.requestId] }),
    index('source_operation_kind_index').on(table.accountId, table.kind),
  ],
);

export const providerBudget = pgTable(
  'provider_budget',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    committedMicrousd: bigint('committed_microusd', { mode: 'number' })
      .notNull()
      .default(0),
    reservedMicrousd: bigint('reserved_microusd', { mode: 'number' })
      .notNull()
      .default(0),
    limitMicrousd: bigint('limit_microusd', { mode: 'number' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.accountId, table.provider, table.periodStart],
    }),
  ],
);

export const providerBudgetRequest = pgTable(
  'provider_budget_request',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    requestId: text('request_id').notNull(),
    provider: text('provider').notNull(),
    requestHash: text('request_hash').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    state: text('state').notNull(),
    reservedMicrousd: bigint('reserved_microusd', { mode: 'number' }).notNull(),
    actualMicrousd: bigint('actual_microusd', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.accountId, table.requestId, table.provider],
    }),
  ],
);

export const sharedBudget = pgTable('shared_budget', {
  name: text('name').primaryKey(),
  committedMicrousd: bigint('committed_microusd', { mode: 'number' })
    .notNull()
    .default(0),
  reservedMicrousd: bigint('reserved_microusd', { mode: 'number' })
    .notNull()
    .default(0),
  limitMicrousd: bigint('limit_microusd', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const sharedBudgetRequest = pgTable(
  'shared_budget_request',
  {
    name: text('name')
      .notNull()
      .references(() => sharedBudget.name, { onDelete: 'cascade' }),
    requestId: text('request_id').notNull(),
    requestHash: text('request_hash').notNull(),
    state: text('state').notNull(),
    reservedMicrousd: bigint('reserved_microusd', { mode: 'number' }).notNull(),
    actualMicrousd: bigint('actual_microusd', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.name, table.requestId] })],
);

export const authSchema = { user, session, account, verification };
