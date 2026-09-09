ALTER TABLE shared_budget DROP CONSTRAINT shared_budget_name_valid;
ALTER TABLE shared_budget ADD CONSTRAINT shared_budget_name_valid
  CHECK (name IN ('embedding-eval', 'generation-eval'));

ALTER TABLE shared_budget
  ADD COLUMN dispatch_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN dispatch_reserved integer NOT NULL DEFAULT 0,
  ADD COLUMN dispatch_committed integer NOT NULL DEFAULT 0;

ALTER TABLE shared_budget
  ADD CONSTRAINT shared_budget_dispatch_limit_nonnegative
    CHECK (dispatch_limit >= 0),
  ADD CONSTRAINT shared_budget_dispatch_reserved_nonnegative
    CHECK (dispatch_reserved >= 0),
  ADD CONSTRAINT shared_budget_dispatch_committed_nonnegative
    CHECK (dispatch_committed >= 0);

INSERT INTO shared_budget (
  name,
  committed_microusd,
  reserved_microusd,
  limit_microusd,
  dispatch_limit,
  dispatch_reserved,
  dispatch_committed,
  updated_at
) VALUES (
  'generation-eval',
  0,
  0,
  2000000,
  10,
  0,
  0,
  TIMESTAMPTZ '2026-09-09T10:44:00Z'
);

ALTER TABLE source_operation DROP CONSTRAINT source_operation_kind_valid;
ALTER TABLE source_operation ADD CONSTRAINT source_operation_kind_valid
  CHECK (kind IN ('discover', 'acquire', 'sourced', 'onboarding'));

CREATE TABLE onboarding_proposal (
  account_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  proposal_id text NOT NULL,
  revision integer NOT NULL,
  syllabus jsonb NOT NULL,
  diagnostic jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, proposal_id),
  CONSTRAINT onboarding_proposal_revision_positive CHECK (revision >= 1)
);
