# Security Model

Dispatch Sentinel must fail closed.

## Phase 7 Safety

- Dry-run quick jobs never call external APIs.
- Real quick jobs require `DATTO_RMM_EXECUTION_ENABLED=true`.
- Real quick jobs are limited to Restart Print Spooler, Run GPUpdate, and Collect Workstation Diagnostics.
- A run is blocked unless the decision is `AUTO_ELIGIBLE_CONFIRM_CLIENT`.
- A run is blocked unless the approval request is `approved`.
- A run is blocked if the component is missing or disabled.
- A run is blocked if the component is not low risk.
- A run is blocked if the device is not a workstation.
- A run is blocked if the approved device does not match the decision.
- A run is blocked when the daily per-device component limit is reached.
- An audit event is written before the Datto adapter is called.
- Component result callbacks require `AUTOMATION_CALLBACK_SECRET`.
- Missing callbacks or unknown jobs after timeout escalate to human review.
- Callback device mismatches create security audit warnings.
- Freeform replies are not approvals.
- Expired and reused approval tokens fail closed.

## Secrets

Secrets must come only from environment variables or a secret provider. Logs must never include Datto API secrets.

## Phase 8 Admin Safety

- The dashboard can only change registered component metadata exposed by the admin API.
- Safety settings cannot enable server automation; the server automation indicator is always disabled.
- Global execution disabled settings are enforced by the automation runner guard.
- Audit filters are read-only and export only recorded audit events.
- Approval resend is logged as a request only; it does not send email or treat freeform replies as approval.

## Phase 9 BMS Workflow Safety

- BMS writes are disabled unless `BMS_WRITES_ENABLED=true`.
- Decision and run updates use idempotency keys so repeated processing does not duplicate notes.
- Dispatch Sentinel only appends internal/public notes through adapter methods; it does not overwrite technician notes.
- Successful automation moves tickets to Needs QA unless automatic closure is explicitly enabled.
- Priority changes are not implemented unless a future configured priority workflow is added.
- Duplicate BMS webhooks are skipped after the first completed intake job for the same ticket/event pair.

## Phase 10 Production Safety

- Admin APIs require a bearer session from `/api/admin/login`.
- Read-only admins can read but cannot mutate safety settings or registry metadata.
- Operator/admin roles can perform safe operational actions; admin role is required for configuration changes.
- Webhook, approval, and admin routes have independent per-client rate limits.
- Structured logs pass through recursive secret redaction before output.
- Health checks report API, database configuration, queue state, BMS adapter, and Datto RMM adapter status.
- Global automation, account blocking, component disabling, device eligibility, and dry-run-only switches all fail closed.

## Phase 11 Library Safety

- New automation categories are only eligible when a matching enabled component registry entry exists.
- New browser, VPN, Teams, and Office rules are limited to diagnostics, safe cache cleanup, or service restart categories.
- Account, credential, MFA, VPN policy, firewall, Office licensing, and saved-password variants escalate to human review.
- Expanded registry entries do not expand live Datto RMM execution; live execution remains separately allow-listed.

## Phase 12 Tenant Isolation

- BMS and Datto configuration is stored per tenant and references secrets rather than storing raw credentials.
- Component registry changes are scoped to one tenant.
- Audit log export is scoped to one tenant.
- Execution settings are scoped to one tenant.
- User roles are scoped to one tenant and cannot authorize access to another tenant.
- Disabled tenants cannot be used for ticket/device/component operations.
