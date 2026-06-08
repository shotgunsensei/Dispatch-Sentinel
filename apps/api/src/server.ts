import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ApprovalRequest } from "@dispatch-sentinel/shared";
import type { ApiConfig } from "./config.js";
import type { Logger } from "./logger.js";
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

export interface HealthResponse {
  status: "ok";
  service: "dispatch-sentinel-api";
  phase: "10";
  checks: {
    api: "ok";
    database: "ok" | "not_configured";
    queue: "ok" | "degraded";
    bmsAdapter: "ok";
    dattoRmmAdapter: "ok" | "dry_run";
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
}

export interface BmsWebhookPayload {
  eventType: "ticket.created" | "ticket.updated";
  ticketId: string;
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
      sessionTtlMinutes: config.adminSessionTtlMinutes
    }),
    rateLimiter: new InMemoryRateLimiter()
  };
}

export function createRequestHandler(config: ApiConfig, logger: Logger, dependencies: ApiDependencies) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/healthz") {
      writeJson(response, 200, {
        status: "ok",
        service: "dispatch-sentinel-api",
        phase: "10",
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
      await handleApprovalRoute(request, response, url, dependencies, "approve");
      return;
    }

    if (url.pathname.startsWith("/reject/")) {
      if (!checkRateLimit(request, response, dependencies, "approval", config.approvalRateLimitPerMinute)) {
        return;
      }
      await handleApprovalRoute(request, response, url, dependencies, "reject");
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
    if (!isRecord(payload) || typeof payload.email !== "string" || typeof payload.password !== "string") {
      throw new Error("Email and password are required.");
    }
    const session = dependencies.adminAuthService.login(payload.email, payload.password);
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
            phase: "10"
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
  dependencies: ApiDependencies,
  action: "approve" | "reject"
) {
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
