-- Phase 14 production MVP vertical slice schema draft.
-- In-memory repositories remain local-development fallback only when DATABASE_URL is missing.

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  execution_mode TEXT NOT NULL DEFAULT 'dry_run' CHECK (execution_mode IN ('dry_run', 'live')),
  datto_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  server_automation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  max_runs_per_device_per_day INTEGER NOT NULL DEFAULT 2,
  bms_default_queue TEXT,
  bms_automation_review_queue TEXT,
  bms_human_review_queue TEXT,
  bms_security_queue TEXT,
  bms_status_awaiting_confirmation TEXT,
  bms_status_automation_running TEXT,
  bms_status_needs_qa TEXT,
  bms_status_escalated TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (max_runs_per_device_per_day >= 0),
  CHECK (server_automation_enabled = FALSE)
);

CREATE TABLE IF NOT EXISTS tenant_secrets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  secret_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version TEXT NOT NULL,
  last_four TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, secret_name),
  CHECK (secret_name IN (
    'bms_api_base_url',
    'bms_api_username',
    'bms_api_secret',
    'bms_webhook_secret',
    'datto_rmm_api_url',
    'datto_rmm_api_key',
    'datto_rmm_api_secret',
    'approval_token_secret',
    'component_callback_secret'
  ))
);

ALTER TABLE tenant_secrets
  ADD COLUMN IF NOT EXISTS id TEXT;

CREATE TABLE IF NOT EXISTS component_registry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL,
  datto_component_uid TEXT,
  category TEXT NOT NULL DEFAULT 'automation',
  allowed_intents JSONB NOT NULL,
  allowed_asset_types JSONB NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  requires_client_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  requires_tech_approval BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  max_runs_per_device_per_day INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, slug),
  CHECK (max_runs_per_device_per_day >= 0)
);

ALTER TABLE component_registry
  ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);

ALTER TABLE component_registry
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'automation';

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  event_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'bms',
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'failed')),
  reason TEXT,
  payload_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_evaluations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  external_ticket_id TEXT,
  title TEXT NOT NULL,
  detected_intent TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  matched_component_id TEXT REFERENCES component_registry(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (confidence >= 0 AND confidence <= 100)
);

CREATE TABLE IF NOT EXISTS integration_test_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  test_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped', 'dry_run')),
  message TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (duration_ms >= 0)
);

ALTER TABLE integration_test_runs
  DROP CONSTRAINT IF EXISTS integration_test_runs_status_check;

ALTER TABLE integration_test_runs
  ADD CONSTRAINT integration_test_runs_status_check
  CHECK (status IN ('passed', 'failed', 'skipped', 'dry_run'));

CREATE TABLE IF NOT EXISTS dry_run_automation_candidates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  ticket_evaluation_id TEXT NOT NULL REFERENCES ticket_evaluations(id),
  ticket_id TEXT NOT NULL,
  component_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  actor TEXT NOT NULL CHECK (actor IN ('admin', 'system', 'webhook')),
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug);
CREATE INDEX IF NOT EXISTS idx_tenant_secrets_tenant_id ON tenant_secrets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_component_registry_tenant_slug ON component_registry (tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant_created_at ON webhook_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_evaluations_tenant_created_at ON ticket_evaluations (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_test_runs_tenant_created_at ON integration_test_runs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dry_run_candidates_tenant_created_at ON dry_run_automation_candidates (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_created_at ON audit_events (tenant_id, created_at DESC);
