-- Dispatch Sentinel Phase 6 automation run tracking.
-- Dry-run execution records runs; live Datto RMM quick jobs remain disabled by default.

DROP TABLE IF EXISTS automation_runs;

CREATE TABLE automation_runs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  device_uid TEXT NOT NULL,
  component_id TEXT NOT NULL,
  approval_request_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'blocked', 'running', 'succeeded', 'failed', 'cancelled')),
  datto_job_uid TEXT,
  started_at TEXT,
  completed_at TEXT,
  result_summary TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_automation_runs_device_component ON automation_runs(device_uid, component_id);
CREATE INDEX idx_automation_runs_ticket_id ON automation_runs(ticket_id);
CREATE INDEX idx_automation_runs_approval_request_id ON automation_runs(approval_request_id);
