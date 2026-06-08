-- Phase 8 admin dashboard and safety settings draft.

CREATE TABLE IF NOT EXISTS admin_safety_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  global_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  dry_run_mode BOOLEAN NOT NULL DEFAULT TRUE,
  max_runs_per_device_per_day INTEGER NOT NULL DEFAULT 2,
  server_automation_disabled BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_accounts TEXT NOT NULL DEFAULT '[]',
  blocked_accounts TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (id = 'global'),
  CHECK (max_runs_per_device_per_day >= 0),
  CHECK (server_automation_disabled = TRUE)
);

CREATE INDEX IF NOT EXISTS idx_audit_events_ticket_id
  ON audit_events (ticket_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_type
  ON audit_events (event_type);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status
  ON approval_requests (status);

CREATE INDEX IF NOT EXISTS idx_automation_runs_status
  ON automation_runs (status);
