-- Dispatch Sentinel Phase 2 decision fields.
-- Stores rule-based classifier output and next action without enabling execution.

ALTER TABLE automation_decisions ADD COLUMN detected_intent TEXT;
ALTER TABLE automation_decisions ADD COLUMN next_action TEXT;
