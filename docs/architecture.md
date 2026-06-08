# Architecture

Dispatch Sentinel is the approval, classification, decision, and audit layer between Kaseya Datto BMS and Datto RMM.

## Phase 12 Scope

Phase 12 prepares Dispatch Sentinel for productization by adding tenant boundaries around configuration, component registry, audit logs, execution settings, and user roles while preserving core automation safety logic.

- `apps/api`: HTTP API, config loader, redacting logger, admin auth, tenant stores, rate limiter, BMS webhook intake, mock BMS adapter, BMS workflow service, mock Datto device adapter, Datto RMM adapter interface, dry-run adapter, guarded real adapter, automation runner, job poller, result callback handler, classifier, device matcher, policy engine, component registry, approval token service, admin dashboard API, exports, health checks, and audit sink.
- `apps/web`: static admin dashboard shell that reports Phase 12 status.
- `packages/shared`: shared TypeScript domain contracts.
- `docs`: architecture, security, registry, operations, and phase planning.

No Phase 12 module may add billing, modify core automation safety logic, bypass the component registry, or permit cross-tenant ticket/device/component/audit access.

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
- `tenants`: tenant model, per-tenant integration config, component registry, audit logs, execution settings, and tenant-scoped roles.

## Database Draft

Migrations cover Phase 0 through Phase 12. Phase 12 drafts tenants and tenant-scoped columns in `apps/api/db/migrations/0013_phase12_tenants.sql`.
