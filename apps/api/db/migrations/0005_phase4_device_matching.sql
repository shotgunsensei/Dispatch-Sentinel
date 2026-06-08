-- Dispatch Sentinel Phase 4 device matching fields.
-- Expands known device metadata used by safe matching decisions.

ALTER TABLE devices ADD COLUMN site_location_id TEXT;
ALTER TABLE devices ADD COLUMN asset_type TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE devices ADD COLUMN last_logged_in_user TEXT;
ALTER TABLE devices ADD COLUMN online_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE devices ADD COLUMN serial_number TEXT;
ALTER TABLE devices ADD COLUMN operating_system TEXT;

CREATE INDEX idx_devices_account_hostname ON devices(account_id, hostname);
CREATE INDEX idx_devices_datto_uid ON devices(datto_device_uid);
CREATE INDEX idx_devices_last_logged_in_user ON devices(last_logged_in_user);
