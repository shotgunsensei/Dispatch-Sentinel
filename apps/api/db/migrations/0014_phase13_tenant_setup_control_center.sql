-- Phase 13 tenant setup and integration control center draft.

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
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  secret_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version TEXT NOT NULL,
  last_four TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, secret_name),
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

CREATE TABLE IF NOT EXISTS integration_test_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  test_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'dry_run')),
  message TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (duration_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_tenant_secrets_tenant_id
  ON tenant_secrets (tenant_id);

CREATE INDEX IF NOT EXISTS idx_integration_test_runs_tenant_id_created_at
  ON integration_test_runs (tenant_id, created_at);
