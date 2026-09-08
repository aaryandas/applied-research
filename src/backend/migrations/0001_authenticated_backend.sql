CREATE TABLE "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX user_email_unique ON "user" (email);

CREATE TABLE session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL,
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX session_token_unique ON session (token);
CREATE INDEX session_user_id_index ON session (user_id);

CREATE TABLE account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX account_provider_account_unique
  ON account (provider_id, account_id);
CREATE INDEX account_user_id_index ON account (user_id);

CREATE TABLE verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX verification_identifier_index ON verification (identifier);

CREATE TABLE usage_month (
  account_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  month_start date NOT NULL,
  committed_microusd bigint NOT NULL DEFAULT 0,
  reserved_microusd bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, month_start),
  CONSTRAINT usage_month_committed_nonnegative CHECK (committed_microusd >= 0),
  CONSTRAINT usage_month_reserved_nonnegative CHECK (reserved_microusd >= 0)
);

CREATE TABLE learning_request (
  account_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  request_id text NOT NULL,
  request_hash text NOT NULL,
  month_start date NOT NULL,
  operation text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  state text NOT NULL,
  reserved_microusd bigint NOT NULL,
  actual_microusd bigint,
  provider_request_id text,
  public_response jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, request_id),
  CONSTRAINT learning_request_state_valid CHECK (
    state IN ('reserved', 'settled', 'released', 'uncertain')
  ),
  CONSTRAINT learning_request_reserved_positive CHECK (reserved_microusd > 0),
  CONSTRAINT learning_request_actual_nonnegative CHECK (
    actual_microusd IS NULL OR actual_microusd >= 0
  )
);
CREATE INDEX learning_request_month_index
  ON learning_request (account_id, month_start);
