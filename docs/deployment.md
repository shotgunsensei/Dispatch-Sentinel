# Deployment

Dispatch Sentinel Phase 12 is prepared for productization after internal MVP success. Billing is not implemented.

## Runtime

- Node.js 20 or newer.
- Build with `npm run build`.
- Start the API with `node apps/api/dist/index.js`.
- Serve the web bundle from `apps/web/dist` behind the same HTTPS boundary or a trusted static host.

## Required Environment

- `NODE_ENV=production`
- `API_HOST`
- `API_PORT`
- `LOG_LEVEL`
- `DATABASE_URL`
- `BMS_WEBHOOK_SECRET`
- `AUTOMATION_CALLBACK_BASE_URL`
- `AUTOMATION_CALLBACK_SECRET`
- `ADMIN_BOOTSTRAP_EMAIL`
- `ADMIN_BOOTSTRAP_PASSWORD`

## Tenant Configuration

Each tenant must have:

- Tenant row with active status.
- Tenant BMS configuration using secret references, not raw secrets.
- Tenant Datto RMM configuration using secret references, not raw secrets.
- Tenant component registry seeded from the approved registry.
- Tenant execution settings with `globalAutomationDisabled=true` and `dryRunOnly=true` until validated.
- Tenant user roles for read-only, operator, and admin access.

## Rollout Checklist

- Run migrations through `0013_phase12_tenants.sql`.
- Seed tenants and per-tenant component registries.
- Confirm `/healthz` reports API, database, queue, BMS adapter, and Datto RMM adapter checks.
- Keep `DATTO_RMM_EXECUTION_ENABLED=false` until production approval.
- Keep tenant `dryRunOnly=true` during first tenant validation.
- Verify audit export and component registry export for each tenant.
