import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Tenant, TenantAuditEvent } from "@dispatch-sentinel/shared";
import { mvpComponentRegistrySeed } from "../component-registry/registry.js";
import type { EncryptedSecretValue, SecretEncryptionService } from "../security/encryption.js";
import {
  allowedTenantSecretNames,
  normalizeSlug,
  type DryRunAutomationCandidate,
  type DryRunAutomationCandidateRepositoryLike,
  type IntegrationTestRun,
  type IntegrationTestRunRepositoryLike,
  type TenantCreateInput,
  type TenantRepositoryLike,
  type TenantSecretName,
  type TenantSecretRecord,
  type TenantSecretRepositoryLike,
  type TenantSecretStatus,
  type TenantSettings,
  type TenantSettingsRepositoryLike,
  type TenantWebhookEvent,
  type TenantWebhookEventRepositoryLike,
  type TicketEvaluationRecord,
  type TicketEvaluationRepositoryLike,
  type TenantAuditLogRepositoryLike
} from "./tenant-store.js";

const { Pool } = pg;

export function createPostgresPool(databaseUrl: string): pg.Pool {
  return new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=require") || databaseUrl.includes(".neon.tech")
      ? { rejectUnauthorized: false }
      : undefined
  });
}

export class PostgresTenantRepository implements TenantRepositoryLike {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: TenantCreateInput): Promise<Tenant> {
    const slug = normalizeSlug(input.slug);
    const id = input.id ?? `tenant-${slug}`;
    const now = input.now ?? new Date();
    const name = validateTenantName(input.name);
    try {
      const result = await this.pool.query(
        `INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', $4, $4)
         RETURNING id, name, slug, status, created_at, updated_at`,
        [id, name, slug, now]
      );
      return mapTenant(result.rows[0]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error("Tenant already exists.");
      }
      throw error;
    }
  }

  async get(tenantId: string): Promise<Tenant> {
    const tenant = await this.getAny(tenantId);
    if (tenant.status !== "active") {
      throw new Error("Tenant not found or disabled.");
    }
    return tenant;
  }

  async getAny(tenantId: string): Promise<Tenant> {
    const result = await this.pool.query(
      "SELECT id, name, slug, status, created_at, updated_at FROM tenants WHERE id = $1",
      [tenantId]
    );
    if (!result.rows[0]) {
      throw new Error("Tenant not found.");
    }
    return mapTenant(result.rows[0]);
  }

  async getBySlug(slug: string): Promise<Tenant> {
    const result = await this.pool.query(
      "SELECT id, name, slug, status, created_at, updated_at FROM tenants WHERE slug = $1",
      [normalizeSlug(slug)]
    );
    if (!result.rows[0]) {
      throw new Error("Tenant not found.");
    }
    return mapTenant(result.rows[0]);
  }

  async update(tenantId: string, input: Partial<Pick<Tenant, "name" | "slug">>, now = new Date()): Promise<Tenant> {
    const current = await this.getAny(tenantId);
    const nextName = input.name === undefined ? current.name : validateTenantName(input.name);
    const nextSlug = input.slug === undefined ? current.slug : normalizeSlug(input.slug);
    try {
      const result = await this.pool.query(
        `UPDATE tenants
         SET name = $2, slug = $3, updated_at = $4
         WHERE id = $1
         RETURNING id, name, slug, status, created_at, updated_at`,
        [tenantId, nextName, nextSlug, now]
      );
      if (!result.rows[0]) {
        throw new Error("Tenant not found.");
      }
      return mapTenant(result.rows[0]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error("Tenant slug already exists.");
      }
      throw error;
    }
  }

  async disable(tenantId: string, now = new Date()): Promise<Tenant> {
    const result = await this.pool.query(
      `UPDATE tenants
       SET status = 'disabled', updated_at = $2
       WHERE id = $1
       RETURNING id, name, slug, status, created_at, updated_at`,
      [tenantId, now]
    );
    if (!result.rows[0]) {
      throw new Error("Tenant not found.");
    }
    return mapTenant(result.rows[0]);
  }

  async enable(tenantId: string, now = new Date()): Promise<Tenant> {
    const result = await this.pool.query(
      `UPDATE tenants
       SET status = 'active', updated_at = $2
       WHERE id = $1
       RETURNING id, name, slug, status, created_at, updated_at`,
      [tenantId, now]
    );
    if (!result.rows[0]) {
      throw new Error("Tenant not found.");
    }
    return mapTenant(result.rows[0]);
  }

  async list(): Promise<Tenant[]> {
    const result = await this.pool.query(
      "SELECT id, name, slug, status, created_at, updated_at FROM tenants ORDER BY created_at DESC"
    );
    return result.rows.map(mapTenant);
  }
}

export class PostgresTenantSecretRepository implements TenantSecretRepositoryLike {
  constructor(
    private readonly pool: pg.Pool,
    private readonly encryption: SecretEncryptionService
  ) {}

  async upsert(tenantId: string, secretName: TenantSecretName, value: string, now = new Date()): Promise<TenantSecretRecord> {
    assertAllowedSecret(secretName);
    if (!value.trim()) {
      throw new Error("Secret value is required.");
    }
    const encrypted = this.encryption.encrypt(value);
    const result = await this.pool.query(
      `INSERT INTO tenant_secrets (id, tenant_id, secret_name, encrypted_value, iv, auth_tag, key_version, last_four, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       ON CONFLICT (tenant_id, secret_name)
       DO UPDATE SET
         encrypted_value = EXCLUDED.encrypted_value,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         key_version = EXCLUDED.key_version,
         last_four = EXCLUDED.last_four,
         updated_at = EXCLUDED.updated_at
       RETURNING tenant_id, secret_name, encrypted_value, iv, auth_tag, key_version, last_four, created_at, updated_at`,
      [randomUUID(), tenantId, secretName, encrypted.encryptedValue, encrypted.iv, encrypted.authTag, encrypted.keyVersion, encrypted.lastFour, now]
    );
    return mapTenantSecret(result.rows[0]);
  }

  async delete(tenantId: string, secretName: TenantSecretName): Promise<boolean> {
    assertAllowedSecret(secretName);
    const result = await this.pool.query(
      "DELETE FROM tenant_secrets WHERE tenant_id = $1 AND secret_name = $2",
      [tenantId, secretName]
    );
    return Number(result.rowCount) > 0;
  }

  async decrypt(tenantId: string, secretName: TenantSecretName): Promise<string | null> {
    const secret = await this.getSecret(tenantId, secretName);
    return secret ? this.encryption.decrypt(secret) : null;
  }

  async status(tenantId: string): Promise<TenantSecretStatus[]> {
    const result = await this.pool.query(
      "SELECT secret_name, key_version, last_four, updated_at FROM tenant_secrets WHERE tenant_id = $1",
      [tenantId]
    );
    const rows = new Map<string, pg.QueryResultRow>(result.rows.map((row) => [String(row.secret_name), row]));
    return allowedTenantSecretNames.map((secretName) => {
      const row = rows.get(secretName);
      return {
        secretName,
        configured: Boolean(row),
        keyVersion: row ? String(row.key_version) : null,
        lastFour: row?.last_four === null || row?.last_four === undefined ? null : String(row.last_four),
        updatedAt: row ? toIso(row.updated_at) : null
      };
    });
  }

  private async getSecret(tenantId: string, secretName: TenantSecretName): Promise<EncryptedSecretValue | null> {
    assertAllowedSecret(secretName);
    const result = await this.pool.query(
      `SELECT encrypted_value, iv, auth_tag, key_version, last_four
       FROM tenant_secrets
       WHERE tenant_id = $1 AND secret_name = $2`,
      [tenantId, secretName]
    );
    const row = result.rows[0];
    return row ? {
      encryptedValue: String(row.encrypted_value),
      iv: String(row.iv),
      authTag: String(row.auth_tag),
      keyVersion: String(row.key_version),
      lastFour: row.last_four === null ? null : String(row.last_four)
    } : null;
  }
}

export class PostgresTenantSettingsRepository implements TenantSettingsRepositoryLike {
  constructor(private readonly pool: pg.Pool) {}

  async getOrCreate(tenantId: string, now = new Date()): Promise<TenantSettings> {
    const existing = await this.get(tenantId);
    if (existing) {
      return existing;
    }
    const result = await this.pool.query(
      `INSERT INTO tenant_settings (tenant_id, created_at, updated_at)
       VALUES ($1, $2, $2)
       ON CONFLICT (tenant_id) DO NOTHING
       RETURNING *`,
      [tenantId, now]
    );
    if (result.rows[0]) {
      return mapTenantSettings(result.rows[0]);
    }
    const created = await this.get(tenantId);
    if (!created) {
      throw new Error("Tenant settings could not be created.");
    }
    return created;
  }

  async update(tenantId: string, update: Partial<Omit<TenantSettings, "tenantId" | "updatedAt">>, now = new Date()): Promise<TenantSettings> {
    const current = await this.getOrCreate(tenantId, now);
    const next = validateTenantSettings({ ...current, ...update, updatedAt: now.toISOString() });
    const result = await this.pool.query(
      `UPDATE tenant_settings SET
         execution_mode = $2,
         datto_execution_enabled = $3,
         server_automation_enabled = $4,
         max_runs_per_device_per_day = $5,
         bms_default_queue = $6,
         bms_automation_review_queue = $7,
         bms_human_review_queue = $8,
         bms_security_queue = $9,
         bms_status_awaiting_confirmation = $10,
         bms_status_automation_running = $11,
         bms_status_needs_qa = $12,
         bms_status_escalated = $13,
         updated_at = $14
       WHERE tenant_id = $1
       RETURNING *`,
      [
        tenantId,
        next.executionMode,
        next.dattoExecutionEnabled,
        next.serverAutomationEnabled,
        next.maxRunsPerDevicePerDay,
        next.bmsDefaultQueue,
        next.bmsAutomationReviewQueue,
        next.bmsHumanReviewQueue,
        next.bmsSecurityQueue,
        next.bmsStatusAwaitingConfirmation,
        next.bmsStatusAutomationRunning,
        next.bmsStatusNeedsQa,
        next.bmsStatusEscalated,
        now
      ]
    );
    return mapTenantSettings(result.rows[0]);
  }

  private async get(tenantId: string): Promise<TenantSettings | null> {
    const result = await this.pool.query("SELECT * FROM tenant_settings WHERE tenant_id = $1", [tenantId]);
    return result.rows[0] ? mapTenantSettings(result.rows[0]) : null;
  }
}

export class PostgresIntegrationTestRunRepository implements IntegrationTestRunRepositoryLike {
  constructor(private readonly pool: pg.Pool) {}

  async record(run: Omit<IntegrationTestRun, "id" | "createdAt">, now = new Date()): Promise<IntegrationTestRun> {
    const result = await this.pool.query(
      `INSERT INTO integration_test_runs (id, tenant_id, test_type, status, message, duration_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, tenant_id, test_type, status, message, duration_ms, created_at`,
      [randomUUID(), run.tenantId, run.testType, run.status, run.message, run.durationMs, now]
    );
    return mapIntegrationTestRun(result.rows[0]);
  }

  async list(tenantId: string): Promise<IntegrationTestRun[]> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, test_type, status, message, duration_ms, created_at
       FROM integration_test_runs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [tenantId]
    );
    return result.rows.map(mapIntegrationTestRun);
  }
}

export class PostgresTenantWebhookEventRepository implements TenantWebhookEventRepositoryLike {
  constructor(private readonly pool: pg.Pool) {}

  async record(event: Omit<TenantWebhookEvent, "id" | "createdAt">, now = new Date()): Promise<TenantWebhookEvent> {
    const result = await this.pool.query(
      `INSERT INTO webhook_events (id, tenant_id, event_type, source, status, reason, payload_summary, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, tenant_id, event_type, source, status, reason, payload_summary, created_at`,
      [randomUUID(), event.tenantId, event.eventType, event.source, event.status, event.reason, JSON.stringify(event.payloadSummary), now]
    );
    return mapTenantWebhookEvent(result.rows[0]);
  }

  async list(tenantId?: string): Promise<TenantWebhookEvent[]> {
    const result = tenantId
      ? await this.pool.query(
        `SELECT id, tenant_id, event_type, source, status, reason, payload_summary, created_at
         FROM webhook_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [tenantId]
      )
      : await this.pool.query(
        `SELECT id, tenant_id, event_type, source, status, reason, payload_summary, created_at
         FROM webhook_events ORDER BY created_at DESC LIMIT 50`
      );
    return result.rows.map(mapTenantWebhookEvent);
  }
}

export class PostgresTicketEvaluationRepository implements TicketEvaluationRepositoryLike {
  private seedPromise: Promise<void> | null = null;

  constructor(private readonly pool: pg.Pool) {}

  async record(evaluation: Omit<TicketEvaluationRecord, "id" | "createdAt">, now = new Date()): Promise<TicketEvaluationRecord> {
    await this.ensureComponentRegistrySeeded();
    const result = await this.pool.query(
      `INSERT INTO ticket_evaluations (id, tenant_id, external_ticket_id, title, detected_intent, confidence, outcome, reasons, matched_component_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, tenant_id, external_ticket_id, title, detected_intent, confidence, outcome, reasons, matched_component_id, created_at`,
      [
        randomUUID(),
        evaluation.tenantId,
        evaluation.externalTicketId,
        evaluation.title,
        evaluation.detectedIntent,
        evaluation.confidence,
        evaluation.outcome,
        JSON.stringify(evaluation.reasons),
        evaluation.matchedComponentId,
        now
      ]
    );
    return mapTicketEvaluation(result.rows[0]);
  }

  async list(tenantId?: string): Promise<TicketEvaluationRecord[]> {
    const result = tenantId
      ? await this.pool.query(
        `SELECT id, tenant_id, external_ticket_id, title, detected_intent, confidence, outcome, reasons, matched_component_id, created_at
         FROM ticket_evaluations WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [tenantId]
      )
      : await this.pool.query(
        `SELECT id, tenant_id, external_ticket_id, title, detected_intent, confidence, outcome, reasons, matched_component_id, created_at
         FROM ticket_evaluations ORDER BY created_at DESC LIMIT 50`
      );
    return result.rows.map(mapTicketEvaluation);
  }

  private async ensureComponentRegistrySeeded(): Promise<void> {
    this.seedPromise ??= Promise.all(mvpComponentRegistrySeed.map((component) => this.pool.query(
      `INSERT INTO component_registry (
         id,
         tenant_id,
         name,
         slug,
         description,
         datto_component_uid,
         category,
         allowed_intents,
         allowed_asset_types,
         risk_level,
         requires_client_confirmation,
         requires_tech_approval,
         enabled,
         max_runs_per_device_per_day,
         created_at,
         updated_at
       )
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO NOTHING`,
      [
        component.id,
        component.name,
        component.slug,
        component.description,
        component.dattoComponentUid,
        component.category,
        JSON.stringify(component.allowedIntents),
        JSON.stringify(component.allowedAssetTypes),
        component.riskLevel,
        component.requiresClientConfirmation,
        component.requiresTechApproval,
        component.enabled,
        component.maxRunsPerDevicePerDay,
        component.createdAt,
        component.updatedAt
      ]
    ))).then(() => undefined);
    await this.seedPromise;
  }
}

export class PostgresDryRunAutomationCandidateRepository implements DryRunAutomationCandidateRepositoryLike {
  constructor(private readonly pool: pg.Pool) {}

  async record(candidate: Omit<DryRunAutomationCandidate, "id" | "createdAt">, now = new Date()): Promise<DryRunAutomationCandidate> {
    const result = await this.pool.query(
      `INSERT INTO dry_run_automation_candidates (id, tenant_id, ticket_evaluation_id, ticket_id, component_id, outcome, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, tenant_id, ticket_evaluation_id, ticket_id, component_id, outcome, status, created_at`,
      [randomUUID(), candidate.tenantId, candidate.ticketEvaluationId, candidate.ticketId, candidate.componentId, candidate.outcome, candidate.status, now]
    );
    return mapDryRunCandidate(result.rows[0]);
  }

  async list(tenantId?: string): Promise<DryRunAutomationCandidate[]> {
    const result = tenantId
      ? await this.pool.query(
        `SELECT id, tenant_id, ticket_evaluation_id, ticket_id, component_id, outcome, status, created_at
         FROM dry_run_automation_candidates WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [tenantId]
      )
      : await this.pool.query(
        `SELECT id, tenant_id, ticket_evaluation_id, ticket_id, component_id, outcome, status, created_at
         FROM dry_run_automation_candidates ORDER BY created_at DESC LIMIT 50`
      );
    return result.rows.map(mapDryRunCandidate);
  }
}

export class PostgresTenantAuditLogRepository implements TenantAuditLogRepositoryLike {
  constructor(private readonly pool: pg.Pool) {}

  async record(event: Omit<TenantAuditEvent, "id" | "createdAt">, now = new Date()): Promise<TenantAuditEvent> {
    const actor = event.type.startsWith("tenant.bms.webhook") ? "webhook" : event.type.startsWith("tenant.") ? "admin" : "system";
    const result = await this.pool.query(
      `INSERT INTO audit_events (id, tenant_id, actor, action, status, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, tenant_id, actor, action, status, details, created_at`,
      [randomUUID(), event.tenantId, actor, event.type, event.outcome, JSON.stringify({ ...event.metadata, ticketId: event.ticketId, deviceUid: event.deviceUid, componentId: event.componentId }), now]
    );
    return mapTenantAuditEvent(result.rows[0]);
  }

  async list(tenantId: string): Promise<TenantAuditEvent[]> {
    const result = await this.pool.query(
      "SELECT id, tenant_id, actor, action, status, details, created_at FROM audit_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100",
      [tenantId]
    );
    return result.rows.map(mapTenantAuditEvent);
  }
}

function mapTenant(row: pg.QueryResultRow): Tenant {
  const status = String(row.status) === "active" ? "active" : "disabled";
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapTenantSecret(row: pg.QueryResultRow): TenantSecretRecord {
  return {
    tenantId: String(row.tenant_id),
    secretName: String(row.secret_name) as TenantSecretName,
    encryptedValue: String(row.encrypted_value),
    iv: String(row.iv),
    authTag: String(row.auth_tag),
    keyVersion: String(row.key_version),
    lastFour: row.last_four === null ? null : String(row.last_four),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapTenantSettings(row: pg.QueryResultRow): TenantSettings {
  return {
    tenantId: String(row.tenant_id),
    executionMode: row.execution_mode === "live" ? "live" : "dry_run",
    dattoExecutionEnabled: Boolean(row.datto_execution_enabled),
    serverAutomationEnabled: Boolean(row.server_automation_enabled),
    maxRunsPerDevicePerDay: Number(row.max_runs_per_device_per_day),
    bmsDefaultQueue: nullableString(row.bms_default_queue),
    bmsAutomationReviewQueue: nullableString(row.bms_automation_review_queue),
    bmsHumanReviewQueue: nullableString(row.bms_human_review_queue),
    bmsSecurityQueue: nullableString(row.bms_security_queue),
    bmsStatusAwaitingConfirmation: nullableString(row.bms_status_awaiting_confirmation),
    bmsStatusAutomationRunning: nullableString(row.bms_status_automation_running),
    bmsStatusNeedsQa: nullableString(row.bms_status_needs_qa),
    bmsStatusEscalated: nullableString(row.bms_status_escalated),
    updatedAt: toIso(row.updated_at)
  };
}

function mapIntegrationTestRun(row: pg.QueryResultRow): IntegrationTestRun {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    testType: String(row.test_type),
    status: String(row.status) as IntegrationTestRun["status"],
    message: String(row.message),
    durationMs: Number(row.duration_ms),
    createdAt: toIso(row.created_at)
  };
}

function mapTenantWebhookEvent(row: pg.QueryResultRow): TenantWebhookEvent {
  return {
    id: String(row.id),
    tenantId: row.tenant_id === null ? null : String(row.tenant_id),
    eventType: String(row.event_type),
    source: "bms",
    status: String(row.status) as TenantWebhookEvent["status"],
    reason: nullableString(row.reason),
    payloadSummary: parseJsonRecord(row.payload_summary),
    createdAt: toIso(row.created_at)
  };
}

function mapTicketEvaluation(row: pg.QueryResultRow): TicketEvaluationRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    externalTicketId: nullableString(row.external_ticket_id),
    title: String(row.title),
    detectedIntent: String(row.detected_intent),
    confidence: Number(row.confidence),
    outcome: String(row.outcome),
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    matchedComponentId: nullableString(row.matched_component_id),
    createdAt: toIso(row.created_at)
  };
}

function mapDryRunCandidate(row: pg.QueryResultRow): DryRunAutomationCandidate {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    ticketEvaluationId: String(row.ticket_evaluation_id),
    ticketId: String(row.ticket_id),
    componentId: String(row.component_id),
    outcome: String(row.outcome),
    status: "created",
    createdAt: toIso(row.created_at)
  };
}

function mapTenantAuditEvent(row: pg.QueryResultRow): TenantAuditEvent {
  const details = parseJsonRecord(row.details);
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    type: String(row.action),
    ticketId: nullableString(details.ticketId),
    deviceUid: nullableString(details.deviceUid),
    componentId: nullableString(details.componentId),
    outcome: String(row.status) as TenantAuditEvent["outcome"],
    metadata: stripAuditIdentity(details),
    createdAt: toIso(row.created_at)
  };
}

function validateTenantName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    throw new Error("Tenant name is required.");
  }
  return trimmed;
}

function validateTenantSettings(settings: TenantSettings): TenantSettings {
  if (settings.executionMode !== "dry_run" && settings.executionMode !== "live") {
    throw new Error("executionMode must be dry_run or live.");
  }
  if (settings.serverAutomationEnabled) {
    throw new Error("Server automation must remain disabled for this phase.");
  }
  if (!Number.isInteger(settings.maxRunsPerDevicePerDay) || settings.maxRunsPerDevicePerDay < 0) {
    throw new Error("maxRunsPerDevicePerDay must be a non-negative integer.");
  }
  return settings;
}

function assertAllowedSecret(secretName: string): asserts secretName is TenantSecretName {
  if (!allowedTenantSecretNames.includes(secretName as TenantSecretName)) {
    throw new Error("Secret name is not allowed.");
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function parseJsonRecord(value: unknown): Record<string, string | number | boolean | null> {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const record: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null) {
      record[key] = entry;
    }
  }
  return record;
}

function stripAuditIdentity(details: Record<string, string | number | boolean | null>): Record<string, string | number | boolean | null> {
  const { ticketId: _ticketId, deviceUid: _deviceUid, componentId: _componentId, ...metadata } = details;
  return metadata;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}
