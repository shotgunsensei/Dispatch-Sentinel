-- Dispatch Sentinel Phase 0 schema draft.
-- This migration is a contract draft only until a production database adapter is selected.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  bms_account_id TEXT UNIQUE,
  datto_site_uid TEXT UNIQUE,
  name TEXT NOT NULL,
  automation_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  bms_contact_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  can_confirm_automation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  contact_id TEXT REFERENCES contacts(id),
  bms_ticket_id TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  datto_site_uid TEXT,
  datto_device_uid TEXT UNIQUE,
  hostname TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'unknown',
  is_automation_eligible INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE component_registry (
  id TEXT PRIMARY KEY,
  datto_component_uid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  is_approved_for_mvp INTEGER NOT NULL DEFAULT 0,
  allowed_device_kinds TEXT NOT NULL,
  requires_client_confirmation INTEGER NOT NULL DEFAULT 1,
  requires_tech_approval INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE automation_decisions (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  device_id TEXT REFERENCES devices(id),
  component_registry_entry_id TEXT REFERENCES component_registry(id),
  outcome TEXT NOT NULL CHECK (
    outcome IN (
      'AUTO_ELIGIBLE_CONFIRM_CLIENT',
      'ASK_CLIENT_TO_SELECT_DEVICE',
      'REQUIRE_TECH_APPROVAL',
      'ESCALATE_TO_HUMAN',
      'DENY_AUTOMATION'
    )
  ),
  confidence REAL NOT NULL DEFAULT 0,
  reasons TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approval_requests (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  automation_decision_id TEXT NOT NULL REFERENCES automation_decisions(id),
  requested_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  reason TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE automation_runs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  component_registry_entry_id TEXT NOT NULL REFERENCES component_registry(id),
  approval_request_id TEXT REFERENCES approval_requests(id),
  status TEXT NOT NULL DEFAULT 'queued',
  requested_by_user_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contacts_account_id ON contacts(account_id);
CREATE INDEX idx_tickets_account_id ON tickets(account_id);
CREATE INDEX idx_devices_account_id ON devices(account_id);
CREATE INDEX idx_automation_decisions_ticket_id ON automation_decisions(ticket_id);
CREATE INDEX idx_approval_requests_ticket_id ON approval_requests(ticket_id);
CREATE INDEX idx_automation_runs_ticket_id ON automation_runs(ticket_id);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
