-- Phase 11 approved automation library expansion.
-- Component UIDs remain placeholders until mapped to existing approved Datto RMM components.

INSERT INTO component_registry (
  id,
  name,
  slug,
  description,
  datto_component_uid,
  category,
  allowed_intents,
  allowed_asset_types,
  risk_level,
  requires_client_confirmation,
  requires_tech_approval,
  enabled,
  max_runs_per_device_per_day
) VALUES
  ('component-repair-mapped-drive', 'Repair Mapped Drive', 'repair-mapped-drive', 'Repair mapped drive connections on an approved workstation without changing permissions.', 'mock-datto-component-repair-mapped-drive', 'mapped_drive', '["repair_mapped_drive"]', '["workstation"]', 'low', TRUE, FALSE, TRUE, 2),
  ('component-restart-scanner-wia', 'Restart Scanner WIA Services', 'restart-scanner-wia', 'Restart scanner-related Windows Image Acquisition services on an approved workstation.', 'mock-datto-component-restart-scanner-wia', 'scanner', '["restart_scanner_wia"]', '["workstation"]', 'low', TRUE, FALSE, TRUE, 2),
  ('component-restart-vpn-client', 'Restart Known VPN Client Service', 'restart-vpn-client', 'Restart a known approved VPN client service on an approved workstation.', 'mock-datto-component-restart-vpn-client', 'vpn', '["restart_vpn_client"]', '["workstation"]', 'medium', TRUE, FALSE, TRUE, 1),
  ('component-collect-vpn-diagnostics', 'Collect VPN Diagnostics', 'collect-vpn-diagnostics', 'Collect VPN client diagnostics for technician review without changing VPN configuration.', 'mock-datto-component-collect-vpn-diagnostics', 'vpn', '["collect_vpn_diagnostics"]', '["workstation"]', 'low', FALSE, FALSE, TRUE, 3),
  ('component-browser-cache-cleanup', 'Browser Cache Cleanup', 'browser-cache-cleanup', 'Clear safe browser cache locations without touching saved passwords or credentials.', 'mock-datto-component-browser-cache-cleanup', 'browser', '["browser_cache_cleanup"]', '["workstation"]', 'medium', TRUE, FALSE, TRUE, 1),
  ('component-teams-office-diagnostics', 'Teams Office Basic Diagnostics', 'teams-office-diagnostics', 'Collect basic Teams and Office diagnostics without account or licensing changes.', 'mock-datto-component-teams-office-diagnostics', 'office', '["teams_office_diagnostics"]', '["workstation"]', 'low', FALSE, FALSE, TRUE, 3),
  ('component-clear-stuck-print-jobs', 'Clear Stuck Print Jobs', 'clear-stuck-print-jobs', 'Clear stuck local print jobs on an approved workstation after confirmation.', 'mock-datto-component-clear-stuck-print-jobs', 'print', '["clear_stuck_print_jobs"]', '["workstation"]', 'medium', TRUE, FALSE, TRUE, 1)
ON CONFLICT (id) DO NOTHING;
