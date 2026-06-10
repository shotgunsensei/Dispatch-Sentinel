import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ApprovalRequest } from "@dispatch-sentinel/shared";
import type { ApiConfig, ConfigValidationResult } from "./config.js";
import { loadConfig, validateApprovalConfig, validateDattoConfig, validateWebhookConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { createLogger } from "./logger.js";
import { InMemoryAuditSink } from "./modules/audit/audit-sink.js";
import { AdminAuthService, type AdminPermission } from "./modules/admin/auth.js";
import { AdminDashboardService, AdminSafetySettingsRepository, toCsv, type AdminSafetySettingsUpdate } from "./modules/admin/dashboard.js";
import { InMemoryRateLimiter } from "./modules/admin/rate-limit.js";
import { ApprovalRequestRepository, ApprovalService } from "./modules/approvals/approval-service.js";
import { MockDattoDeviceAdapter } from "./modules/assets/mock-datto-device-adapter.js";
import { MockBmsAdapter } from "./modules/bms/mock-bms-adapter.js";
import { BmsWorkflowService, createBmsWorkflowConfig } from "./modules/bms/workflow.js";
import { ComponentRegistryRepository, type ComponentRegistryUpdate } from "./modules/component-registry/registry.js";
import { AutomationRunRepository } from "./modules/automation/automation-runner.js";
import { AutomationJobPoller, createAutomationJobPollingWorker } from "./modules/automation/job-poller.js";
import { AutomationResultHandler, validateResultPayload } from "./modules/automation/result-handler.js";
import { DryRunDattoRmmAdapter } from "./modules/datto-rmm/dry-run-adapter.js";
import { RealDattoRmmAdapter } from "./modules/datto-rmm/real-adapter.js";
import { TicketIntakeService } from "./modules/tickets/intake-service.js";
import { SecretEncryptionService } from "./modules/security/encryption.js";
import {
  IntegrationTestRunRepository,
  TenantAuditLogRepository,
  TenantRepository,
  TenantSecretRepository,
  TenantSettingsRepository,
  allowedTenantSecretNames,
  type IntegrationTestRun,
  type TenantSecretName,
  type TenantSettings
} from "./modules/tenants/tenant-store.js";

export interface HealthResponse {
  status: "ok";
  service: "dispatch-sentinel-api";
  phase: "12";
  checks: {
    api: "ok";
    database: "ok" | "not_configured";
    queue: "ok" | "degraded";
    bmsAdapter: "ok";
    dattoRmmAdapter: "ok" | "dry_run";
  };
}

export interface PublicHealthResponse {
  ok: true;
  service: "dispatch-sentinel-api";
  environment: string;
  encryptionConfigured: boolean;
  adminAuthConfigured: boolean;
  dattoExecutionGloballyEnabled: boolean;
  config: {
    bmsWebhookConfigured: boolean;
    dattoExecutionEnabled: boolean;
    encryptionConfigured: boolean;
    adminAuthConfigured: boolean;
    dattoExecutionGloballyEnabled: boolean;
  };
}

export interface RootResponse {
  ok: true;
  service: "dispatch-sentinel-api";
  name: "Dispatch Sentinel";
  phase: "12";
  routes: {
    health: "/health";
    bmsWebhook: "/api/webhooks/bms";
  };
}

export interface ApiDependencies {
  auditSink: InMemoryAuditSink;
  ticketIntakeService: TicketIntakeService;
  componentRegistry: ComponentRegistryRepository;
  approvalService: ApprovalService;
  automationRunRepository: AutomationRunRepository;
  automationResultHandler: AutomationResultHandler;
  automationJobPoller?: AutomationJobPoller;
  adminDashboardService: AdminDashboardService;
  safetySettingsRepository: AdminSafetySettingsRepository;
  bmsWorkflow: BmsWorkflowService;
  adminAuthService: AdminAuthService;
  rateLimiter: InMemoryRateLimiter;
  tenantRepository: TenantRepository;
  tenantSecretRepository: TenantSecretRepository;
  tenantSettingsRepository: TenantSettingsRepository;
  tenantAuditLog: TenantAuditLogRepository;
  integrationTestRuns: IntegrationTestRunRepository;
  encryptionService: SecretEncryptionService;
}

export interface BmsWebhookPayload {
  eventType: "ticket.created" | "ticket.updated";
  ticketId: string;
}

export interface DispatchSentinelApp {
  (request: IncomingMessage, response: ServerResponse): void;
  config: ApiConfig;
  logger: Logger;
  dependencies: ApiDependencies;
  listen(port?: number, host?: string, callback?: () => void): Server;
}

export function createDefaultDependencies(logger: Logger, config: ApiConfig): ApiDependencies {
  const auditSink = new InMemoryAuditSink(logger);
  const bmsAdapter = new MockBmsAdapter();
  const componentRegistry = new ComponentRegistryRepository();
  const approvalRepository = new ApprovalRequestRepository();
  const automationRunRepository = new AutomationRunRepository();
  const ticketIntakeService = new TicketIntakeService(bmsAdapter, auditSink, logger);
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
  const dattoAdapter = config.dattoRmmExecutionEnabled
    ? new RealDattoRmmAdapter(config, logger)
    : new DryRunDattoRmmAdapter(logger);
  const approvalService = new ApprovalService(approvalRepository, componentRegistry, new MockDattoDeviceAdapter(), bmsAdapter);
  const encryptionService = new SecretEncryptionService(config.encryptionKey);
  return {
    auditSink,
    ticketIntakeService,
    componentRegistry,
    approvalService,
    automationRunRepository,
    automationResultHandler: new AutomationResultHandler(automationRunRepository, dattoAdapter, auditSink, bmsAdapter, bmsWorkflow),
    automationJobPoller: new AutomationJobPoller(
      automationRunRepository,
      dattoAdapter,
      auditSink,
      bmsAdapter,
      config.automationJobTimeoutMinutes,
      bmsWorkflow
    ),
    adminDashboardService: new AdminDashboardService(
      ticketIntakeService,
      componentRegistry,
      approvalRepository,
      automationRunRepository,
      auditSink,
      safetySettingsRepository
    ),
    safetySettingsRepository,
    bmsWorkflow,
    adminAuthService: new AdminAuthService({
      email: config.adminBootstrapEmail,
      password: config.adminBootstrapPassword,
      role: "admin",
      sessionTtlMinutes: config.adminSessionTtlMinutes,
      setupToken: config.adminSetupToken,
      sessionSecret: config.adminSessionSecret
    }),
    rateLimiter: new InMemoryRateLimiter(),
    tenantRepository: new TenantRepository(),
    tenantSecretRepository: new TenantSecretRepository(encryptionService),
    tenantSettingsRepository: new TenantSettingsRepository(),
    tenantAuditLog: new TenantAuditLogRepository(),
    integrationTestRuns: new IntegrationTestRunRepository(),
    encryptionService
  };
}

export function createRequestHandler(config: ApiConfig, logger: Logger, dependencies: ApiDependencies) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/") {
      writeJson(response, 200, {
        ok: true,
        service: "dispatch-sentinel-api",
        name: "Dispatch Sentinel",
        phase: "12",
        routes: {
          health: "/health",
          bmsWebhook: "/api/webhooks/bms"
        }
      } satisfies RootResponse);
      return;
    }

    if (request.method === "GET" && (url.pathname === "/favicon.ico" || url.pathname === "/favicon.png")) {
      response.writeHead(204, {
        "cache-control": "public, max-age=86400"
      });
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      const encryptionConfigured = dependencies.encryptionService.status().ok;
      const adminAuthConfigured = dependencies.adminAuthService.isSetupConfigured();
      writeJson(response, 200, {
        ok: true,
        service: "dispatch-sentinel-api",
        environment: config.nodeEnv,
        encryptionConfigured,
        adminAuthConfigured,
        dattoExecutionGloballyEnabled: config.dattoRmmExecutionEnabled,
        config: {
          bmsWebhookConfigured: validateWebhookConfig(config).ok,
          dattoExecutionEnabled: config.dattoRmmExecutionEnabled,
          encryptionConfigured,
          adminAuthConfigured,
          dattoExecutionGloballyEnabled: config.dattoRmmExecutionEnabled
        }
      } satisfies PublicHealthResponse);
      return;
    }

    if (request.method === "GET" && url.pathname === "/healthz") {
      writeJson(response, 200, {
        status: "ok",
        service: "dispatch-sentinel-api",
        phase: "12",
        checks: healthChecks(config, dependencies)
      } satisfies HealthResponse);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/automation/result") {
      if (!checkRateLimit(request, response, dependencies, "webhook", config.webhookRateLimitPerMinute)) {
        return;
      }
      await handleAutomationResult(request, response, config, dependencies, logger);
      return;
    }

    if (url.pathname.startsWith("/approve/")) {
      if (!checkRateLimit(request, response, dependencies, "approval", config.approvalRateLimitPerMinute)) {
        return;
      }
      await handleApprovalRoute(request, response, url, config, dependencies, "approve");
      return;
    }

    if (url.pathname.startsWith("/reject/")) {
      if (!checkRateLimit(request, response, dependencies, "approval", config.approvalRateLimitPerMinute)) {
        return;
      }
      await handleApprovalRoute(request, response, url, config, dependencies, "reject");
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      if (!checkRateLimit(request, response, dependencies, "admin", config.adminRateLimitPerMinute)) {
        return;
      }
      await handleAdminLogin(request, response, dependencies);
      return;
    }

    if (url.pathname.startsWith("/api/admin/")) {
      if (!checkRateLimit(request, response, dependencies, "admin", config.adminRateLimitPerMinute)) {
        return;
      }
      const permission = adminPermissionFor(request, url);
      const session = dependencies.adminAuthService.authenticate(request.headers.authorization);
      try {
        dependencies.adminAuthService.requirePermission(session, permission);
      } catch (error) {
        writeJson(response, session ? 403 : 401, {
          error: session ? "forbidden" : "unauthorized",
          message: error instanceof Error ? error.message : "Admin access denied."
        });
        return;
      }
    }

    if (url.pathname === "/api/admin/tenants") {
      await handleTenantsCollection(request, response, dependencies);
      return;
    }

    if (url.pathname.startsWith("/api/admin/tenants/")) {
      await handleTenantAdminRoute(request, response, url, dependencies, config);
      return;
    }

    if (url.pathname === "/api/admin/components") {
      handleComponentList(request, response, dependencies);
      return;
    }

    if (url.pathname === "/api/admin/overview") {
      handleAdminOverview(request, response, dependencies);
      return;
    }

    if (url.pathname === "/api/admin/ticket-evaluations") {
      handleTicketEvaluations(request, response, dependencies);
      return;
    }

    if (url.pathname === "/api/admin/approvals") {
      handleApprovalList(request, response, dependencies);
      return;
    }

    if (url.pathname.startsWith("/api/admin/approvals/")) {
      handleApprovalAdminAction(request, response, url, dependencies);
      return;
    }

    if (url.pathname === "/api/admin/automation-runs") {
      handleAutomationRuns(request, response, dependencies);
      return;
    }

    if (url.pathname === "/api/admin/job-queue") {
      handleJobQueue(request, response, dependencies);
      return;
    }

    if (url.pathname.startsWith("/api/admin/export/")) {
      handleAdminExport(request, response, url, dependencies);
      return;
    }

    if (url.pathname === "/api/admin/audit-events") {
      handleAuditEvents(request, response, url, dependencies);
      return;
    }

    if (url.pathname === "/api/admin/safety-settings") {
      await handleSafetySettings(request, response, dependencies);
      return;
    }

    if (url.pathname.startsWith("/api/admin/components/")) {
      await handleComponentDetail(request, response, url, dependencies, logger);
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/webhooks/bms/")) {
      if (!checkRateLimit(request, response, dependencies, "webhook", config.webhookRateLimitPerMinute)) {
        return;
      }
      await handleTenantBmsWebhook(request, response, url, logger, dependencies);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/webhooks/bms") {
      if (!checkRateLimit(request, response, dependencies, "webhook", config.webhookRateLimitPerMinute)) {
        return;
      }
      await handleBmsWebhook(request, response, config, logger, dependencies);
      return;
    }

    logger.warn("Route not found", {
      method: request.method,
      path: url.pathname
    });

    writeJson(response, 404, {
      error: "not_found",
      message: "Route not found."
    });
  };
}

export function createApp(config: ApiConfig, logger: Logger, dependencies = createDefaultDependencies(logger, config)): DispatchSentinelApp {
  const handler = createRequestHandler(config, logger, dependencies);

  const app = ((request: IncomingMessage, response: ServerResponse) => {
    void handler(request, response);
  }) as DispatchSentinelApp;

  app.config = config;
  app.logger = logger;
  app.dependencies = dependencies;
  app.listen = (port = config.port, host = config.host, callback?: () => void) => {
    const server = createServer(app);
    const pollingWorker = dependencies.automationJobPoller
      ? createAutomationJobPollingWorker(dependencies.automationJobPoller, 60_000, (error) => {
          logger.error("Automation job polling failed", {
            error: error instanceof Error ? error.message : String(error)
          });
        })
      : null;

    server.listen(port, host, () => {
      logger.info("API server started", {
        host,
        port,
        phase: "12"
      });
      pollingWorker?.start();
      callback?.();
    });
    server.on("close", () => {
      pollingWorker?.stop();
    });
    return server;
  };

  return app;
}

function handleAdminOverview(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies) {
  if (request.method !== "GET") {
    writeJson(response, 405, { error: "method_not_allowed", message: "Only GET is supported for overview." });
    return;
  }
  writeJson(response, 200, { overview: dependencies.adminDashboardService.getOverview() });
}

async function handleAdminLogin(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies) {
  try {
    const payload = await readJsonBody(request);
    if (!isRecord(payload)) {
      throw new Error("Admin credentials are required.");
    }
    const session =
      typeof payload.token === "string"
        ? dependencies.adminAuthService.loginWithSetupToken(payload.token)
        : typeof payload.email === "string" && typeof payload.password === "string"
          ? dependencies.adminAuthService.login(payload.email, payload.password)
          : (() => {
              throw new Error("Admin token or email/password is required.");
            })();
    writeJson(response, 200, {
      token: session.token,
      role: session.role,
      expiresAt: session.expiresAt
    });
  } catch (error) {
    writeJson(response, 401, {
      error: "login_failed",
      message: error instanceof Error ? error.message : "Invalid admin credentials."
    });
  }
}

async function handleTenantsCollection(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies) {
  if (request.method === "GET") {
    const tenants = dependencies.tenantRepository.list().map((tenant) => tenantSummary(tenant.id, dependencies));
    writeJson(response, 200, { tenants });
    return;
  }
  if (request.method !== "POST") {
    writeJson(response, 405, { error: "method_not_allowed", message: "Only GET and POST are supported for tenants." });
    return;
  }
  try {
    const payload = await readJsonBody(request);
    if (!isRecord(payload) || typeof payload.name !== "string" || typeof payload.slug !== "string") {
      throw new Error("Tenant name and slug are required.");
    }
    const tenant = dependencies.tenantRepository.create({ name: payload.name, slug: payload.slug });
    dependencies.tenantSettingsRepository.getOrCreate(tenant.id);
    dependencies.tenantAuditLog.record({
      tenantId: tenant.id,
      type: "tenant.created",
      ticketId: null,
      deviceUid: null,
      componentId: null,
      outcome: "success",
      metadata: { slug: tenant.slug }
    });
    writeJson(response, 201, { tenant: tenantSummary(tenant.id, dependencies) });
  } catch (error) {
    writeJson(response, 400, {
      error: "validation_failed",
      message: error instanceof Error ? error.message : "Tenant creation failed."
    });
  }
}

async function handleTenantAdminRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  dependencies: ApiDependencies,
  config: ApiConfig
) {
  const path = url.pathname.replace("/api/admin/tenants/", "");
  const [tenantId, second, third, fourth] = path.split("/").map((part) => decodeURIComponent(part));
  if (!tenantId) {
    writeJson(response, 400, { error: "bad_request", message: "Tenant id is required." });
    return;
  }

  try {
    dependencies.tenantRepository.getAny(tenantId);
  } catch (error) {
    writeJson(response, 404, { error: "not_found", message: "Tenant not found." });
    return;
  }

  if (!second) {
    if (request.method === "GET") {
      writeJson(response, 200, { tenant: tenantSummary(tenantId, dependencies) });
      return;
    }
    if (request.method === "PATCH") {
      try {
        const payload = await readJsonBody(request);
        if (!isRecord(payload)) {
          throw new Error("Tenant update must be an object.");
        }
        const tenant = dependencies.tenantRepository.update(tenantId, {
          name: typeof payload.name === "string" ? payload.name : undefined,
          slug: typeof payload.slug === "string" ? payload.slug : undefined
        });
        writeJson(response, 200, { tenant: tenantSummary(tenant.id, dependencies) });
      } catch (error) {
        writeJson(response, 400, { error: "validation_failed", message: error instanceof Error ? error.message : "Tenant update failed." });
      }
      return;
    }
  }

  if (request.method === "POST" && second === "disable") {
    dependencies.tenantRepository.disable(tenantId);
    writeJson(response, 200, { tenant: tenantSummary(tenantId, dependencies) });
    return;
  }

  if (request.method === "POST" && second === "enable") {
    dependencies.tenantRepository.enable(tenantId);
    writeJson(response, 200, { tenant: tenantSummary(tenantId, dependencies) });
    return;
  }

  if (second === "secrets") {
    await handleTenantSecretsRoute(request, response, tenantId, third, fourth, dependencies);
    return;
  }

  if (second === "settings") {
    await handleTenantSettingsRoute(request, response, tenantId, dependencies);
    return;
  }

  if (second === "tests") {
    await handleTenantTestsRoute(request, response, tenantId, third, dependencies, config);
    return;
  }

  writeJson(response, 404, { error: "not_found", message: "Tenant route not found." });
}

async function handleTenantSecretsRoute(
  request: IncomingMessage,
  response: ServerResponse,
  tenantId: string,
  secretName: string | undefined,
  action: string | undefined,
  dependencies: ApiDependencies
) {
  if (request.method === "GET" && secretName === "status") {
    writeJson(response, 200, { secrets: dependencies.tenantSecretRepository.status(tenantId) });
    return;
  }
  if (!secretName || !isAllowedTenantSecretName(secretName)) {
    writeJson(response, 400, { error: "bad_request", message: "Allowed tenant secret name is required." });
    return;
  }
  if (request.method === "PUT" && !action) {
    await saveTenantSecret(request, response, tenantId, secretName, dependencies);
    return;
  }
  if (request.method === "POST" && action === "rotate") {
    await saveTenantSecret(request, response, tenantId, secretName, dependencies);
    return;
  }
  if (request.method === "DELETE" && !action) {
    dependencies.tenantSecretRepository.delete(tenantId, secretName);
    writeJson(response, 200, { status: "deleted", secretName });
    return;
  }
  writeJson(response, 405, { error: "method_not_allowed", message: "Unsupported tenant secret operation." });
}

async function saveTenantSecret(
  request: IncomingMessage,
  response: ServerResponse,
  tenantId: string,
  secretName: TenantSecretName,
  dependencies: ApiDependencies
) {
  try {
    const payload = await readJsonBody(request);
    if (!isRecord(payload) || typeof payload.value !== "string") {
      throw new Error("Secret value is required.");
    }
    dependencies.tenantSecretRepository.upsert(tenantId, secretName, payload.value);
    dependencies.tenantAuditLog.record({
      tenantId,
      type: "tenant.secret.saved",
      ticketId: null,
      deviceUid: null,
      componentId: null,
      outcome: "success",
      metadata: { secretName }
    });
    writeJson(response, 200, {
      secret: dependencies.tenantSecretRepository.status(tenantId).find((secret) => secret.secretName === secretName)
    });
  } catch (error) {
    writeJson(response, 400, {
      error: "secret_save_failed",
      message: error instanceof Error ? error.message : "Secret could not be saved."
    });
  }
}

async function handleTenantSettingsRoute(
  request: IncomingMessage,
  response: ServerResponse,
  tenantId: string,
  dependencies: ApiDependencies
) {
  if (request.method === "GET") {
    writeJson(response, 200, { settings: dependencies.tenantSettingsRepository.getOrCreate(tenantId) });
    return;
  }
  if (request.method !== "PATCH") {
    writeJson(response, 405, { error: "method_not_allowed", message: "Only GET and PATCH are supported for tenant settings." });
    return;
  }
  try {
    const payload = await readJsonBody(request);
    const update = parseTenantSettingsUpdate(payload);
    const settings = dependencies.tenantSettingsRepository.update(tenantId, update);
    dependencies.tenantAuditLog.record({
      tenantId,
      type: "tenant.settings.updated",
      ticketId: null,
      deviceUid: null,
      componentId: null,
      outcome: "success",
      metadata: { executionMode: settings.executionMode, dattoExecutionEnabled: settings.dattoExecutionEnabled }
    });
    writeJson(response, 200, { settings });
  } catch (error) {
    writeJson(response, 400, {
      error: "validation_failed",
      message: error instanceof Error ? error.message : "Tenant settings update failed."
    });
  }
}

async function handleTenantTestsRoute(
  request: IncomingMessage,
  response: ServerResponse,
  tenantId: string,
  testName: string | undefined,
  dependencies: ApiDependencies,
  config: ApiConfig
) {
  if (request.method === "GET" && !testName) {
    writeJson(response, 200, { tests: dependencies.integrationTestRuns.list(tenantId) });
    return;
  }
  if (request.method !== "POST" || !testName) {
    writeJson(response, 405, { error: "method_not_allowed", message: "Use POST for tenant integration tests." });
    return;
  }
  const run = runIntegrationTest(tenantId, testName, dependencies, config);
  writeJson(response, 200, { test: run });
}

function runIntegrationTest(tenantId: string, testName: string, dependencies: ApiDependencies, config: ApiConfig): IntegrationTestRun {
  const started = Date.now();
  const settings = dependencies.tenantSettingsRepository.getOrCreate(tenantId);
  let status: IntegrationTestRun["status"] = "dry_run";
  let message = "Dry-run test completed without external API calls.";

  if (testName.startsWith("bms-")) {
    const hasBmsBaseUrl = Boolean(dependencies.tenantSecretRepository.decrypt(tenantId, "bms_api_base_url"));
    status = hasBmsBaseUrl ? "dry_run" : "failed";
    message = hasBmsBaseUrl ? "BMS integration dry-run prerequisites are configured." : "BMS base URL is not configured.";
  } else if (testName.startsWith("datto-")) {
    const hasDattoUrl = Boolean(dependencies.tenantSecretRepository.decrypt(tenantId, "datto_rmm_api_url"));
    const liveAllowed = config.dattoRmmExecutionEnabled && settings.dattoExecutionEnabled && settings.executionMode === "live";
    status = hasDattoUrl ? "dry_run" : "failed";
    message = hasDattoUrl
      ? `Datto RMM ${liveAllowed ? "read test allowed by flags" : "dry-run only; live execution remains disabled"}.`
      : "Datto RMM API URL is not configured.";
  } else if (testName === "classifier-sample" || testName === "device-match-sample") {
    status = "passed";
    message = "Local sample test completed.";
  } else {
    status = "failed";
    message = "Unknown integration test.";
  }

  const run = dependencies.integrationTestRuns.record({
    tenantId,
    testType: testName,
    status,
    message,
    durationMs: Date.now() - started
  });
  dependencies.tenantAuditLog.record({
    tenantId,
    type: "tenant.integration_test.completed",
    ticketId: null,
    deviceUid: null,
    componentId: null,
    outcome: status === "failed" ? "error" : "success",
    metadata: { testType: testName, status }
  });
  return run;
}

function handleTicketEvaluations(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies) {
  if (request.method !== "GET") {
    writeJson(response, 405, { error: "method_not_allowed", message: "Only GET is supported for ticket evaluations." });
    return;
  }
  writeJson(response, 200, { evaluations: dependencies.adminDashboardService.listTicketEvaluations() });
}

function handleApprovalList(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies) {
  if (request.method !== "GET") {
    writeJson(response, 405, { error: "method_not_allowed", message: "Only GET is supported for approval requests." });
    return;
  }
  writeJson(response, 200, { approvals: dependencies.adminDashboardService.listApprovals().map(redactApproval) });
}

function handleApprovalAdminAction(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  dependencies: ApiDependencies
) {
  if (request.method !== "POST") {
    writeJson(response, 405, { error: "method_not_allowed", message: "Only POST is supported for approval admin actions." });
    return;
  }
  const match = url.pathname.match(/^\/api\/admin\/approvals\/([^/]+)\/(cancel|resend)$/);
  if (!match) {
    writeJson(response, 404, { error: "not_found", message: "Approval action not found." });
    return;
  }
  const id = decodeURIComponent(match[1]!);
  const action = match[2]!;
  const approval = action === "cancel" ? dependencies.adminDashboardService.cancelApproval(id) : dependencies.adminDashboardService.requestApprovalResend(id);
  if (!approval) {
    writeJson(response, 400, { error: "action_not_allowed", message: "Approval action is only safe for pending requests." });
    return;
  }
  writeJson(response, 200, { status: action === "cancel" ? "canceled" : "resend_requested", approval: redactApproval(approval) });
}

function handleAutomationRuns(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies) {
  if (request.method !== "GET") {
    writeJson(response, 405, { error: "method_not_allowed", message: "Only GET is supported for automation runs." });
    return;
  }
  writeJson(response, 200, { runs: dependencies.adminDashboardService.listAutomationRuns() });
}

function handleJobQueue(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies) {
  if (request.method !== "GET") {
    writeJson(response, 405, { error: "method_not_allowed", message: "Only GET is supported for job queue monitoring." });
    return;
  }
  writeJson(response, 200, { queue: dependencies.adminDashboardService.getQueueMonitor() });
}

function handleAdminExport(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies) {
  if (request.method !== "GET") {
    writeJson(response, 405, { error: "method_not_allowed", message: "Only GET is supported for exports." });
    return;
  }
  const target = url.pathname.replace("/api/admin/export/", "");
  if (target === "audit") {
    writeJson(response, 200, { events: dependencies.adminDashboardService.listAuditEvents() });
    return;
  }
  if (target === "component-registry") {
    writeJson(response, 200, { components: dependencies.adminDashboardService.exportComponentRegistry() });
    return;
  }
  if (target === "automation-runs") {
    writeJson(response, 200, { runs: dependencies.adminDashboardService.exportAutomationRuns() });
    return;
  }
  writeJson(response, 404, { error: "not_found", message: "Export target not found." });
}

function handleAuditEvents(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies) {
  if (request.method !== "GET") {
    writeJson(response, 405, { error: "method_not_allowed", message: "Only GET is supported for audit events." });
    return;
  }
  const events = dependencies.adminDashboardService.listAuditEvents({
    ticketId: url.searchParams.get("ticketId") ?? undefined,
    deviceUid: url.searchParams.get("deviceUid") ?? undefined,
    componentId: url.searchParams.get("componentId") ?? undefined,
    action: url.searchParams.get("action") ?? undefined
  });
  if (url.searchParams.get("format") === "csv") {
    response.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end(toCsv(events));
    return;
  }
  writeJson(response, 200, { events });
}

async function handleSafetySettings(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies) {
  if (request.method === "GET") {
    writeJson(response, 200, { settings: dependencies.adminDashboardService.getSafetySettings() });
    return;
  }
  if (request.method !== "PATCH") {
    writeJson(response, 405, { error: "method_not_allowed", message: "Only GET and PATCH are supported for safety settings." });
    return;
  }
  try {
    const update = parseSafetySettingsUpdate(await readJsonBody(request));
    writeJson(response, 200, { settings: dependencies.adminDashboardService.updateSafetySettings(update) });
  } catch (error) {
    writeJson(response, 400, {
      error: "validation_failed",
      message: error instanceof Error ? error.message : "Safety settings update failed validation."
    });
  }
}

export function createApiServer(config: ApiConfig, logger: Logger, dependencies = createDefaultDependencies(logger, config)) {
  const server = createServer(createRequestHandler(config, logger, dependencies));
  const pollingWorker = dependencies.automationJobPoller
    ? createAutomationJobPollingWorker(dependencies.automationJobPoller, 60_000, (error) => {
        logger.error("Automation job polling failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      })
    : null;

  return {
    server,
    dependencies,
    start: () =>
      new Promise<void>((resolve) => {
        server.listen(config.port, config.host, () => {
          logger.info("API server started", {
            host: config.host,
            port: config.port,
            phase: "12"
          });
          pollingWorker?.start();
          resolve();
        });
      }),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        pollingWorker?.stop();
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

async function handleAutomationResult(
  request: IncomingMessage,
  response: ServerResponse,
  config: ApiConfig,
  dependencies: ApiDependencies,
  logger: Logger
) {
  const dattoConfig = validateDattoConfig(config);
  if (!dattoConfig.ok) {
    logger.error("Automation result callback configuration missing", {
      code: dattoConfig.code
    });
    writeConfigError(response, dattoConfig);
    return;
  }

  if (request.headers["x-dispatch-sentinel-component-secret"] !== config.automationCallbackSecret) {
    logger.warn("Automation result callback rejected", { reason: "invalid_secret" });
    writeJson(response, 401, { error: "unauthorized", message: "Invalid callback secret." });
    return;
  }

  try {
    const payload = await readJsonBody(request);
    validateResultPayload(payload);
    const run = await dependencies.automationResultHandler.handleCallback(payload);
    writeJson(response, 200, { status: run.status, run });
  } catch (error) {
    writeJson(response, 400, {
      error: "bad_request",
      message: error instanceof Error ? error.message : "Invalid automation result payload."
    });
  }
}

async function handleApprovalRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  config: ApiConfig,
  dependencies: ApiDependencies,
  action: "approve" | "reject"
) {
  const approvalConfig = validateApprovalConfig(config);
  if (!approvalConfig.ok) {
    writeConfigError(response, approvalConfig);
    return;
  }

  const match = url.pathname.match(new RegExp(`^/${action}/([^/]+)(?:/confirm)?$`));
  const token = match?.[1] ? decodeURIComponent(match[1]) : "";
  const isConfirm = url.pathname.endsWith("/confirm");

  if (!token) {
    writeJson(response, 400, { error: "bad_request", message: "Approval token is required." });
    return;
  }

  try {
    if (request.method === "GET" && !isConfirm) {
      const approval = dependencies.approvalService.previewToken(token);
      writeJson(response, 200, {
        status: "pending",
        action,
        approval: redactApproval(approval)
      });
      return;
    }

    if (request.method === "POST" && isConfirm) {
      const context = {
        ip: request.socket.remoteAddress ?? null,
        userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null
      };
      const approval =
        action === "approve"
          ? await dependencies.approvalService.approve(token, context)
          : await dependencies.approvalService.reject(token, context);
      writeJson(response, 200, {
        status: approval.status,
        approval: redactApproval(approval)
      });
      return;
    }

    writeJson(response, 405, {
      error: "method_not_allowed",
      message: `Use GET /${action}/:token or POST /${action}/:token/confirm.`
    });
  } catch (error) {
    writeJson(response, 400, {
      error: "approval_failed",
      message: error instanceof Error ? error.message : "Approval request failed."
    });
  }
}

function handleComponentList(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies) {
  if (request.method !== "GET") {
    writeJson(response, 405, {
      error: "method_not_allowed",
      message: "Only GET is supported for component listing."
    });
    return;
  }

  writeJson(response, 200, {
    components: dependencies.componentRegistry.list()
  });
}

async function handleComponentDetail(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  dependencies: ApiDependencies,
  logger: Logger
) {
  const idOrSlug = decodeURIComponent(url.pathname.replace("/api/admin/components/", ""));
  if (!idOrSlug) {
    writeJson(response, 400, {
      error: "bad_request",
      message: "Component id or slug is required."
    });
    return;
  }

  if (request.method === "GET") {
    const component = dependencies.componentRegistry.get(idOrSlug);
    if (!component) {
      writeJson(response, 404, {
        error: "not_found",
        message: "Component not found."
      });
      return;
    }
    writeJson(response, 200, { component });
    return;
  }

  if (request.method === "PATCH") {
    let update: ComponentRegistryUpdate;
    try {
      update = parseComponentRegistryUpdate(await readJsonBody(request));
    } catch (error) {
      writeJson(response, 400, {
        error: "bad_request",
        message: error instanceof Error ? error.message : "Invalid component update."
      });
      return;
    }

    try {
      const component = dependencies.componentRegistry.update(idOrSlug, update);
      if (!component) {
        writeJson(response, 404, {
          error: "not_found",
          message: "Component not found."
        });
        return;
      }
      writeJson(response, 200, { component });
    } catch (error) {
      logger.warn("Component registry update rejected", {
        idOrSlug,
        error: error instanceof Error ? error.message : String(error)
      });
      writeJson(response, 400, {
        error: "validation_failed",
        message: error instanceof Error ? error.message : "Component update failed validation."
      });
    }
    return;
  }

  writeJson(response, 405, {
    error: "method_not_allowed",
    message: "Only GET and PATCH are supported for components."
  });
}

async function handleBmsWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  config: ApiConfig,
  logger: Logger,
  dependencies: ApiDependencies
) {
  const webhookConfig = validateWebhookConfig(config);
  if (!webhookConfig.ok) {
    logger.error("BMS webhook configuration missing", {
      code: webhookConfig.code
    });
    writeConfigError(response, webhookConfig);
    return;
  }

  const providedSecret = request.headers["x-dispatch-sentinel-secret"];
  if (providedSecret !== config.bmsWebhookSecret) {
    logger.warn("BMS webhook rejected", {
      reason: "invalid_secret"
    });
    writeJson(response, 401, {
      error: "unauthorized",
      message: "Invalid webhook secret."
    });
    return;
  }

  let payload: BmsWebhookPayload;
  try {
    payload = parseBmsWebhookPayload(await readJsonBody(request));
  } catch (error) {
    logger.warn("BMS webhook rejected", {
      reason: "invalid_payload",
      error: error instanceof Error ? error.message : String(error)
    });
    writeJson(response, 400, {
      error: "bad_request",
      message: "Invalid BMS webhook payload."
    });
    return;
  }

  dependencies.auditSink.record({
    type: "bms.webhook.received",
    ticketId: payload.ticketId,
    outcome: "success",
    metadata: {
      eventType: payload.eventType
    }
  });

  void dependencies.ticketIntakeService.enqueueTicketEvaluation(payload.ticketId, payload.eventType);

  writeJson(response, 202, {
    status: "accepted",
    ticketId: payload.ticketId,
    eventType: payload.eventType
  });
}

async function handleTenantBmsWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  logger: Logger,
  dependencies: ApiDependencies
) {
  const tenantSlug = decodeURIComponent(url.pathname.replace("/api/webhooks/bms/", ""));
  let tenant;
  try {
    tenant = dependencies.tenantRepository.getBySlug(tenantSlug);
  } catch {
    writeJson(response, 404, { error: "not_found", message: "Tenant webhook endpoint was not found." });
    return;
  }

  if (tenant.status !== "active") {
    dependencies.tenantAuditLog.record({
      tenantId: tenant.id,
      type: "tenant.bms.webhook.rejected",
      ticketId: null,
      deviceUid: null,
      componentId: null,
      outcome: "rejected",
      metadata: { reason: "tenant_inactive" }
    });
    writeJson(response, 403, { error: "tenant_inactive", message: "Tenant is not active." });
    return;
  }

  const expectedSecret = dependencies.tenantSecretRepository.decrypt(tenant.id, "bms_webhook_secret");
  if (!expectedSecret) {
    dependencies.tenantAuditLog.record({
      tenantId: tenant.id,
      type: "tenant.bms.webhook.rejected",
      ticketId: null,
      deviceUid: null,
      componentId: null,
      outcome: "rejected",
      metadata: { reason: "secret_not_configured" }
    });
    writeJson(response, 503, { error: "configuration_error", message: "Tenant BMS webhook secret is not configured." });
    return;
  }

  if (request.headers["x-dispatch-sentinel-secret"] !== expectedSecret) {
    dependencies.tenantAuditLog.record({
      tenantId: tenant.id,
      type: "tenant.bms.webhook.rejected",
      ticketId: null,
      deviceUid: null,
      componentId: null,
      outcome: "rejected",
      metadata: { reason: "invalid_secret" }
    });
    logger.warn("Tenant BMS webhook rejected", { tenantId: tenant.id, reason: "invalid_secret" });
    writeJson(response, 401, { error: "unauthorized", message: "Invalid webhook secret." });
    return;
  }

  let payload: BmsWebhookPayload;
  try {
    payload = parseBmsWebhookPayload(await readJsonBody(request));
  } catch (error) {
    dependencies.tenantAuditLog.record({
      tenantId: tenant.id,
      type: "tenant.bms.webhook.rejected",
      ticketId: null,
      deviceUid: null,
      componentId: null,
      outcome: "error",
      metadata: { reason: "invalid_payload" }
    });
    writeJson(response, 400, { error: "bad_request", message: "Invalid BMS webhook payload." });
    return;
  }

  dependencies.tenantAuditLog.record({
    tenantId: tenant.id,
    type: "tenant.bms.webhook.accepted",
    ticketId: payload.ticketId,
    deviceUid: null,
    componentId: null,
    outcome: "success",
    metadata: { eventType: payload.eventType }
  });
  void dependencies.ticketIntakeService.enqueueTicketEvaluation(payload.ticketId, payload.eventType);
  writeJson(response, 202, {
    status: "accepted",
    tenantId: tenant.id,
    ticketId: payload.ticketId,
    eventType: payload.eventType
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    throw new Error("Request body is required.");
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function parseBmsWebhookPayload(payload: unknown): BmsWebhookPayload {
  if (!isRecord(payload)) {
    throw new Error("Payload must be an object.");
  }

  const eventType = payload.eventType;
  const ticketId = payload.ticketId;

  if (eventType !== "ticket.created" && eventType !== "ticket.updated") {
    throw new Error("eventType must be ticket.created or ticket.updated.");
  }

  if (typeof ticketId !== "string" || !ticketId.trim()) {
    throw new Error("ticketId is required.");
  }

  return {
    eventType,
    ticketId: ticketId.trim()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseComponentRegistryUpdate(payload: unknown): ComponentRegistryUpdate {
  if (!isRecord(payload)) {
    throw new Error("Payload must be an object.");
  }

  const update: ComponentRegistryUpdate = {};
  if ("enabled" in payload) {
    if (typeof payload.enabled !== "boolean") {
      throw new Error("enabled must be a boolean.");
    }
    update.enabled = payload.enabled;
  }

  if ("allowedIntents" in payload) {
    if (!Array.isArray(payload.allowedIntents) || payload.allowedIntents.some((intent) => typeof intent !== "string")) {
      throw new Error("allowedIntents must be an array of strings.");
    }
    update.allowedIntents = payload.allowedIntents as ComponentRegistryUpdate["allowedIntents"];
  }

  if ("riskLevel" in payload) {
    if (typeof payload.riskLevel !== "string") {
      throw new Error("riskLevel must be a string.");
    }
    update.riskLevel = payload.riskLevel as ComponentRegistryUpdate["riskLevel"];
  }

  if ("requiresClientConfirmation" in payload) {
    if (typeof payload.requiresClientConfirmation !== "boolean") {
      throw new Error("requiresClientConfirmation must be a boolean.");
    }
    update.requiresClientConfirmation = payload.requiresClientConfirmation;
  }

  if ("requiresTechApproval" in payload) {
    if (typeof payload.requiresTechApproval !== "boolean") {
      throw new Error("requiresTechApproval must be a boolean.");
    }
    update.requiresTechApproval = payload.requiresTechApproval;
  }

  return update;
}

function parseSafetySettingsUpdate(payload: unknown): AdminSafetySettingsUpdate {
  if (!isRecord(payload)) {
    throw new Error("Payload must be an object.");
  }

  const update: AdminSafetySettingsUpdate = {};
  if ("globalExecutionEnabled" in payload) {
    if (typeof payload.globalExecutionEnabled !== "boolean") {
      throw new Error("globalExecutionEnabled must be a boolean.");
    }
    update.globalExecutionEnabled = payload.globalExecutionEnabled;
  }
  if ("dryRunMode" in payload) {
    if (typeof payload.dryRunMode !== "boolean") {
      throw new Error("dryRunMode must be a boolean.");
    }
    update.dryRunMode = payload.dryRunMode;
  }
  if ("maxRunsPerDevicePerDay" in payload) {
    const maxRunsPerDevicePerDay = payload.maxRunsPerDevicePerDay;
    if (typeof maxRunsPerDevicePerDay !== "number" || !Number.isInteger(maxRunsPerDevicePerDay) || maxRunsPerDevicePerDay < 0) {
      throw new Error("maxRunsPerDevicePerDay must be a non-negative integer.");
    }
    update.maxRunsPerDevicePerDay = maxRunsPerDevicePerDay;
  }
  if ("allowedAccounts" in payload) {
    if (!Array.isArray(payload.allowedAccounts) || payload.allowedAccounts.some((account) => typeof account !== "string")) {
      throw new Error("allowedAccounts must be an array of account IDs.");
    }
    update.allowedAccounts = payload.allowedAccounts;
  }
  if ("blockedAccounts" in payload) {
    if (!Array.isArray(payload.blockedAccounts) || payload.blockedAccounts.some((account) => typeof account !== "string")) {
      throw new Error("blockedAccounts must be an array of account IDs.");
    }
    update.blockedAccounts = payload.blockedAccounts;
  }
  return update;
}

function parseTenantSettingsUpdate(payload: unknown): Partial<Omit<TenantSettings, "tenantId" | "updatedAt">> {
  if (!isRecord(payload)) {
    throw new Error("Tenant settings update must be an object.");
  }
  const update: Partial<Omit<TenantSettings, "tenantId" | "updatedAt">> = {};
  if ("execution_mode" in payload) {
    if (payload.execution_mode !== "dry_run" && payload.execution_mode !== "live") {
      throw new Error("execution_mode must be dry_run or live.");
    }
    update.executionMode = payload.execution_mode;
  }
  if ("datto_execution_enabled" in payload) {
    if (typeof payload.datto_execution_enabled !== "boolean") {
      throw new Error("datto_execution_enabled must be boolean.");
    }
    update.dattoExecutionEnabled = payload.datto_execution_enabled;
  }
  if ("server_automation_enabled" in payload) {
    if (typeof payload.server_automation_enabled !== "boolean") {
      throw new Error("server_automation_enabled must be boolean.");
    }
    update.serverAutomationEnabled = payload.server_automation_enabled;
  }
  if ("max_runs_per_device_per_day" in payload) {
    if (typeof payload.max_runs_per_device_per_day !== "number") {
      throw new Error("max_runs_per_device_per_day must be a number.");
    }
    update.maxRunsPerDevicePerDay = payload.max_runs_per_device_per_day;
  }
  for (const [wireKey, modelKey] of [
    ["bms_default_queue", "bmsDefaultQueue"],
    ["bms_automation_review_queue", "bmsAutomationReviewQueue"],
    ["bms_human_review_queue", "bmsHumanReviewQueue"],
    ["bms_security_queue", "bmsSecurityQueue"],
    ["bms_status_awaiting_confirmation", "bmsStatusAwaitingConfirmation"],
    ["bms_status_automation_running", "bmsStatusAutomationRunning"],
    ["bms_status_needs_qa", "bmsStatusNeedsQa"],
    ["bms_status_escalated", "bmsStatusEscalated"]
  ] as const) {
    if (wireKey in payload) {
      const value = payload[wireKey];
      if (typeof value !== "string" && value !== null) {
        throw new Error(`${wireKey} must be a string or null.`);
      }
      update[modelKey] = value;
    }
  }
  return update;
}

function adminPermissionFor(request: IncomingMessage, url: URL): AdminPermission {
  if (request.method === "GET") {
    return "read";
  }
  if (url.pathname.includes("/approvals/") && (url.pathname.endsWith("/cancel") || url.pathname.endsWith("/resend"))) {
    return "operate";
  }
  return "admin";
}

function checkRateLimit(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApiDependencies,
  bucket: string,
  limit: number
): boolean {
  const result = dependencies.rateLimiter.check({
    bucket,
    key: clientKey(request),
    limit
  });
  if (result.allowed) {
    return true;
  }
  response.writeHead(429, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "retry-after": String(result.retryAfterSeconds)
  });
  response.end(JSON.stringify({ error: "rate_limited", message: "Too many requests." }));
  return false;
}

function clientKey(request: IncomingMessage): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]!.trim();
  }
  return request.socket.remoteAddress ?? "unknown";
}

function healthChecks(config: ApiConfig, dependencies: ApiDependencies): HealthResponse["checks"] {
  const queue = dependencies.adminDashboardService.getQueueMonitor();
  return {
    api: "ok",
    database: config.databaseUrl ? "ok" : "not_configured",
    queue: queue.failed > 0 ? "degraded" : "ok",
    bmsAdapter: "ok",
    dattoRmmAdapter: config.dattoRmmExecutionEnabled ? "ok" : "dry_run"
  };
}

function tenantSummary(tenantId: string, dependencies: ApiDependencies) {
  const tenant = dependencies.tenantRepository.getAny(tenantId);
  const secrets = dependencies.tenantSecretRepository.status(tenantId);
  const settings = dependencies.tenantSettingsRepository.getOrCreate(tenantId);
  const tests = dependencies.integrationTestRuns.list(tenantId);
  const configured = (name: TenantSecretName) => secrets.find((secret) => secret.secretName === name)?.configured ?? false;
  return {
    ...tenant,
    webhookUrl: `/api/webhooks/bms/${tenant.slug}`,
    configuration: {
      bmsConfigured: configured("bms_api_base_url") && configured("bms_api_secret"),
      bmsWebhookConfigured: configured("bms_webhook_secret"),
      dattoConfigured: configured("datto_rmm_api_url") && configured("datto_rmm_api_key") && configured("datto_rmm_api_secret")
    },
    executionMode: settings.executionMode,
    lastTestStatus: tests.at(-1)?.status ?? null
  };
}

function isAllowedTenantSecretName(secretName: string): secretName is TenantSecretName {
  return allowedTenantSecretNames.includes(secretName as TenantSecretName);
}

function redactApproval(approval: ApprovalRequest) {
  const { tokenHash: _tokenHash, ...safeApproval } = approval;
  return safeApproval;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function writeConfigError(response: ServerResponse, validation: ConfigValidationResult) {
  writeJson(response, 503, {
    error: "configuration_error",
    code: validation.code ?? "not_ready",
    message: validation.message ?? "Required runtime configuration is missing."
  });
}

const defaultConfig = loadConfig();
const defaultLogger = createLogger(defaultConfig.logLevel);

export const app = createApp(defaultConfig, defaultLogger);

export default app;
