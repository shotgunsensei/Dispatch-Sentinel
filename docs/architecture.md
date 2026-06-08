# Architecture

Dispatch Sentinel is the approval, classification, decision, and audit layer between Kaseya Datto BMS and Datto RMM.

## Phase 10 Scope

Phase 10 hardens Dispatch Sentinel for production use with admin authentication, role permissions, secret redaction, rate limiting, health checks, exports, and execution kill switches on top of the BMS workflow and guarded execution layer.

- `apps/api`: HTTP API, config loader, redacting logger, admin auth, rate limiter, BMS webhook intake, mock BMS adapter, BMS workflow service, mock Datto device adapter, Datto RMM adapter interface, dry-run adapter, guarded real adapter, automation runner, job poller, result callback handler, classifier, device matcher, policy engine, component registry, approval token service, admin dashboard API, exports, health checks, and audit sink.
- `apps/web`: static admin dashboard shell that reports Phase 10 status.
- `packages/shared`: shared TypeScript domain contracts.
- `docs`: architecture, security, registry, operations, and phase planning.

No Phase 10 module may add new automation categories, SaaS billing, unrelated integrations, unsafe execution bypasses, server execution, high-risk execution, arbitrary script upload, or Datto component creation.

## API Module Boundaries

- `bms`: BMS adapter interface, mock implementation, update workflow rules, and idempotency boundary.
- `datto-rmm`: Datto RMM adapter contract, dry-run implementation, and guarded real adapter.
- `tickets`: ticket normalization and intake job boundary.
- `classifier`: rule-based recommendation boundary. It cannot authorize execution.
- `assets`: mock device adapter and device matching boundary.
- `approvals`: signed one-time approval token creation, preview, approval, and rejection.
- `component-registry`: seeded approved component registry and validation rules.
- `automation`: execution guard, automation run tracking, job status polling, and component result callback handling.
- `audit`: in-memory audit event sink.
- `admin`: authentication, role permissions, rate limiting, dashboard overview, ticket evaluation review, component registry management, approval review, run review, queue monitoring, audit filtering/export, component/run exports, and safety settings.

## Database Draft

Migrations cover Phase 0 through Phase 10. Phase 10 drafts admin users, sessions, rate-limit events, and hardening flags in `apps/api/db/migrations/0011_phase10_production_hardening.sql`.
