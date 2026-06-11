import { once } from "node:events";
import { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ApiConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createApiServer } from "./server.js";
import { InMemoryAuditSink } from "./modules/audit/audit-sink.js";
import { AdminAuthService } from "./modules/admin/auth.js";
import { AdminDashboardService, AdminSafetySettingsRepository } from "./modules/admin/dashboard.js";
import { InMemoryRateLimiter } from "./modules/admin/rate-limit.js";
import { ApprovalRequestRepository, ApprovalService } from "./modules/approvals/approval-service.js";
import { MockDattoDeviceAdapter } from "./modules/assets/mock-datto-device-adapter.js";
import { MockBmsAdapter } from "./modules/bms/mock-bms-adapter.js";
import { BmsWorkflowService, createBmsWorkflowConfig } from "./modules/bms/workflow.js";
import { ComponentRegistryRepository } from "./modules/component-registry/registry.js";
import { AutomationRunRepository } from "./modules/automation/automation-runner.js";
import { AutomationResultHandler } from "./modules/automation/result-handler.js";
import { DryRunDattoRmmAdapter } from "./modules/datto-rmm/dry-run-adapter.js";
import { TicketIntakeService } from "./modules/tickets/intake-service.js";
import { SecretEncryptionService } from "./modules/security/encryption.js";
import {
  DryRunAutomationCandidateRepository,
  IntegrationTestRunRepository,
  TenantWebhookEventRepository,
  TicketEvaluationRepository,
  TenantAuditLogRepository,
  TenantRepository,
  TenantSecretRepository,
  TenantSettingsRepository
} from "./modules/tenants/tenant-store.js";

const silentLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

describe("API server", () => {
  it("returns API metadata from the root route", async () => {
    const fixture = await startTestApi();

    try {
      const response = await fetch(`http://127.0.0.1:${fixture.port}/`);
      const body = await response.json() as {
        ok: boolean;
        service: string;
        name: string;
        phase: string;
        routes: { health: string; bmsWebhook: string };
      };

      expect(response.status).toBe(200);
      expect(body).toEqual({
        ok: true,
        service: "dispatch-sentinel-api",
        name: "Dispatch Sentinel",
        phase: "12",
        routes: {
          health: "/health",
          bmsWebhook: "/api/webhooks/bms"
        }
      });
    } finally {
      await fixture.stop();
    }
  });

  it("returns OK from the health endpoint", async () => {
    const config = testConfig();
    const api = createApiServer(config, createLogger("error"));

    api.server.listen(0, "127.0.0.1");
    await once(api.server, "listening");

    const address = api.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    const body = await response.json();

    await api.stop();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      service: "dispatch-sentinel-api",
      phase: "12",
      checks: {
        api: "ok",
        database: "ok",
        queue: "ok",
        bmsAdapter: "ok",
        dattoRmmAdapter: "dry_run"
      }
    });
  });

  it("returns public health readiness flags", async () => {
    const fixture = await startTestApi();

    try {
      const response = await fetch(`http://127.0.0.1:${fixture.port}/health`);
      const body = await response.json() as {
        ok: boolean;
        service: string;
        environment: string;
        encryptionConfigured: boolean;
        adminAuthConfigured: boolean;
        dattoExecutionGloballyEnabled: boolean;
        databaseConfigured: boolean;
        databaseReachable: boolean;
        config: { bmsWebhookConfigured: boolean; dattoExecutionEnabled: boolean };
      };

      expect(response.status).toBe(200);
      expect(body).toEqual({
        ok: true,
        service: "dispatch-sentinel-api",
        environment: "test",
        databaseConfigured: true,
        databaseReachable: false,
        encryptionConfigured: true,
        adminAuthConfigured: true,
        dattoExecutionGloballyEnabled: false,
        config: {
          bmsWebhookConfigured: true,
          dattoExecutionEnabled: false,
          encryptionConfigured: true,
          adminAuthConfigured: true,
          dattoExecutionGloballyEnabled: false
        }
      });
    } finally {
      await fixture.stop();
    }
  });

  it("returns public health without BMS webhook configuration", async () => {
    const fixture = await startTestApi({ config: { bmsWebhookSecret: null, nodeEnv: "production" } });

    try {
      const response = await fetch(`http://127.0.0.1:${fixture.port}/health`);
      const body = await response.json() as {
        ok: boolean;
        service: string;
        environment: string;
        encryptionConfigured: boolean;
        adminAuthConfigured: boolean;
        dattoExecutionGloballyEnabled: boolean;
        databaseConfigured: boolean;
        databaseReachable: boolean;
        config: { bmsWebhookConfigured: boolean; dattoExecutionEnabled: boolean };
      };

      expect(response.status).toBe(200);
      expect(body).toEqual({
        ok: true,
        service: "dispatch-sentinel-api",
        environment: "production",
        databaseConfigured: true,
        databaseReachable: false,
        encryptionConfigured: true,
        adminAuthConfigured: true,
        dattoExecutionGloballyEnabled: false,
        config: {
          bmsWebhookConfigured: false,
          dattoExecutionEnabled: false,
          encryptionConfigured: true,
          adminAuthConfigured: true,
          dattoExecutionGloballyEnabled: false
        }
      });
    } finally {
      await fixture.stop();
    }
  });

  it("does not allow production to use local in-memory tenant stores", () => {
    const config = testConfig({ nodeEnv: "production", databaseUrl: "file:./test.sqlite" });

    expect(() => createApiServer(config, createLogger("error"))).toThrow("DATABASE_URL must be a Postgres connection string in production.");
  });

  it("does not return secret values in public health output", async () => {
    const fixture = await startTestApi({
      config: {
        bmsWebhookSecret: "super-secret-bms-value",
        automationCallbackSecret: "super-secret-callback-value",
        approvalTokenSecret: "super-secret-approval-value"
      }
    });

    try {
      const response = await fetch(`http://127.0.0.1:${fixture.port}/health`);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).not.toContain("super-secret-bms-value");
      expect(text).not.toContain("super-secret-callback-value");
      expect(text).not.toContain("super-secret-approval-value");
    } finally {
      await fixture.stop();
    }
  });

  it("returns no content for favicon routes", async () => {
    const fixture = await startTestApi();

    try {
      const ico = await fetch(`http://127.0.0.1:${fixture.port}/favicon.ico`);
      const png = await fetch(`http://127.0.0.1:${fixture.port}/favicon.png`);

      expect(ico.status).toBe(204);
      expect(await ico.text()).toBe("");
      expect(png.status).toBe(204);
      expect(await png.text()).toBe("");
    } finally {
      await fixture.stop();
    }
  });

  it("returns 404 for unknown routes", async () => {
    const fixture = await startTestApi();

    try {
      const response = await fetch(`http://127.0.0.1:${fixture.port}/not-a-route`);
      const body = await response.json() as { error: string; message: string };

      expect(response.status).toBe(404);
      expect(body).toEqual({
        error: "not_found",
        message: "Route not found."
      });
    } finally {
      await fixture.stop();
    }
  });

  it("rejects BMS webhooks with a missing or invalid secret", async () => {
    const fixture = await startTestApi();

    try {
      const missingSecret = await postWebhook(fixture.port, undefined, {
        eventType: "ticket.created",
        ticketId: "BMS-1001"
      });
      const invalidSecret = await postWebhook(fixture.port, "wrong-secret", {
        eventType: "ticket.created",
        ticketId: "BMS-1001"
      });

      expect(missingSecret.status).toBe(401);
      expect(invalidSecret.status).toBe(401);
      expect(fixture.auditSink.list()).toHaveLength(0);
    } finally {
      await fixture.stop();
    }
  });

  it("rejects BMS webhooks when BMS_WEBHOOK_SECRET is not configured", async () => {
    const fixture = await startTestApi({ config: { bmsWebhookSecret: null } });

    try {
      const response = await postWebhook(fixture.port, "anything", {
        eventType: "ticket.created",
        ticketId: "BMS-1001"
      });
      const body = await response.json() as { error: string; code: string };

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        error: "configuration_error",
        code: "missing_secret"
      });
      expect(fixture.auditSink.list()).toHaveLength(0);
    } finally {
      await fixture.stop();
    }
  });

  it("accepts valid BMS webhook payloads and creates intake audit events", async () => {
    const fixture = await startTestApi();

    try {
      const response = await postWebhook(fixture.port, "test-secret", {
        eventType: "ticket.created",
        ticketId: "BMS-1001"
      });

      expect(response.status).toBe(202);
      await waitFor(() => fixture.ticketIntakeService.listJobs()[0]?.status === "completed");

      const auditTypes = fixture.auditSink.list().map((event) => event.type);
      expect(auditTypes).toContain("bms.webhook.received");
      expect(auditTypes).toContain("bms.ticket.fetched");
      expect(auditTypes).toContain("bms.ticket.normalized");
      expect(fixture.ticketIntakeService.listNormalizedTickets()[0]).toMatchObject({
        externalBmsId: "BMS-1001",
        source: "bms",
        queue: "Helpdesk"
      });
    } finally {
      await fixture.stop();
    }
  });

  it("supports component registry admin listing and controlled updates", async () => {
    const fixture = await startTestApi();

    try {
      const token = await login(fixture.port);
      const listResponse = await adminFetch(fixture.port, token, "/api/admin/components");
      const listBody = await listResponse.json() as { components: Array<{ slug: string }> };

      expect(listResponse.status).toBe(200);
      expect(listBody.components).toHaveLength(13);

      const getResponse = await adminFetch(fixture.port, token, "/api/admin/components/restart-print-spooler");
      const getBody = await getResponse.json() as { component: { slug: string; enabled: boolean } };

      expect(getResponse.status).toBe(200);
      expect(getBody.component).toMatchObject({
        slug: "restart-print-spooler",
        enabled: true
      });

      const patchResponse = await adminFetch(fixture.port, token, "/api/admin/components/restart-print-spooler", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false, riskLevel: "medium" })
      });
      const patchBody = await patchResponse.json() as { component: { enabled: boolean; riskLevel: string } };

      expect(patchResponse.status).toBe(200);
      expect(patchBody.component).toMatchObject({
        enabled: false,
        riskLevel: "medium"
      });
    } finally {
      await fixture.stop();
    }
  });

  it("rejects invalid component registry updates", async () => {
    const fixture = await startTestApi();

    try {
      const token = await login(fixture.port);
      const response = await adminFetch(fixture.port, token, "/api/admin/components/restart-print-spooler", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ riskLevel: "invalid" })
      });
      const body = await response.json() as { error: string };

      expect(response.status).toBe(400);
      expect(body.error).toBe("validation_failed");
    } finally {
      await fixture.stop();
    }
  });

  it("serves admin dashboard routes", async () => {
    const fixture = await startTestApi();

    try {
      const token = await login(fixture.port);
      const overview = await adminFetch(fixture.port, token, "/api/admin/overview");
      const evaluations = await adminFetch(fixture.port, token, "/api/admin/ticket-evaluations");
      const approvals = await adminFetch(fixture.port, token, "/api/admin/approvals");
      const runs = await adminFetch(fixture.port, token, "/api/admin/automation-runs");
      const settings = await adminFetch(fixture.port, token, "/api/admin/safety-settings");

      expect(overview.status).toBe(200);
      expect(evaluations.status).toBe(200);
      expect(approvals.status).toBe(200);
      expect(runs.status).toBe(200);
      expect(settings.status).toBe(200);
    } finally {
      await fixture.stop();
    }
  });

  it("filters audit log by ticket and exports CSV", async () => {
    const fixture = await startTestApi();

    try {
      const token = await login(fixture.port);
      fixture.auditSink.record({
        type: "automation.run.started",
        ticketId: "ticket:BMS-1001",
        outcome: "success",
        metadata: { deviceUid: "datto-device-accounting-pc-04", componentId: "component-restart-print-spooler" }
      });
      fixture.auditSink.record({
        type: "automation.run.failed",
        ticketId: "ticket:BMS-1008",
        outcome: "error",
        metadata: { deviceUid: "datto-device-blue-pc-01", componentId: "component-run-gpupdate" }
      });

      const jsonResponse = await adminFetch(fixture.port, token, "/api/admin/audit-events?ticketId=ticket:BMS-1001");
      const jsonBody = await jsonResponse.json() as { events: Array<{ ticketId: string }> };
      const csvResponse = await adminFetch(fixture.port, token, "/api/admin/audit-events?componentId=component-restart-print-spooler&format=csv");
      const csvBody = await csvResponse.text();

      expect(jsonBody.events).toHaveLength(1);
      expect(jsonBody.events[0]?.ticketId).toBe("ticket:BMS-1001");
      expect(csvResponse.headers.get("content-type")).toContain("text/csv");
      expect(csvBody).toContain("automation.run.started");
      expect(csvBody).not.toContain("automation.run.failed");
    } finally {
      await fixture.stop();
    }
  });

  it("updates safety settings with validation", async () => {
    const fixture = await startTestApi();

    try {
      const token = await login(fixture.port);
      const invalid = await adminFetch(fixture.port, token, "/api/admin/safety-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxRunsPerDevicePerDay: -1 })
      });
      const valid = await adminFetch(fixture.port, token, "/api/admin/safety-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ globalExecutionEnabled: false, dryRunMode: true, blockedAccounts: ["acct-999"] })
      });
      const validBody = await valid.json() as { settings: { globalExecutionEnabled: boolean; serverAutomationDisabled: boolean } };

      expect(invalid.status).toBe(400);
      expect(valid.status).toBe(200);
      expect(validBody.settings.globalExecutionEnabled).toBe(false);
      expect(validBody.settings.serverAutomationDisabled).toBe(true);
    } finally {
      await fixture.stop();
    }
  });

  it("requires admin authentication for admin APIs", async () => {
    const fixture = await startTestApi();

    try {
      const denied = await fetch(`http://127.0.0.1:${fixture.port}/api/admin/overview`);
      const loginDenied = await fetch(`http://127.0.0.1:${fixture.port}/api/admin/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@dispatch.local", password: "wrong" })
      });
      const token = await login(fixture.port);
      const allowed = await adminFetch(fixture.port, token, "/api/admin/overview");

      expect(denied.status).toBe(401);
      expect(loginDenied.status).toBe(401);
      expect(allowed.status).toBe(200);
    } finally {
      await fixture.stop();
    }
  });

  it("uses the same session cookie for me, tenants, and overview admin routes", async () => {
    const fixture = await startTestApi();

    try {
      const cookie = await loginCookieWithSetupToken(fixture.port);
      const me = await cookieFetch(fixture.port, cookie, "/api/admin/me");
      const tenants = await cookieFetch(fixture.port, cookie, "/api/admin/tenants");
      const overview = await cookieFetch(fixture.port, cookie, "/api/admin/overview");
      const created = await cookieFetch(fixture.port, cookie, "/api/admin/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Cookie Tenant", slug: "cookie-tenant" })
      });
      const duplicate = await cookieFetch(fixture.port, cookie, "/api/admin/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Cookie Tenant Again", slug: "cookie-tenant" })
      });
      const deniedTenants = await fetch(`http://127.0.0.1:${fixture.port}/api/admin/tenants`);
      const deniedCreate = await fetch(`http://127.0.0.1:${fixture.port}/api/admin/tenants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Denied Tenant", slug: "denied-tenant" })
      });

      expect(me.status).toBe(200);
      expect(tenants.status).toBe(200);
      expect(overview.status).toBe(200);
      expect(created.status).toBe(201);
      expect(duplicate.status).toBe(409);
      expect(deniedTenants.status).toBe(401);
      expect(deniedCreate.status).toBe(401);
    } finally {
      await fixture.stop();
    }
  });

  it("allows credentialed preflight for tenant creation from the configured admin origin", async () => {
    const fixture = await startTestApi({ config: { adminAllowedOrigin: "https://web.example.test", nodeEnv: "production", databaseUrl: "postgres://user:pass@127.0.0.1:5432/db" } });

    try {
      const response = await fetch(`http://127.0.0.1:${fixture.port}/api/admin/tenants`, {
        method: "OPTIONS",
        headers: {
          origin: "https://web.example.test",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type"
        }
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("https://web.example.test");
      expect(response.headers.get("access-control-allow-credentials")).toBe("true");
      expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    } finally {
      await fixture.stop();
    }
  });

  it("clears the admin session cookie on logout", async () => {
    const fixture = await startTestApi();

    try {
      const cookie = await loginCookieWithSetupToken(fixture.port);
      const logout = await cookieFetch(fixture.port, cookie, "/api/admin/logout", { method: "POST" });
      const nextCookie = logout.headers.get("set-cookie") ?? "";

      expect(logout.status).toBe(200);
      expect(nextCookie).toContain("dispatch_sentinel_admin=");
      expect(nextCookie).toContain("Path=/");
      expect(nextCookie).toContain("SameSite=Lax");
    } finally {
      await fixture.stop();
    }
  });

  it("sets secure cross-site admin cookie options in production", async () => {
    const fixture = await startTestApi({ config: { nodeEnv: "production", databaseUrl: "postgres://user:pass@127.0.0.1:5432/db" } });

    try {
      const cookie = await loginCookieWithSetupToken(fixture.port);

      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=None");
      expect(cookie).toContain("Path=/");
    } finally {
      await fixture.stop();
    }
  });

  it("sets secure cross-site admin cookie options when an HTTPS admin origin is configured", async () => {
    const fixture = await startTestApi({ config: { nodeEnv: "test", adminAllowedOrigin: "https://web.example.test" } });

    try {
      const cookie = await loginCookieWithSetupToken(fixture.port);

      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=None");
      expect(cookie).toContain("Path=/");
    } finally {
      await fixture.stop();
    }
  });

  it("supports setup-token admin login and tenant creation", async () => {
    const fixture = await startTestApi();

    try {
      const denied = await fetch(`http://127.0.0.1:${fixture.port}/api/admin/tenants`);
      const token = await loginWithSetupToken(fixture.port);
      const created = await adminFetch(fixture.port, token, "/api/admin/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Acme Support", slug: "acme-support" })
      });
      const body = await created.json() as { tenant: { id: string; slug: string; webhookUrl: string } };

      expect(denied.status).toBe(401);
      expect(created.status).toBe(201);
      expect(body.tenant.slug).toBe("acme-support");
      expect(body.tenant.webhookUrl).toBe("/api/webhooks/bms/acme-support");
    } finally {
      await fixture.stop();
    }
  });

  it("validates tenant slugs", async () => {
    const fixture = await startTestApi();

    try {
      const token = await loginWithSetupToken(fixture.port);
      const response = await adminFetch(fixture.port, token, "/api/admin/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Bad Slug Tenant", slug: "Bad Slug!" })
      });

      expect(response.status).toBe(400);
    } finally {
      await fixture.stop();
    }
  });

  it("stores tenant secrets encrypted and only returns status metadata", async () => {
    const fixture = await startTestApi();

    try {
      const token = await loginWithSetupToken(fixture.port);
      const tenant = await createTenant(fixture.port, token);
      const response = await adminFetch(fixture.port, token, `/api/admin/tenants/${tenant.id}/secrets/bms_webhook_secret`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "tenant-webhook-secret" })
      });
      const status = await adminFetch(fixture.port, token, `/api/admin/tenants/${tenant.id}/secrets/status`);
      const statusText = await status.text();

      expect(response.status).toBe(200);
      expect(status.status).toBe(200);
      expect(statusText).not.toContain("tenant-webhook-secret");
      expect(statusText).toContain("\"configured\":true");
      expect(fixture.tenantSecretRepository.decrypt(tenant.id, "bms_webhook_secret")).toBe("tenant-webhook-secret");
    } finally {
      await fixture.stop();
    }
  });

  it("tenant BMS webhook rejects invalid tenants and missing or invalid secrets", async () => {
    const fixture = await startTestApi();

    try {
      const token = await loginWithSetupToken(fixture.port);
      const tenant = await createTenant(fixture.port, token);
      const invalidTenant = await postTenantWebhook(fixture.port, "missing-tenant", "secret");
      const missingSecret = await postTenantWebhook(fixture.port, tenant.slug, "secret");
      await adminFetch(fixture.port, token, `/api/admin/tenants/${tenant.id}/secrets/bms_webhook_secret`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "tenant-webhook-secret" })
      });
      const invalidSecret = await postTenantWebhook(fixture.port, tenant.slug, "wrong-secret");

      expect(invalidTenant.status).toBe(404);
      expect(missingSecret.status).toBe(503);
      expect(invalidSecret.status).toBe(401);
    } finally {
      await fixture.stop();
    }
  });

  it("tenant BMS webhook accepts valid per-tenant secrets", async () => {
    const fixture = await startTestApi();

    try {
      const token = await loginWithSetupToken(fixture.port);
      const tenant = await createTenant(fixture.port, token);
      await adminFetch(fixture.port, token, `/api/admin/tenants/${tenant.id}/secrets/bms_webhook_secret`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "tenant-webhook-secret" })
      });
      const accepted = await postTenantWebhook(fixture.port, tenant.slug, "tenant-webhook-secret");

      expect(accepted.status).toBe(202);
      expect(fixture.tenantAuditLog.list(tenant.id).some((event) => event.type === "tenant.bms.webhook.accepted")).toBe(true);
      expect(fixture.tenantWebhookEvents.list(tenant.id)).toHaveLength(1);
      expect(fixture.ticketEvaluations.list(tenant.id)[0]).toMatchObject({
        detectedIntent: "restart_print_spooler",
        outcome: "AUTO_ELIGIBLE_CONFIRM_CLIENT"
      });
      expect(fixture.dryRunCandidates.list(tenant.id)).toHaveLength(1);
    } finally {
      await fixture.stop();
    }
  });

  it("rejects inactive tenant webhooks", async () => {
    const fixture = await startTestApi();

    try {
      const token = await loginWithSetupToken(fixture.port);
      const tenant = await createTenant(fixture.port, token);
      await adminFetch(fixture.port, token, `/api/admin/tenants/${tenant.id}/secrets/bms_webhook_secret`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "tenant-webhook-secret" })
      });
      await adminFetch(fixture.port, token, `/api/admin/tenants/${tenant.id}/disable`, { method: "POST" });
      const response = await postTenantWebhook(fixture.port, tenant.slug, "tenant-webhook-secret");

      expect(response.status).toBe(403);
      expect(fixture.tenantWebhookEvents.list(tenant.id)[0]).toMatchObject({
        status: "rejected",
        reason: "tenant_inactive"
      });
    } finally {
      await fixture.stop();
    }
  });

  it("fails duplicate tenant slugs with conflict", async () => {
    const fixture = await startTestApi();

    try {
      const token = await loginWithSetupToken(fixture.port);
      await createTenant(fixture.port, token, "duplicate-acme");
      const duplicate = await adminFetch(fixture.port, token, "/api/admin/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Duplicate Acme", slug: "duplicate-acme" })
      });

      expect(duplicate.status).toBe(409);
    } finally {
      await fixture.stop();
    }
  });

  it("enforces read-only permissions", async () => {
    const fixture = await startTestApi({ role: "read_only" });

    try {
      const token = await login(fixture.port);
      const read = await adminFetch(fixture.port, token, "/api/admin/overview");
      const write = await adminFetch(fixture.port, token, "/api/admin/safety-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ globalExecutionEnabled: false })
      });

      expect(read.status).toBe(200);
      expect(write.status).toBe(403);
    } finally {
      await fixture.stop();
    }
  });

  it("rate limits webhooks", async () => {
    const fixture = await startTestApi({ config: { webhookRateLimitPerMinute: 1 } });

    try {
      const first = await postWebhook(fixture.port, "test-secret", {
        eventType: "ticket.created",
        ticketId: "BMS-1001"
      });
      const second = await postWebhook(fixture.port, "test-secret", {
        eventType: "ticket.updated",
        ticketId: "BMS-1001"
      });

      expect(first.status).toBe(202);
      expect(second.status).toBe(429);
    } finally {
      await fixture.stop();
    }
  });

  it("rate limits admin APIs", async () => {
    const fixture = await startTestApi({ config: { adminRateLimitPerMinute: 1 } });

    try {
      const first = await fetch(`http://127.0.0.1:${fixture.port}/api/admin/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@dispatch.local", password: "local-admin-password" })
      });
      const second = await fetch(`http://127.0.0.1:${fixture.port}/api/admin/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@dispatch.local", password: "local-admin-password" })
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
    } finally {
      await fixture.stop();
    }
  });

  it("rate limits approval endpoints", async () => {
    const fixture = await startTestApi({ config: { approvalRateLimitPerMinute: 1 } });

    try {
      const first = await fetch(`http://127.0.0.1:${fixture.port}/approve/not-a-real-token`);
      const second = await fetch(`http://127.0.0.1:${fixture.port}/approve/not-a-real-token`);

      expect(first.status).toBe(400);
      expect(second.status).toBe(429);
    } finally {
      await fixture.stop();
    }
  });

  it("exports registry, audit, and automation run history", async () => {
    const fixture = await startTestApi();

    try {
      const token = await login(fixture.port);
      const registry = await adminFetch(fixture.port, token, "/api/admin/export/component-registry");
      const audit = await adminFetch(fixture.port, token, "/api/admin/export/audit");
      const runs = await adminFetch(fixture.port, token, "/api/admin/export/automation-runs");

      expect(registry.status).toBe(200);
      expect(audit.status).toBe(200);
      expect(runs.status).toBe(200);
    } finally {
      await fixture.stop();
    }
  });
});

function testConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    logLevel: "error",
    databaseUrl: "file:./test.sqlite",
    bmsWebhookSecret: "test-secret",
    dattoRmmExecutionEnabled: false,
    dattoRmmBaseUrl: null,
    dattoRmmApiKey: null,
    dattoRmmApiSecret: null,
    dattoRmmTimeoutMs: 10000,
    automationCallbackBaseUrl: "http://127.0.0.1:4310",
    automationCallbackSecret: "callback-secret",
    approvalTokenSecret: "approval-token-secret",
    automationJobTimeoutMinutes: 30,
    bmsWritesEnabled: true,
    bmsQueueAutomationReview: "Automation Review",
    bmsQueueLevel1: "Level 1",
    bmsQueueLevel2: "Level 2",
    bmsQueueSecurity: "Security",
    bmsQueueHumanReview: "Human Review",
    bmsStatusAutoTriage: "Auto-Triage",
    bmsStatusAwaitingClientConfirmation: "Awaiting Client Confirmation",
    bmsStatusAutomationRunning: "Automation Running",
    bmsStatusNeedsQa: "Needs QA",
    bmsStatusEscalated: "Escalated",
    bmsStatusCompleted: "Completed",
    bmsQueueAutoEligible: true,
    bmsDenyAutomationRouteToHuman: true,
    bmsSuccessPublicNoteEnabled: false,
    bmsCloseTicketsEnabled: false,
    bmsPriorityUpdatesEnabled: false,
    adminBootstrapEmail: "admin@dispatch.local",
    adminBootstrapPassword: "local-admin-password",
    adminSetupToken: "local-admin-setup-token",
    adminSessionSecret: "local-admin-session-secret",
    encryptionKey: randomBytes(32).toString("base64"),
    encryptionKeyVersion: "test-v1",
    adminAllowedOrigin: null,
    adminSessionTtlMinutes: 480,
    webhookRateLimitPerMinute: 60,
    approvalRateLimitPerMinute: 30,
    adminRateLimitPerMinute: 120,
    globalAutomationDisabled: false,
    dryRunOnly: false,
    ...overrides
  };
}

async function startTestApi(options: { config?: Partial<ApiConfig>; role?: "read_only" | "operator" | "admin" } = {}) {
  const config: ApiConfig = testConfig(options.config);
  const auditSink = new InMemoryAuditSink(silentLogger);
  const bmsAdapter = new MockBmsAdapter();
  const ticketIntakeService = new TicketIntakeService(bmsAdapter, auditSink, silentLogger);
  const componentRegistry = new ComponentRegistryRepository();
  const approvalRepository = new ApprovalRequestRepository();
  const approvalService = new ApprovalService(approvalRepository, componentRegistry, new MockDattoDeviceAdapter(), bmsAdapter);
  const automationRunRepository = new AutomationRunRepository();
  const safetySettingsRepository = new AdminSafetySettingsRepository(config);
  const bmsWorkflow = new BmsWorkflowService(
    bmsAdapter,
    createBmsWorkflowConfig({
      writesEnabled: config.bmsWritesEnabled,
      bmsQueueAutomationReview: config.bmsQueueAutomationReview,
      bmsQueueLevel1: config.bmsQueueLevel1,
      bmsQueueLevel2: config.bmsQueueLevel2,
      bmsQueueSecurity: config.bmsQueueSecurity,
      bmsQueueHumanReview: config.bmsQueueHumanReview,
      bmsStatusAutoTriage: config.bmsStatusAutoTriage,
      bmsStatusAwaitingClientConfirmation: config.bmsStatusAwaitingClientConfirmation,
      bmsStatusAutomationRunning: config.bmsStatusAutomationRunning,
      bmsStatusNeedsQa: config.bmsStatusNeedsQa,
      bmsStatusEscalated: config.bmsStatusEscalated,
      bmsStatusCompleted: config.bmsStatusCompleted,
      bmsQueueAutoEligible: config.bmsQueueAutoEligible,
      bmsDenyAutomationRouteToHuman: config.bmsDenyAutomationRouteToHuman,
      bmsSuccessPublicNoteEnabled: config.bmsSuccessPublicNoteEnabled,
      bmsCloseTicketsEnabled: config.bmsCloseTicketsEnabled,
      bmsPriorityUpdatesEnabled: config.bmsPriorityUpdatesEnabled
    }),
    auditSink
  );
  const adminDashboardService = new AdminDashboardService(
    ticketIntakeService,
    componentRegistry,
    approvalRepository,
    automationRunRepository,
    auditSink,
    safetySettingsRepository
  );
  const automationResultHandler = new AutomationResultHandler(
    automationRunRepository,
    new DryRunDattoRmmAdapter(silentLogger),
    auditSink,
    bmsAdapter,
    bmsWorkflow
  );
  const encryptionService = new SecretEncryptionService(config.encryptionKey);
  const tenantRepository = new TenantRepository();
  const tenantSecretRepository = new TenantSecretRepository(encryptionService);
  const tenantSettingsRepository = new TenantSettingsRepository();
  const tenantAuditLog = new TenantAuditLogRepository();
  const integrationTestRuns = new IntegrationTestRunRepository();
  const tenantWebhookEvents = new TenantWebhookEventRepository();
  const ticketEvaluations = new TicketEvaluationRepository();
  const dryRunCandidates = new DryRunAutomationCandidateRepository();
  const api = createApiServer(config, silentLogger, {
    auditSink,
    ticketIntakeService,
    componentRegistry,
    approvalService,
    automationRunRepository,
    automationResultHandler,
    adminDashboardService,
    safetySettingsRepository,
    bmsWorkflow,
    adminAuthService: new AdminAuthService({
      email: config.adminBootstrapEmail,
      password: config.adminBootstrapPassword,
      role: options.role ?? "admin",
      sessionTtlMinutes: config.adminSessionTtlMinutes,
      setupToken: config.adminSetupToken,
      sessionSecret: config.adminSessionSecret
    }),
    rateLimiter: new InMemoryRateLimiter(),
    tenantRepository,
    tenantSecretRepository,
    tenantSettingsRepository,
    tenantAuditLog,
    integrationTestRuns,
    tenantWebhookEvents,
    ticketEvaluations,
    dryRunCandidates,
    encryptionService
  });

  api.server.listen(0, "127.0.0.1");
  await once(api.server, "listening");
  const address = api.server.address() as AddressInfo;

  return {
    port: address.port,
    auditSink,
    ticketIntakeService,
    bmsAdapter,
    tenantSecretRepository,
    tenantAuditLog,
    tenantWebhookEvents,
    ticketEvaluations,
    dryRunCandidates,
    stop: api.stop
  };
}

async function login(port: number): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@dispatch.local", password: "local-admin-password" })
  });
  const body = await response.json() as { token: string };
  return body.token;
}

async function loginWithSetupToken(port: number): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "local-admin-setup-token" })
  });
  const body = await response.json() as { token: string };
  return body.token;
}

async function loginCookieWithSetupToken(port: number): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "local-admin-setup-token" })
  });
  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("Login did not return an admin session cookie.");
  }
  return cookie;
}

async function cookieFetch(port: number, cookie: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      cookie
    }
  });
}

async function adminFetch(port: number, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      authorization: `Bearer ${token}`
    }
  });
}

async function postWebhook(port: number, secret: string | undefined, body: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (secret) {
    headers["x-dispatch-sentinel-secret"] = secret;
  }

  return fetch(`http://127.0.0.1:${port}/api/webhooks/bms`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

async function postTenantWebhook(port: number, tenantSlug: string, secret: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/api/webhooks/bms/${tenantSlug}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-dispatch-sentinel-secret": secret
    },
    body: JSON.stringify({
      event: "ticket.created",
      ticketId: "BMS-1001",
      title: "Printer not printing on FRONTDESK-01",
      details: "User says printer is stuck",
      account: "Acme Support",
      contactEmail: "user@example.com"
    })
  });
}

async function createTenant(port: number, token: string, slug?: string): Promise<{ id: string; slug: string }> {
  const response = await adminFetch(port, token, "/api/admin/tenants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Acme Support", slug: slug ?? `acme-${crypto.randomUUID().slice(0, 8)}` })
  });
  const body = await response.json() as { tenant: { id: string; slug: string } };
  return body.tenant;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Condition was not met before timeout.");
}
