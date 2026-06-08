import type { TenantExecutionSettings, TenantIntegrationConfig, TenantUserRole } from "@dispatch-sentinel/shared";
import { describe, expect, it } from "vitest";
import {
  TenantAuditLogRepository,
  TenantComponentRegistryRepository,
  TenantExecutionSettingsRepository,
  TenantIntegrationConfigRepository,
  TenantRepository,
  TenantRoleRepository
} from "./tenant-store.js";

const now = "2026-06-08T16:00:00.000Z";

describe("tenant isolation", () => {
  it("isolates component registries per tenant", () => {
    const registry = new TenantComponentRegistryRepository();
    registry.seedTenant("tenant-a");
    registry.seedTenant("tenant-b");

    registry.update("tenant-a", "restart-print-spooler", { enabled: false });

    expect(registry.get("tenant-a", "restart-print-spooler")?.enabled).toBe(false);
    expect(registry.get("tenant-b", "restart-print-spooler")?.enabled).toBe(true);
    expect(() => registry.list("tenant-missing")).toThrow("Tenant component registry was not found");
  });

  it("isolates audit logs per tenant", () => {
    const audit = new TenantAuditLogRepository();

    audit.record(event("tenant-a", "ticket:A"));
    audit.record(event("tenant-b", "ticket:B"));

    expect(audit.list("tenant-a")).toHaveLength(1);
    expect(audit.list("tenant-a")[0]?.ticketId).toBe("ticket:A");
    expect(audit.list("tenant-b")).toHaveLength(1);
    expect(audit.list("tenant-b")[0]?.ticketId).toBe("ticket:B");
  });

  it("isolates BMS and Datto configuration per tenant", () => {
    const configs = new TenantIntegrationConfigRepository();

    configs.upsert(config("tenant-a", "https://bms-a.example.test", "https://rmm-a.example.test"));
    configs.upsert(config("tenant-b", "https://bms-b.example.test", "https://rmm-b.example.test"));

    expect(configs.get("tenant-a").bmsBaseUrl).toBe("https://bms-a.example.test");
    expect(configs.get("tenant-b").dattoRmmBaseUrl).toBe("https://rmm-b.example.test");
    expect(() => configs.get("tenant-c")).toThrow("Tenant integration configuration was not found");
  });

  it("isolates execution settings per tenant", () => {
    const settings = new TenantExecutionSettingsRepository();

    settings.upsert(executionSettings("tenant-a", true, ["acct-blocked"]));
    settings.upsert(executionSettings("tenant-b", false, []));

    expect(settings.get("tenant-a").globalAutomationDisabled).toBe(true);
    expect(settings.get("tenant-b").globalAutomationDisabled).toBe(false);
    expect(settings.get("tenant-a").blockedAccounts).toEqual(["acct-blocked"]);
  });

  it("enforces admin and operator roles by tenant", () => {
    const roles = new TenantRoleRepository();
    roles.assign(role("tenant-a", "user-1", "admin"));
    roles.assign(role("tenant-b", "user-1", "operator"));

    expect(roles.requireRole("tenant-a", "user-1", ["admin"])).toBe("admin");
    expect(roles.requireRole("tenant-b", "user-1", ["operator", "admin"])).toBe("operator");
    expect(() => roles.requireRole("tenant-b", "user-1", ["admin"])).toThrow("User does not have access");
    expect(() => roles.requireRole("tenant-a", "user-2", ["read_only", "operator", "admin"])).toThrow("User does not have access");
  });

  it("does not allow disabled tenants to be used", () => {
    const tenants = new TenantRepository();
    tenants.create({ id: "tenant-a", name: "Tenant A", slug: "tenant-a", now: new Date(now) });
    tenants.disable("tenant-a", new Date(now));

    expect(() => tenants.get("tenant-a")).toThrow("Tenant not found or disabled");
  });
});

function event(tenantId: string, ticketId: string) {
  return {
    tenantId,
    type: "automation.run.started",
    ticketId,
    deviceUid: "device-1",
    componentId: "component-1",
    outcome: "success" as const,
    metadata: {}
  };
}

function config(tenantId: string, bmsBaseUrl: string, dattoRmmBaseUrl: string): TenantIntegrationConfig {
  return {
    tenantId,
    bmsBaseUrl,
    bmsWebhookSecretRef: `${tenantId}/bms/webhook`,
    dattoRmmBaseUrl,
    dattoRmmApiKeyRef: `${tenantId}/datto/key`,
    dattoRmmApiSecretRef: `${tenantId}/datto/secret`,
    dattoRmmExecutionEnabled: false,
    updatedAt: now
  };
}

function executionSettings(tenantId: string, disabled: boolean, blockedAccounts: string[]): TenantExecutionSettings {
  return {
    tenantId,
    globalAutomationDisabled: disabled,
    dryRunOnly: true,
    allowedAccounts: [],
    blockedAccounts,
    maxRunsPerDevicePerDay: 2,
    updatedAt: now
  };
}

function role(tenantId: string, userId: string, roleName: TenantUserRole["role"]): TenantUserRole {
  return {
    tenantId,
    userId,
    email: `${userId}@example.test`,
    role: roleName,
    createdAt: now,
    updatedAt: now
  };
}
