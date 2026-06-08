-- Dispatch Sentinel Phase 1 BMS intake fields.
-- Keeps ticket source and queue from BMS normalization without enabling automation.

ALTER TABLE tickets ADD COLUMN queue TEXT;
ALTER TABLE tickets ADD COLUMN source TEXT NOT NULL DEFAULT 'bms';
