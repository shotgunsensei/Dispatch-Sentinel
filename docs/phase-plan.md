# Phase Plan

## Phase 0: Foundation

Status: completed.

Deliverables:

- Monorepo structure.
- API and web skeletons.
- Shared domain types.
- Draft database schema.
- Documentation set.
- Health endpoint and verification tests.

Explicitly excluded:

- Real Kaseya BMS API calls.
- Real Datto RMM API calls.
- Automation execution.
- Ticket classification behavior.
- Approval delivery.

## Phase 1: Read-Only Integration

Status: implemented for mocked BMS intake only.

- Add BMS adapter interface.
- Add mock BMS ticket fixtures.
- Add shared-secret BMS webhook intake.
- Fetch and normalize mock BMS tickets.
- Add in-memory audit events for intake.

Explicitly excluded:

- Real Kaseya BMS API calls.
- Datto RMM reads or execution.
- Ticket automation decisions.
- Client confirmations.
- Ticket closure.

## Phase 2: Classifier and Policy Engine

Status: implemented.

- Add classifier recommendation logic.
- Add deterministic policy engine.
- Enforce the five required outcomes.
- Add comprehensive decision tests.

Explicitly excluded:

- Real Datto RMM execution.
- Confirmation email delivery.
- Live BMS ticket modification except optional internal notes through the mock adapter.
- AI-based autonomous execution.

## Phase 3: Confirmation and Approval Workflows

Status: partially re-scoped by prompt to component registry system.

Implemented:

- Database schema draft for component registry fields.
- Seeded MVP component registry.
- Admin API for listing, reading, enabling/disabling, and controlled metadata updates.
- Policy integration requiring enabled matching registry entries.
- Validation for risk level, server asset types, critical risk, and disabled components.

Still excluded:

- Add client device confirmation.
- Add technician approval.
- Add notification delivery stubs and then configured providers.
- Preserve fail-closed behavior.

## Phase 4: Controlled MVP Execution

Status: re-scoped by prompt to device matching system.

Implemented:

- Expanded device model.
- Device adapter interface.
- Mock Datto RMM device adapter and realistic fixtures.
- Device matching engine and confidence scoring.
- Policy integration for high-confidence, ambiguous, missing, and unsafe server matches.
- Tests for exact hostname, last-user contact correlation, ambiguity, no match, server, and offline behavior.

Still excluded:

- Enable only approved MVP component categories.
- Require registry entry, mapped device UID, approval/confirmation, and pre-execution audit event.
- Add run status tracking and safe failure handling.

## Phase 6: Dry-Run Quick Job Execution

Status: implemented.

Implemented:

- Datto RMM adapter interface.
- Dry-run Datto RMM quick job adapter.
- Real Datto RMM adapter scaffold with execution flag guard.
- Automation run model and migration draft.
- Execution guard for decision, approval, registry, device match, daily run limits, execution flag, and audit-before-run.

Still excluded:

- Live Datto RMM quick job execution by default.
- Email sending.
- Bypassing approval or component registry controls.

## Phase 7: Guarded Live Quick Job Execution

Status: implemented.

Implemented:

- Real Datto RMM `runQuickJob` call path guarded by environment configuration.
- Live execution allow-list for Restart Print Spooler, Run GPUpdate, and Collect Workstation Diagnostics only.
- Workstation-only and low-risk-only execution guard.
- Datto job UID storage on automation runs.
- Job status polling service and schedulable worker helper.
- Component callback endpoint with shared-secret validation.
- Callback result schema validation.
- BMS/internal notes for started, completed, failed, and unknown jobs.
- Human-review escalation for callback failures, missing callbacks, and unknown timed-out jobs.

Still excluded:

- Server execution.
- High-risk or critical component execution.
- Arbitrary script upload or Datto component creation.
- Running jobs without approval.

## Phase 8: Admin Dashboard

Status: implemented.

Implemented:

- Dashboard overview for evaluated tickets, auto-eligible decisions, pending approvals, automation runs, successes, failures, and human escalations.
- Ticket evaluation review with outcome, confidence, reason, intent, component, device, and audit trail link.
- Component registry admin view and controlled update API.
- Approval request review with safe resend-request logging and pending-request cancellation.
- Automation run review.
- Searchable/filterable audit log with JSON and CSV export.
- Safety settings for global execution, dry-run mode, max runs per device/day, allowed accounts, blocked accounts, and server automation disabled indicator.

Still excluded:

- Billing.
- Public client portal beyond approval pages.
- Unrelated analytics.
- Unsafe execution bypasses.

## Phase 9: BMS Ticket Workflow Integration

Status: implemented.

Implemented:

- BMS workflow configuration for queue and status names.
- Decision-based BMS internal notes, status updates, and queue routing.
- Automation result-based BMS updates for started, success, failure, and unknown outcomes.
- Idempotency for repeated decision/run updates.
- Duplicate BMS webhook skip behavior.
- Duplicate pending approval request prevention.
- Disabled BMS writes fail safely without breaking evaluation.

Still excluded:

- Automatic ticket closure unless explicitly enabled.
- Technician note overwrite.
- Ticket priority changes unless a future configured priority workflow is added.

## Phase 10: Production Hardening

Status: implemented.

Implemented:

- Admin login with read-only, operator, and admin permission enforcement.
- Secret redaction utility for structured logs.
- Environment validation for admin credentials and rate limits.
- Rate limits for webhook, approval, and admin API routes.
- Idempotency protections carried forward for webhooks, approvals, and execution.
- Health checks for API, database configuration, queue state, BMS adapter, and Datto RMM adapter.
- Job queue monitoring endpoint.
- Export endpoints for audit logs, component registry, and automation run history.
- Kill switches for global automation, client/account blocking, component disabling, device eligibility, and dry-run-only execution.

Still excluded:

- New automation categories.
- SaaS billing.
- Unrelated integrations.
