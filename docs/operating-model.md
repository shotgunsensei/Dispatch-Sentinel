# Operating Model

Dispatch Sentinel operates as a safety layer, not as an autonomous remediation bot.

## Phase 10 Operation

Runnable behavior:

- Start the API process and return `ok` from `/healthz`.
- Accept mocked BMS webhooks with the shared secret.
- Normalize mock BMS tickets.
- Classify tickets and evaluate policy decisions.
- Match tickets to known mock devices.
- Manage the approved component registry.
- Create and consume one-time approval tokens.
- Create dry-run automation run records after all guards pass.
- Call only the dry-run Datto RMM adapter by default.
- Block real adapter quick jobs unless `DATTO_RMM_EXECUTION_ENABLED=true`.
- Allow live jobs only for approved low-risk workstation components in the Phase 7 allow-list.
- Poll active Datto jobs and consume signed component result callbacks.
- Escalate callback failures, missing callbacks, unknown timed-out jobs, and callback device mismatches.
- Present admin dashboard views for overview, ticket evaluations, component registry, approvals, automation runs, audit log, and safety settings.
- Allow administrators to disable global execution, keep dry-run mode visible, and manage account allow/block lists.
- Document decisions in BMS with internal notes, status updates, and queue routing when BMS writes are enabled.
- Move started automation to Automation Running, successful automation to Needs QA, and failed/unknown automation to Escalated plus human review routing.
- Skip duplicate webhook, decision, and run updates using idempotency keys.
- Require admin login before using admin API endpoints.
- Rate-limit webhook, approval, and admin traffic independently.
- Monitor queue state from the admin job queue endpoint and `/healthz` checks.
- Export audit logs, component registry, and automation run history for backup/review.
- Use global, account, component, device, and dry-run-only kill switches to stop execution paths quickly.

Execution remains fail-closed. If confidence, approval, component, risk, workstation device match, daily limit, environment flag, or audit requirements are not satisfied, the runner creates a blocked run instead of calling the adapter.
