-- Dispatch Sentinel Phase 5 client confirmation tokens.
-- Stores one-time approval request state. Only token hashes are persisted.

DROP TABLE IF EXISTS approval_requests;

CREATE TABLE approval_requests (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  device_uid TEXT NOT NULL,
  component_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'canceled')),
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  rejected_at TEXT,
  requester_email TEXT NOT NULL,
  approval_ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_requests_token_hash ON approval_requests(token_hash);
CREATE INDEX idx_approval_requests_ticket_id ON approval_requests(ticket_id);
CREATE INDEX idx_approval_requests_status ON approval_requests(status);
