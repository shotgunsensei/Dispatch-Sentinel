# Dispatch Sentinel

Dispatch Sentinel is an MSP automation approval and execution layer for Kaseya Datto BMS and Datto RMM.

## Current Phase Status

This repository is in **Phase 10 only**. It includes mocked BMS intake, rule-based decisions, approved component registry, device matching, one-time approval tokens, dry-run Datto RMM quick job execution, guarded live Datto RMM quick job execution for allowed low-risk workstation components, an admin dashboard/control API, BMS ticket note/status/queue workflow integration, and production safety hardening.

Phase 10 includes:

- BMS adapter interface, mock fixtures, and webhook intake.
- Ticket normalization, classifier, policy engine, and internal notes.
- Approved component registry and admin registry API.
- Mock Datto RMM device adapter and device matching.
- Signed one-time approval tokens and approve/reject endpoints.
- Datto RMM adapter interface.
- Dry-run Datto RMM adapter that never calls external APIs.
- Real Datto RMM adapter scaffold guarded by `DATTO_RMM_EXECUTION_ENABLED`.
- Automation run model and execution guard.
- Live `runQuickJob` support for only Restart Print Spooler, Run GPUpdate, and Collect Workstation Diagnostics.
- Job status polling service for active queued/running jobs.
- Component callback endpoint at `POST /api/automation/result`.
- Admin overview for evaluated tickets, auto-eligible count, pending approvals, run status, failures, and human escalations.
- Admin lists for ticket evaluations, approvals, automation runs, and audit events.
- Admin safety settings for global execution, dry-run mode, per-device run limits, allowed accounts, and blocked accounts.
- Audit filtering and JSON/CSV export.
- Configurable BMS queue/status names for automation review, Level 1, Level 2, Security, Human Review, Auto-Triage, Awaiting Client Confirmation, Automation Running, Needs QA, Escalated, and Completed.
- Decision-based BMS internal notes, status updates, and queue routing.
- Result-based BMS updates for started, success, failure, and unknown callback states.
- Idempotency protection for repeated decision/run notes and duplicate webhooks.
- Admin login with read-only, operator, and admin role enforcement.
- Secret redaction for structured logs and environment validation.
- Rate limits for webhooks, approval routes, and admin APIs.
- Health checks for API, database configuration, queue state, BMS adapter, and Datto RMM adapter.
- Export endpoints for audit logs, component registry, and automation run history.
- Kill switches for global automation, accounts, components, devices, and dry-run-only operation.

Phase 10 intentionally does **not** include:

- Real Kaseya BMS API calls.
- Live Datto RMM execution by default when `DATTO_RMM_EXECUTION_ENABLED` is unset or false.
- Server execution.
- High-risk or critical component execution.
- Sending confirmation emails.
- Ticket closure.
- Automatic ticket closure unless `BMS_CLOSE_TICKETS_ENABLED=true`.
- Technician note overwrite.
- Ticket priority changes unless `BMS_PRIORITY_UPDATES_ENABLED=true`.
- Arbitrary script generation.
- Dynamic component creation from tickets.
- Bypassing approval or registry controls.

## Local Setup

```powershell
npm install
npm run dev
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:4310/healthz
```

Expected response:

```json
{
  "status": "ok",
  "service": "dispatch-sentinel-api",
  "phase": "10",
  "checks": {
    "api": "ok",
    "database": "ok",
    "queue": "ok",
    "bmsAdapter": "ok",
    "dattoRmmAdapter": "dry_run"
  }
}
```

## Environment Variables

- `NODE_ENV`: runtime environment.
- `API_HOST`: API bind host. Defaults to `127.0.0.1`.
- `API_PORT`: API port. Defaults to `4310`.
- `LOG_LEVEL`: structured logger threshold. Defaults to `info`.
- `DATABASE_URL`: draft database connection string.
- `BMS_WEBHOOK_SECRET`: shared secret for `POST /api/webhooks/bms`.
- `DATTO_RMM_EXECUTION_ENABLED`: must be `true` before live Datto RMM quick jobs are allowed. Defaults to `false`.
- `DATTO_RMM_TIMEOUT_MS`: real adapter scaffold timeout. Defaults to `10000`.
- `AUTOMATION_CALLBACK_BASE_URL`: public callback base URL passed to Datto RMM components.
- `AUTOMATION_CALLBACK_SECRET`: shared secret required by `POST /api/automation/result`.
- `AUTOMATION_JOB_TIMEOUT_MINUTES`: timeout before missing callbacks are escalated. Defaults to `30`.
- `BMS_WRITES_ENABLED`: enables BMS notes/status/queue writes. Defaults to `false`.
- `BMS_QUEUE_AUTOMATION_REVIEW`, `BMS_QUEUE_LEVEL1`, `BMS_QUEUE_LEVEL2`, `BMS_QUEUE_SECURITY`, `BMS_QUEUE_HUMAN_REVIEW`: queue mapping.
- `BMS_STATUS_AUTO_TRIAGE`, `BMS_STATUS_AWAITING_CLIENT_CONFIRMATION`, `BMS_STATUS_AUTOMATION_RUNNING`, `BMS_STATUS_NEEDS_QA`, `BMS_STATUS_ESCALATED`, `BMS_STATUS_COMPLETED`: status mapping.
- `BMS_QUEUE_AUTO_ELIGIBLE`: optionally routes auto-eligible tickets to Automation Review.
- `BMS_DENY_AUTOMATION_ROUTE_TO_HUMAN`: routes denied automation to human review when true.
- `BMS_SUCCESS_PUBLIC_NOTE_ENABLED`: optionally writes a public success note.
- `BMS_CLOSE_TICKETS_ENABLED`: must be true before success can use Completed instead of Needs QA.
- `BMS_PRIORITY_UPDATES_ENABLED`: reserved safety flag; priority updates are not implemented in Phase 9.
- `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`: initial admin login credentials.
- `ADMIN_SESSION_TTL_MINUTES`: admin session duration.
- `WEBHOOK_RATE_LIMIT_PER_MINUTE`, `APPROVAL_RATE_LIMIT_PER_MINUTE`, `ADMIN_RATE_LIMIT_PER_MINUTE`: per-client rate limits.
- `GLOBAL_AUTOMATION_DISABLED`: global automation kill switch.
- `DRY_RUN_ONLY`: prevents live execution even when execution is otherwise enabled.

Datto credentials are listed in `.env.example` as placeholders only. Do not set live credentials unless explicitly testing live execution with `DATTO_RMM_EXECUTION_ENABLED=true`.

## Phase 7 Execution Safety

Dry-run quick jobs create automation run records and fake Datto job UIDs without external API calls. Live Datto RMM quick jobs are limited to these enabled, registry-backed, low-risk workstation components:

- Restart Print Spooler.
- Run GPUpdate.
- Collect Workstation Diagnostics.

Execution guard requirements:

- Decision is `AUTO_ELIGIBLE_CONFIRM_CLIENT`.
- Approval status is `approved`.
- Component is enabled and registered.
- Component slug is one of the Phase 7 allowed live components.
- Component risk is `low`.
- Device is a workstation, not a server.
- Approved device UID matches the decision.
- Daily per-device component limit is not exceeded.
- Real adapter is blocked unless `DATTO_RMM_EXECUTION_ENABLED=true`.
- Audit event is written before the adapter is called.

Callback guard requirements:

- Component callback secret must match.
- Callback payload must include automation run ID, ticket ID, hostname, success flag, message, details, and timestamp.
- Failure callbacks escalate to human review.
- Device mismatches are logged as security audit warnings.
- Missing callbacks or unknown job status after timeout escalate to human review.

## Admin Dashboard

Admin API endpoints:

- `GET /api/admin/overview`
- `GET /api/admin/ticket-evaluations`
- `GET /api/admin/components`
- `PATCH /api/admin/components/:idOrSlug`
- `GET /api/admin/approvals`
- `POST /api/admin/approvals/:id/resend`
- `POST /api/admin/approvals/:id/cancel`
- `GET /api/admin/automation-runs`
- `GET /api/admin/audit-events`
- `GET /api/admin/audit-events?format=csv`
- `GET /api/admin/safety-settings`
- `PATCH /api/admin/safety-settings`

The web app renders admin routes for overview, ticket evaluations, component registry, approval requests, automation runs, audit log, and safety settings.

## Phase 9 BMS Workflow

BMS writes are disabled by default. When enabled, Dispatch Sentinel writes internal notes that explain each decision, updates human-visible statuses, and routes tickets to configured queues without closing tickets or changing priority by default.

Repeated webhooks and repeated decision/run updates are idempotent and are logged as skipped audit events instead of duplicating notes.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm audit
```
