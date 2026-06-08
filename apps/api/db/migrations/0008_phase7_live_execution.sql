-- Phase 7 live execution tracking draft.
-- Keeps automation run status vocabulary aligned with Datto RMM polling and component callbacks.

ALTER TABLE automation_runs
  DROP CONSTRAINT IF EXISTS automation_runs_status_check;

ALTER TABLE automation_runs
  ADD CONSTRAINT automation_runs_status_check
  CHECK (status IN ('queued', 'blocked', 'running', 'succeeded', 'completed', 'failed', 'cancelled', 'unknown'));

ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS callback_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_automation_runs_active_jobs
  ON automation_runs (status, datto_job_uid, started_at)
  WHERE status IN ('queued', 'running');
