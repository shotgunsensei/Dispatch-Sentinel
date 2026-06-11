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
import type { EncryptedSecretValue, SecretEncryptionService } from "../security/encryption.js";

export interface TenantCreateInput {
  id?: string;
  name: string;
  slug: string;
  now?: Date;
}

export type MaybePromise<T> = T | Promise<T>;

export type TenantSecretName =
  | "bms_api_base_url"
  | "bms_api_username"
  | "bms_api_secret"
  | "bms_webhook_secret"
  | "datto_rmm_api_url"
  | "datto_rmm_api_key"
  | "datto_rmm_api_secret"
  | "approval_token_secret"
  | "component_callback_secret";

export const allowedTenantSecretNames: TenantSecretName[] = [
  "bms_api_base_url",
  "bms_api_username",
  "bms_api_secret",
  "bms_webhook_secret",
  "datto_rmm_api_url",
  "datto_rmm_api_key",
  "datto_rmm_api_secret",
  "approval_token_secret",
  "component_callback_secret"
];

export interface TenantSecretRecord extends EncryptedSecretValue {
  tenantId: string;
  secretName: TenantSecretName;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSecretStatus {
  secretName: TenantSecretName;
  configured: boolean;
  keyVersion: string | null;
  lastFour: string | null;
  updatedAt: string | null;
}

export interface TenantSettings {
  tenantId: string;
  executionMode: "dry_run" | "live";
  dattoExecutionEnabled: boolean;
  serverAutomationEnabled: boolean;
  maxRunsPerDevicePerDay: number;
  bmsDefaultQueue: string | null;
  bmsAutomationReviewQueue: string | null;
  bmsHumanReviewQueue: string | null;
  bmsSecurityQueue: string | null;
  bmsStatusAwaitingConfirmation: string | null;
  bmsStatusAutomationRunning: string | null;
  bmsStatusNeedsQa: string | null;
  bmsStatusEscalated: string | null;
  updatedAt: string;
}

export type IntegrationTestStatus = "passed" | "failed" | "skipped" | "dry_run";

export interface IntegrationTestRun {
  id: string;
  tenantId: string;
  testType: string;
  status: IntegrationTestStatus;
  message: string;
  durationMs: number;
  createdAt: string;
}

export interface TenantWebhookEvent {
  id: string;
  tenantId: string | null;
  eventType: string;
  source: "bms";
  status: "accepted" | "rejected" | "failed";
  reason: string | null;
  payloadSummary: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface TicketEvaluationRecord {
  id: string;
  tenantId: string;
  externalTicketId: string | null;
  title: string;
  detectedIntent: string;
  confidence: number;
  outcome: string;
  reasons: string[];
  matchedComponentId: string | null;
  createdAt: string;
}

export interface DryRunAutomationCandidate {
  id: string;
  tenantId: string;
  ticketEvaluationId: string;
  ticketId: string;
  componentId: string;
  outcome: string;
  status: "created";
  createdAt: string;
}

export interface TenantRepositoryLike {
  create(input: TenantCreateInput): MaybePromise<Tenant>;
  get(tenantId: string): MaybePromise<Tenant>;
  getAny(tenantId: string): MaybePromise<Tenant>;
  getBySlug(slug: string): MaybePromise<Tenant>;
  update(tenantId: string, input: Partial<Pick<Tenant, "name" | "slug">>, now?: Date): MaybePromise<Tenant>;
  disable(tenantId: string, now?: Date): MaybePromise<Tenant>;
  enable(tenantId: string, now?: Date): MaybePromise<Tenant>;
  list(): MaybePromise<Tenant[]>;
}

export interface TenantSecretRepositoryLike {
  upsert(tenantId: string, secretName: TenantSecretName, value: string, now?: Date): MaybePromise<TenantSecretRecord>;
  delete(tenantId: string, secretName: TenantSecretName): MaybePromise<boolean>;
  decrypt(tenantId: string, secretName: TenantSecretName): MaybePromise<string | null>;
  status(tenantId: string): MaybePromise<TenantSecretStatus[]>;
}

export interface TenantSettingsRepositoryLike {
  getOrCreate(tenantId: string, now?: Date): MaybePromise<TenantSettings>;
  update(tenantId: string, update: Partial<Omit<TenantSettings, "tenantId" | "updatedAt">>, now?: Date): MaybePromise<TenantSettings>;
}

export interface IntegrationTestRunRepositoryLike {
  record(run: Omit<IntegrationTestRun, "id" | "createdAt">, now?: Date): MaybePromise<IntegrationTestRun>;
  list(tenantId: string): MaybePromise<IntegrationTestRun[]>;
}

export interface TenantWebhookEventRepositoryLike {
  record(event: Omit<TenantWebhookEvent, "id" | "createdAt">, now?: Date): MaybePromise<TenantWebhookEvent>;
  list(tenantId?: string): MaybePromise<TenantWebhookEvent[]>;
}

export interface TicketEvaluationRepositoryLike {
  record(evaluation: Omit<TicketEvaluationRecord, "id" | "createdAt">, now?: Date): MaybePromise<TicketEvaluationRecord>;
  list(tenantId?: string): MaybePromise<TicketEvaluationRecord[]>;
}

export interface DryRunAutomationCandidateRepositoryLike {
  record(candidate: Omit<DryRunAutomationCandidate, "id" | "createdAt">, now?: Date): MaybePromise<DryRunAutomationCandidate>;
  list(tenantId?: string): MaybePromise<DryRunAutomationCandidate[]>;
}

export interface TenantAuditLogRepositoryLike {
  record(event: Omit<TenantAuditEvent, "id" | "createdAt">, now?: Date): MaybePromise<TenantAuditEvent>;
  list(tenantId: string): MaybePromise<TenantAuditEvent[]>;
}

export class TenantRepository {
  private readonly tenants = new Map<string, Tenant>();

  create(input: TenantCreateInput): Tenant {
    const slug = normalizeSlug(input.slug);
    const id = input.id ?? `tenant-${slug}`;
    if (this.tenants.has(id) || [...this.tenants.values()].some((tenant) => tenant.slug === slug)) {
      throw new Error("Tenant already exists.");
    }
    const now = (input.now ?? new Date()).toISOString();
    const tenant: Tenant = {
      id,
      name: validateTenantName(input.name),
      slug,
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

  getAny(tenantId: string): Tenant {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found.");
    }
    return structuredClone(tenant);
  }

  getBySlug(slug: string): Tenant {
    const normalized = normalizeSlug(slug);
    const tenant = [...this.tenants.values()].find((candidate) => candidate.slug === normalized);
    if (!tenant) {
      throw new Error("Tenant not found.");
    }
    return structuredClone(tenant);
  }

  update(tenantId: string, input: Partial<Pick<Tenant, "name" | "slug">>, now = new Date()): Tenant {
    const tenant = this.getAny(tenantId);
    const updated: Tenant = {
      ...tenant,
      name: input.name === undefined ? tenant.name : validateTenantName(input.name),
      slug: input.slug === undefined ? tenant.slug : normalizeSlug(input.slug),
      updatedAt: now.toISOString()
    };
    if ([...this.tenants.values()].some((candidate) => candidate.id !== tenantId && candidate.slug === updated.slug)) {
      throw new Error("Tenant slug already exists.");
    }
    this.tenants.set(tenantId, structuredClone(updated));
    return structuredClone(updated);
  }

  disable(tenantId: string, now = new Date()): Tenant {
    const tenant = this.getAny(tenantId);
    const updated = { ...tenant, status: "disabled" as const, updatedAt: now.toISOString() };
    this.tenants.set(tenantId, structuredClone(updated));
    return structuredClone(updated);
  }

  enable(tenantId: string, now = new Date()): Tenant {
    const tenant = this.getAny(tenantId);
    const updated = { ...tenant, status: "active" as const, updatedAt: now.toISOString() };
    this.tenants.set(tenantId, structuredClone(updated));
    return structuredClone(updated);
  }

  list(): Tenant[] {
    return [...this.tenants.values()].map((tenant) => structuredClone(tenant));
  }
}

export class TenantSecretRepository {
  private readonly secrets = new Map<string, TenantSecretRecord>();

  constructor(private readonly encryption: SecretEncryptionService) {}

  upsert(tenantId: string, secretName: TenantSecretName, value: string, now = new Date()): TenantSecretRecord {
    assertAllowedSecret(secretName);
    if (!value.trim()) {
      throw new Error("Secret value is required.");
    }
    const existing = this.secrets.get(secretKey(tenantId, secretName));
    const timestamp = now.toISOString();
    const encrypted = this.encryption.encrypt(value);
    const record: TenantSecretRecord = {
      tenantId,
      secretName,
      ...encrypted,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
    this.secrets.set(secretKey(tenantId, secretName), structuredClone(record));
    return structuredClone(record);
  }

  delete(tenantId: string, secretName: TenantSecretName): boolean {
    assertAllowedSecret(secretName);
    return this.secrets.delete(secretKey(tenantId, secretName));
  }

  decrypt(tenantId: string, secretName: TenantSecretName): string | null {
    const secret = this.secrets.get(secretKey(tenantId, secretName));
    return secret ? this.encryption.decrypt(secret) : null;
  }

  status(tenantId: string): TenantSecretStatus[] {
    return allowedTenantSecretNames.map((secretName) => {
      const secret = this.secrets.get(secretKey(tenantId, secretName));
      return {
        secretName,
        configured: Boolean(secret),
        keyVersion: secret?.keyVersion ?? null,
        lastFour: secret?.lastFour ?? null,
        updatedAt: secret?.updatedAt ?? null
      };
    });
  }
}

export class TenantSettingsRepository {
  private readonly settings = new Map<string, TenantSettings>();

  getOrCreate(tenantId: string, now = new Date()): TenantSettings {
    const existing = this.settings.get(tenantId);
    if (existing) {
      return structuredClone(existing);
    }
    const created = defaultTenantSettings(tenantId, now);
    this.settings.set(tenantId, structuredClone(created));
    return structuredClone(created);
  }

  update(tenantId: string, update: Partial<Omit<TenantSettings, "tenantId" | "updatedAt">>, now = new Date()): TenantSettings {
    const current = this.getOrCreate(tenantId, now);
    const next: TenantSettings = {
      ...current,
      ...update,
      serverAutomationEnabled: update.serverAutomationEnabled ?? current.serverAutomationEnabled,
      updatedAt: now.toISOString()
    };
    validateTenantSettings(next);
    this.settings.set(tenantId, structuredClone(next));
    return structuredClone(next);
  }
}

export class IntegrationTestRunRepository {
  private readonly runs: IntegrationTestRun[] = [];

  record(run: Omit<IntegrationTestRun, "id" | "createdAt">, now = new Date()): IntegrationTestRun {
    const created: IntegrationTestRun = {
      ...run,
      id: crypto.randomUUID(),
      createdAt: now.toISOString()
    };
    this.runs.push(structuredClone(created));
    return structuredClone(created);
  }

  list(tenantId: string): IntegrationTestRun[] {
    return this.runs.filter((run) => run.tenantId === tenantId).map((run) => structuredClone(run));
  }
}

export class TenantWebhookEventRepository {
  private readonly events: TenantWebhookEvent[] = [];

  record(event: Omit<TenantWebhookEvent, "id" | "createdAt">, now = new Date()): TenantWebhookEvent {
    const created = { ...event, id: crypto.randomUUID(), createdAt: now.toISOString() };
    this.events.push(structuredClone(created));
    return structuredClone(created);
  }

  list(tenantId?: string): TenantWebhookEvent[] {
    return this.events
      .filter((event) => !tenantId || event.tenantId === tenantId)
      .map((event) => structuredClone(event));
  }
}

export class TicketEvaluationRepository {
  private readonly evaluations: TicketEvaluationRecord[] = [];

  record(evaluation: Omit<TicketEvaluationRecord, "id" | "createdAt">, now = new Date()): TicketEvaluationRecord {
    const created = { ...evaluation, id: crypto.randomUUID(), createdAt: now.toISOString() };
    this.evaluations.push(structuredClone(created));
    return structuredClone(created);
  }

  list(tenantId?: string): TicketEvaluationRecord[] {
    return this.evaluations
      .filter((evaluation) => !tenantId || evaluation.tenantId === tenantId)
      .map((evaluation) => structuredClone(evaluation));
  }
}

export class DryRunAutomationCandidateRepository {
  private readonly candidates: DryRunAutomationCandidate[] = [];

  record(candidate: Omit<DryRunAutomationCandidate, "id" | "createdAt">, now = new Date()): DryRunAutomationCandidate {
    const created = { ...candidate, id: crypto.randomUUID(), createdAt: now.toISOString() };
    this.candidates.push(structuredClone(created));
    return structuredClone(created);
  }

  list(tenantId?: string): DryRunAutomationCandidate[] {
    return this.candidates
      .filter((candidate) => !tenantId || candidate.tenantId === tenantId)
      .map((candidate) => structuredClone(candidate));
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

function validateTenantName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    throw new Error("Tenant name is required.");
  }
  return trimmed;
}

export function normalizeSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(normalized)) {
    throw new Error("Tenant slug must be 3-64 characters using lowercase letters, numbers, and dashes.");
  }
  return normalized;
}

function assertAllowedSecret(secretName: string): asserts secretName is TenantSecretName {
  if (!allowedTenantSecretNames.includes(secretName as TenantSecretName)) {
    throw new Error("Secret name is not allowed.");
  }
}

function secretKey(tenantId: string, secretName: TenantSecretName): string {
  return `${tenantId}:${secretName}`;
}

function defaultTenantSettings(tenantId: string, now: Date): TenantSettings {
  return {
    tenantId,
    executionMode: "dry_run",
    dattoExecutionEnabled: false,
    serverAutomationEnabled: false,
    maxRunsPerDevicePerDay: 2,
    bmsDefaultQueue: null,
    bmsAutomationReviewQueue: "Automation Review",
    bmsHumanReviewQueue: "Human Review",
    bmsSecurityQueue: "Security",
    bmsStatusAwaitingConfirmation: "Awaiting Client Confirmation",
    bmsStatusAutomationRunning: "Automation Running",
    bmsStatusNeedsQa: "Needs QA",
    bmsStatusEscalated: "Escalated",
    updatedAt: now.toISOString()
  };
}

function validateTenantSettings(settings: TenantSettings): void {
  if (settings.executionMode !== "dry_run" && settings.executionMode !== "live") {
    throw new Error("executionMode must be dry_run or live.");
  }
  if (settings.serverAutomationEnabled) {
    throw new Error("Server automation must remain disabled for this phase.");
  }
  if (!Number.isInteger(settings.maxRunsPerDevicePerDay) || settings.maxRunsPerDevicePerDay < 0) {
    throw new Error("maxRunsPerDevicePerDay must be a non-negative integer.");
  }
}

function key(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}
