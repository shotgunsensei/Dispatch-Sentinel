import type {
  ComponentRegistryEntry,
  Tenant,
  TenantAuditEvent,
  TenantExecutionSettings,
  TenantIntegrationConfig,
  TenantRole,
  TenantUserRole
} from "@dispatch-sentinel/shared";
import { ComponentRegistryRepository, mvpComponentRegistrySeed } from "../component-registry/registry.js";

export interface TenantCreateInput {
  id: string;
  name: string;
  slug: string;
  now?: Date;
}

export class TenantRepository {
  private readonly tenants = new Map<string, Tenant>();

  create(input: TenantCreateInput): Tenant {
    if (this.tenants.has(input.id)) {
      throw new Error("Tenant already exists.");
    }
    const now = (input.now ?? new Date()).toISOString();
    const tenant: Tenant = {
      id: input.id,
      name: input.name,
      slug: input.slug,
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    this.tenants.set(tenant.id, structuredClone(tenant));
    return structuredClone(tenant);
  }

  get(tenantId: string): Tenant {
    const tenant = this.tenants.get(tenantId);
    if (!tenant || tenant.status !== "active") {
      throw new Error("Tenant not found or disabled.");
    }
    return structuredClone(tenant);
  }

  disable(tenantId: string, now = new Date()): Tenant {
    const tenant = this.get(tenantId);
    const updated = { ...tenant, status: "disabled" as const, updatedAt: now.toISOString() };
    this.tenants.set(tenantId, structuredClone(updated));
    return structuredClone(updated);
  }

  list(): Tenant[] {
    return [...this.tenants.values()].map((tenant) => structuredClone(tenant));
  }
}

export class TenantIntegrationConfigRepository {
  private readonly configs = new Map<string, TenantIntegrationConfig>();

  upsert(config: TenantIntegrationConfig): TenantIntegrationConfig {
    this.configs.set(config.tenantId, structuredClone(config));
    return structuredClone(config);
  }

  get(tenantId: string): TenantIntegrationConfig {
    const config = this.configs.get(tenantId);
    if (!config) {
      throw new Error("Tenant integration configuration was not found.");
    }
    return structuredClone(config);
  }
}

export class TenantExecutionSettingsRepository {
  private readonly settings = new Map<string, TenantExecutionSettings>();

  upsert(settings: TenantExecutionSettings): TenantExecutionSettings {
    validateExecutionSettings(settings);
    this.settings.set(settings.tenantId, structuredClone(settings));
    return structuredClone(settings);
  }

  get(tenantId: string): TenantExecutionSettings {
    const settings = this.settings.get(tenantId);
    if (!settings) {
      throw new Error("Tenant execution settings were not found.");
    }
    return structuredClone(settings);
  }
}

export class TenantComponentRegistryRepository {
  private readonly registries = new Map<string, ComponentRegistryRepository>();

  seedTenant(tenantId: string, seed: ComponentRegistryEntry[] = mvpComponentRegistrySeed): void {
    if (!this.registries.has(tenantId)) {
      this.registries.set(tenantId, new ComponentRegistryRepository(seed));
    }
  }

  list(tenantId: string): ComponentRegistryEntry[] {
    return this.requireRegistry(tenantId).list();
  }

  get(tenantId: string, idOrSlug: string): ComponentRegistryEntry | null {
    return this.requireRegistry(tenantId).get(idOrSlug);
  }

  update(tenantId: string, idOrSlug: string, update: Partial<Pick<ComponentRegistryEntry, "enabled" | "riskLevel" | "requiresClientConfirmation" | "requiresTechApproval">>): ComponentRegistryEntry | null {
    return this.requireRegistry(tenantId).update(idOrSlug, update);
  }

  private requireRegistry(tenantId: string): ComponentRegistryRepository {
    const registry = this.registries.get(tenantId);
    if (!registry) {
      throw new Error("Tenant component registry was not found.");
    }
    return registry;
  }
}

export class TenantAuditLogRepository {
  private readonly events: TenantAuditEvent[] = [];

  record(event: Omit<TenantAuditEvent, "id" | "createdAt">, now = new Date()): TenantAuditEvent {
    const auditEvent: TenantAuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      createdAt: now.toISOString()
    };
    this.events.push(structuredClone(auditEvent));
    return structuredClone(auditEvent);
  }

  list(tenantId: string): TenantAuditEvent[] {
    return this.events
      .filter((event) => event.tenantId === tenantId)
      .map((event) => structuredClone(event));
  }
}

export class TenantRoleRepository {
  private readonly roles = new Map<string, TenantUserRole>();

  assign(role: TenantUserRole): TenantUserRole {
    this.roles.set(key(role.tenantId, role.userId), structuredClone(role));
    return structuredClone(role);
  }

  getRole(tenantId: string, userId: string): TenantRole | null {
    return this.roles.get(key(tenantId, userId))?.role ?? null;
  }

  requireRole(tenantId: string, userId: string, allowed: TenantRole[]): TenantRole {
    const role = this.getRole(tenantId, userId);
    if (!role || !allowed.includes(role)) {
      throw new Error("User does not have access to this tenant.");
    }
    return role;
  }
}

function validateExecutionSettings(settings: TenantExecutionSettings): void {
  if (!Number.isInteger(settings.maxRunsPerDevicePerDay) || settings.maxRunsPerDevicePerDay < 0) {
    throw new Error("maxRunsPerDevicePerDay must be a non-negative integer.");
  }
  if (settings.allowedAccounts.some((account) => settings.blockedAccounts.includes(account))) {
    throw new Error("An account cannot be both allowed and blocked for the same tenant.");
  }
}

function key(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}
