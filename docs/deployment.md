# Deployment

Dispatch Sentinel Phase 14 is the production MVP vertical slice for internal MSP validation. Billing is not implemented.

## Runtime

- Node.js 20 or newer.
- API build: `npm run build:shared && npm run build:api:only`.
- Web build from `apps/web`: `npm install && npm run build`.
- Deploy API and web as separate Vercel projects.

## Required Environment

- `NODE_ENV=production`
- `API_HOST`
- `API_PORT`
- `LOG_LEVEL`
- `DATABASE_URL`
- `ADMIN_SETUP_TOKEN`
- `ADMIN_SESSION_SECRET`
- `DISPATCH_SENTINEL_ENCRYPTION_KEY`
- `DISPATCH_SENTINEL_ENCRYPTION_KEY_VERSION`
- `ADMIN_ALLOWED_ORIGIN`
- `DATTO_RMM_EXECUTION_ENABLED=false`
- `BMS_WEBHOOK_SECRET`
- `AUTOMATION_CALLBACK_BASE_URL`
- `AUTOMATION_CALLBACK_SECRET`
- `ADMIN_BOOTSTRAP_EMAIL`
- `ADMIN_BOOTSTRAP_PASSWORD`

The web Vercel project requires:

- `NEXT_PUBLIC_API_BASE_URL`

Changing `NEXT_PUBLIC_API_BASE_URL` requires rebuilding/redeploying the web project. The API `ADMIN_ALLOWED_ORIGIN` value must exactly match the web deployment origin when using cookie-based admin sessions.

## Tenant Configuration

Each tenant must have:

- Tenant row with active status.
- Tenant BMS configuration using secret references, not raw secrets.
- Tenant Datto RMM configuration using secret references, not raw secrets.
- Tenant component registry seeded from the approved registry.
- Tenant execution settings with `globalAutomationDisabled=true` and `dryRunOnly=true` until validated.
- Tenant user roles for read-only, operator, and admin access.

## Rollout Checklist

- Run migrations through `0015_phase14_production_mvp_vertical_slice.sql`.
- Seed tenants and per-tenant component registries.
- Confirm `/healthz` reports API, database, queue, BMS adapter, and Datto RMM adapter checks.
- Confirm `/health` returns readiness flags without secret values.
- Keep `DATTO_RMM_EXECUTION_ENABLED=false` until production approval.
- Keep tenant `dryRunOnly=true` during first tenant validation.
- Verify audit export and component registry export for each tenant.
