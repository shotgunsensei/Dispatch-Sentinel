# Component Registry

The component registry is the only source of Datto RMM components that Dispatch Sentinel may consider for automation.

## Phase 3 Status

Phase 3 seeds the MVP approved component registry and exposes controlled admin update APIs. Registry entries are not executed, fetched from Datto RMM, or generated from ticket content.

## Registry Entry Fields

- `datto_component_uid`: Datto RMM component identifier.
- `name`: technician-readable component name.
- `category`: operational category such as print, diagnostics, policy refresh, cleanup, app process, or reboot.
- `risk_level`: `low`, `medium`, `high`, or `critical`.
- `enabled`: explicit allow-list flag.
- `allowed_intents`: allowed classifier intents, stored as structured JSON text in the draft migration.
- `allowed_asset_types`: allowed target asset types, stored as structured JSON text in the draft migration.
- `requires_client_confirmation`: whether the client must confirm before action.
- `requires_tech_approval`: whether a technician must approve before action.
- `max_runs_per_device_per_day`: future execution guardrail.

## Seeded MVP Components

- Restart Print Spooler
- Run GPUpdate
- Collect Workstation Diagnostics
- Clear Safe Temp Files
- Restart User App Process
- Reboot Workstation

## MVP Candidate Categories

Only these categories may be considered in MVP implementation phases:

- Restart print spooler.
- Run GPUpdate.
- Collect workstation diagnostics.
- Clear safe temp files.
- Restart a known user-level app process.
- Reboot workstation only if explicitly confirmed and enabled.

All other component matches must route to human review or denial.
