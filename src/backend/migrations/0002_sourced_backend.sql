CREATE TABLE source_descriptor (
  account_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  source_id text NOT NULL,
  provider text NOT NULL,
  provider_id text NOT NULL,
  descriptor jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, source_id)
);
CREATE UNIQUE INDEX source_descriptor_provider_unique
  ON source_descriptor (account_id, provider, provider_id);

CREATE TABLE source_revision (
  account_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  source_id text NOT NULL,
  revision_id text NOT NULL,
  sha256 text NOT NULL,
  canonicalization_version text NOT NULL,
  embedding_generation text,
  acquired jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, source_id, revision_id)
);
CREATE UNIQUE INDEX source_revision_content_unique
  ON source_revision (
    account_id,
    source_id,
    sha256,
    canonicalization_version
  );

CREATE TABLE source_index_state (
  account_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  source_id text NOT NULL,
  revision_id text NOT NULL,
  embedding_generation text NOT NULL,
  passage_count bigint NOT NULL,
  indexed_at timestamptz NOT NULL,
  PRIMARY KEY (
    account_id,
    source_id,
    revision_id,
    embedding_generation
  ),
  CONSTRAINT source_index_state_passage_count_nonnegative
    CHECK (passage_count >= 0)
);

CREATE TABLE source_operation (
  account_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  request_id text NOT NULL,
  kind text NOT NULL,
  input_hash text NOT NULL,
  state text NOT NULL,
  public_response jsonb,
  frozen_payload jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, request_id),
  CONSTRAINT source_operation_kind_valid CHECK (
    kind IN ('discover', 'acquire', 'sourced')
  ),
  CONSTRAINT source_operation_state_valid CHECK (
    state IN ('in-progress', 'completed', 'uncertain')
  )
);
CREATE INDEX source_operation_kind_index
  ON source_operation (account_id, kind);

CREATE TABLE provider_budget (
  account_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  provider text NOT NULL,
  period_start date NOT NULL,
  committed_microusd bigint NOT NULL DEFAULT 0,
  reserved_microusd bigint NOT NULL DEFAULT 0,
  limit_microusd bigint NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, provider, period_start),
  CONSTRAINT provider_budget_provider_valid CHECK (
    provider IN ('openalex', 'embedding')
  ),
  CONSTRAINT provider_budget_committed_nonnegative CHECK (
    committed_microusd >= 0
  ),
  CONSTRAINT provider_budget_reserved_nonnegative CHECK (
    reserved_microusd >= 0
  ),
  CONSTRAINT provider_budget_limit_nonnegative CHECK (limit_microusd >= 0)
);

CREATE TABLE provider_budget_request (
  account_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  request_id text NOT NULL,
  provider text NOT NULL,
  request_hash text NOT NULL,
  period_start date NOT NULL,
  state text NOT NULL,
  reserved_microusd bigint NOT NULL,
  actual_microusd bigint,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, request_id, provider),
  CONSTRAINT provider_budget_request_provider_valid CHECK (
    provider IN ('openalex', 'embedding')
  ),
  CONSTRAINT provider_budget_request_state_valid CHECK (
    state IN ('reserved', 'settled', 'released', 'uncertain')
  ),
  CONSTRAINT provider_budget_request_reserved_positive CHECK (
    reserved_microusd > 0
  ),
  CONSTRAINT provider_budget_request_actual_nonnegative CHECK (
    actual_microusd IS NULL OR actual_microusd >= 0
  )
);

CREATE TABLE shared_budget (
  name text PRIMARY KEY,
  committed_microusd bigint NOT NULL DEFAULT 0,
  reserved_microusd bigint NOT NULL DEFAULT 0,
  limit_microusd bigint NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT shared_budget_name_valid CHECK (name IN ('embedding-eval')),
  CONSTRAINT shared_budget_committed_nonnegative CHECK (
    committed_microusd >= 0
  ),
  CONSTRAINT shared_budget_reserved_nonnegative CHECK (reserved_microusd >= 0),
  CONSTRAINT shared_budget_limit_nonnegative CHECK (limit_microusd >= 0)
);

INSERT INTO shared_budget (
  name,
  committed_microusd,
  reserved_microusd,
  limit_microusd,
  updated_at
) VALUES (
  'embedding-eval',
  4,
  0,
  250000,
  TIMESTAMPTZ '2026-09-09T08:43:00Z'
);

CREATE TABLE shared_budget_request (
  name text NOT NULL REFERENCES shared_budget (name) ON DELETE CASCADE,
  request_id text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL,
  reserved_microusd bigint NOT NULL,
  actual_microusd bigint,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (name, request_id),
  CONSTRAINT shared_budget_request_state_valid CHECK (
    state IN ('reserved', 'settled', 'released', 'uncertain')
  ),
  CONSTRAINT shared_budget_request_reserved_positive CHECK (
    reserved_microusd > 0
  ),
  CONSTRAINT shared_budget_request_actual_nonnegative CHECK (
    actual_microusd IS NULL OR actual_microusd >= 0
  )
);

INSERT INTO shared_budget_request (
  name,
  request_id,
  request_hash,
  state,
  reserved_microusd,
  actual_microusd,
  created_at,
  updated_at
) VALUES (
  'embedding-eval',
  'fba2defc-8bdf-4482-a779-15b7e8359449',
  'ar48-initial-embedding-evaluation-2026-09-09:probe-1',
  'settled',
  2,
  2,
  TIMESTAMPTZ '2026-09-09T08:43:00Z',
  TIMESTAMPTZ '2026-09-09T08:43:00Z'
), (
  'embedding-eval',
  'e4dec66c-5cdc-47c4-84c8-bede89b7db18',
  'ar48-initial-embedding-evaluation-2026-09-09:probe-2',
  'settled',
  2,
  2,
  TIMESTAMPTZ '2026-09-09T08:43:00Z',
  TIMESTAMPTZ '2026-09-09T08:43:00Z'
);
