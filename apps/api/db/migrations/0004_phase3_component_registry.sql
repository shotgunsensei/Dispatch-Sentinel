-- Dispatch Sentinel Phase 3 approved component registry.
-- This registry is the only source of truth for components Dispatch Sentinel may consider.

DROP TABLE IF EXISTS component_registry;

CREATE TABLE component_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  datto_component_uid TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  allowed_intents TEXT NOT NULL,
  allowed_asset_types TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  requires_client_confirmation INTEGER NOT NULL DEFAULT 1,
  requires_tech_approval INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  max_runs_per_device_per_day INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (max_runs_per_device_per_day >= 0),
  CHECK (risk_level != 'critical' OR requires_tech_approval = 1)
);

CREATE INDEX idx_component_registry_enabled ON component_registry(enabled);
CREATE INDEX idx_component_registry_slug ON component_registry(slug);
