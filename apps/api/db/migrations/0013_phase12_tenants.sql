-- Phase 12 tenant productization draft.

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_integration_config (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  bms_base_url TEXT,
  bms_webhook_secret_ref TEXT,
  datto_rmm_base_url TEXT,
  datto_rmm_api_key_ref TEXT,
  datto_rmm_api_secret_ref TEXT,
  datto_rmm_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_execution_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  global_automation_disabled BOOLEAN NOT NULL DEFAULT TRUE,
  dry_run_only BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_accounts TEXT NOT NULL DEFAULT '[]',
  blocked_accounts TEXT NOT NULL DEFAULT '[]',
  max_runs_per_device_per_day INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (max_runs_per_device_per_day >= 0)
);

CREATE TABLE IF NOT EXISTS tenant_user_roles (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('read_only', 'operator', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, user_id)
);

ALTER TABLE component_registry
  ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_component_registry_tenant_id
  ON component_registry (tenant_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_id
  ON audit_events (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tickets_tenant_id
  ON tickets (tenant_id);

CREATE INDEX IF NOT EXISTS idx_devices_tenant_id
  ON devices (tenant_id);
