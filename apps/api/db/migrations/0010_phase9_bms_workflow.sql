-- Phase 9 BMS ticket workflow configuration and idempotency draft.

CREATE TABLE IF NOT EXISTS bms_workflow_config (
  id TEXT PRIMARY KEY DEFAULT 'global',
  writes_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  queue_automation_review TEXT NOT NULL DEFAULT 'Automation Review',
  queue_level_1 TEXT NOT NULL DEFAULT 'Level 1',
  queue_level_2 TEXT NOT NULL DEFAULT 'Level 2',
  queue_security TEXT NOT NULL DEFAULT 'Security',
  queue_human_review TEXT NOT NULL DEFAULT 'Human Review',
  status_auto_triage TEXT NOT NULL DEFAULT 'Auto-Triage',
  status_awaiting_client_confirmation TEXT NOT NULL DEFAULT 'Awaiting Client Confirmation',
  status_automation_running TEXT NOT NULL DEFAULT 'Automation Running',
  status_needs_qa TEXT NOT NULL DEFAULT 'Needs QA',
  status_escalated TEXT NOT NULL DEFAULT 'Escalated',
  status_completed TEXT NOT NULL DEFAULT 'Completed',
  queue_auto_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  deny_automation_route_to_human BOOLEAN NOT NULL DEFAULT TRUE,
  success_public_note_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  close_tickets_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  priority_updates_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (id = 'global')
);

CREATE TABLE IF NOT EXISTS bms_idempotency_keys (
  key TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bms_idempotency_ticket_id
  ON bms_idempotency_keys (ticket_id);
