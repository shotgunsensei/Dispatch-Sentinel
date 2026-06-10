import { randomUUID } from "node:crypto";

export interface ApiConfig {
  nodeEnv: string;
  host: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  databaseUrl: string;
  bmsWebhookSecret: string | null;
  dattoRmmExecutionEnabled: boolean;
  dattoRmmBaseUrl: string | null;
  dattoRmmApiKey: string | null;
  dattoRmmApiSecret: string | null;
  dattoRmmTimeoutMs: number;
  automationCallbackBaseUrl: string;
  automationCallbackSecret: string | null;
  approvalTokenSecret: string | null;
  automationJobTimeoutMinutes: number;
  bmsWritesEnabled: boolean;
  bmsQueueAutomationReview: string;
  bmsQueueLevel1: string;
  bmsQueueLevel2: string;
  bmsQueueSecurity: string;
  bmsQueueHumanReview: string;
  bmsStatusAutoTriage: string;
  bmsStatusAwaitingClientConfirmation: string;
  bmsStatusAutomationRunning: string;
  bmsStatusNeedsQa: string;
  bmsStatusEscalated: string;
  bmsStatusCompleted: string;
  bmsQueueAutoEligible: boolean;
  bmsDenyAutomationRouteToHuman: boolean;
  bmsSuccessPublicNoteEnabled: boolean;
  bmsCloseTicketsEnabled: boolean;
  bmsPriorityUpdatesEnabled: boolean;
  adminBootstrapEmail: string;
  adminBootstrapPassword: string;
  adminSetupToken: string | null;
  adminSessionSecret: string | null;
  encryptionKey: string | null;
  encryptionKeyVersion: string;
  adminAllowedOrigin: string | null;
  adminSessionTtlMinutes: number;
  webhookRateLimitPerMinute: number;
  approvalRateLimitPerMinute: number;
  adminRateLimitPerMinute: number;
  globalAutomationDisabled: boolean;
  dryRunOnly: boolean;
}

const allowedLogLevels = ["debug", "info", "warn", "error"] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number(env.API_PORT ?? 4310);
  const logLevel = env.LOG_LEVEL ?? "info";
  const nodeEnv = env.NODE_ENV ?? "development";
  const bmsWebhookSecret = env.BMS_WEBHOOK_SECRET ?? (nodeEnv === "production" ? null : "local-phase1-bms-secret");
  const dattoRmmTimeoutMs = Number(env.DATTO_RMM_TIMEOUT_MS ?? 10000);
  const automationCallbackSecret =
    env.COMPONENT_CALLBACK_SECRET ?? env.AUTOMATION_CALLBACK_SECRET ?? (nodeEnv === "production" ? null : "local-phase7-callback-secret");
  const approvalTokenSecret = env.APPROVAL_TOKEN_SECRET ?? (nodeEnv === "production" ? null : "local-approval-token-secret");
  const automationJobTimeoutMinutes = Number(env.AUTOMATION_JOB_TIMEOUT_MINUTES ?? 30);
  const adminBootstrapEmail = env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@dispatch.local";
  const adminBootstrapPassword =
    env.ADMIN_BOOTSTRAP_PASSWORD ?? (nodeEnv === "production" ? `disabled-${randomUUID()}` : "local-admin-password");
  const adminSetupToken = env.ADMIN_SETUP_TOKEN ?? (nodeEnv === "production" ? null : "local-admin-setup-token");
  const adminSessionSecret = env.ADMIN_SESSION_SECRET ?? (nodeEnv === "production" ? null : "local-admin-session-secret");
  const encryptionKey = env.DISPATCH_SENTINEL_ENCRYPTION_KEY ?? null;
  const encryptionKeyVersion = env.DISPATCH_SENTINEL_ENCRYPTION_KEY_VERSION ?? "v1";
  const adminAllowedOrigin = env.ADMIN_ALLOWED_ORIGIN ?? null;
  const adminSessionTtlMinutes = Number(env.ADMIN_SESSION_TTL_MINUTES ?? 480);
  const webhookRateLimitPerMinute = Number(env.WEBHOOK_RATE_LIMIT_PER_MINUTE ?? 60);
  const approvalRateLimitPerMinute = Number(env.APPROVAL_RATE_LIMIT_PER_MINUTE ?? 30);
  const adminRateLimitPerMinute = Number(env.ADMIN_RATE_LIMIT_PER_MINUTE ?? 120);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("API_PORT must be an integer from 1 to 65535.");
  }

  if (!allowedLogLevels.includes(logLevel as ApiConfig["logLevel"])) {
    throw new Error("LOG_LEVEL must be one of debug, info, warn, or error.");
  }

  if (!Number.isInteger(dattoRmmTimeoutMs) || dattoRmmTimeoutMs <= 0) {
    throw new Error("DATTO_RMM_TIMEOUT_MS must be a positive integer.");
  }

  if (!Number.isInteger(automationJobTimeoutMinutes) || automationJobTimeoutMinutes <= 0) {
    throw new Error("AUTOMATION_JOB_TIMEOUT_MINUTES must be a positive integer.");
  }

  if (!adminBootstrapEmail) {
    throw new Error("ADMIN_BOOTSTRAP_EMAIL is required.");
  }

  if (!Number.isInteger(adminSessionTtlMinutes) || adminSessionTtlMinutes <= 0) {
    throw new Error("ADMIN_SESSION_TTL_MINUTES must be a positive integer.");
  }

  for (const [name, value] of [
    ["WEBHOOK_RATE_LIMIT_PER_MINUTE", webhookRateLimitPerMinute],
    ["APPROVAL_RATE_LIMIT_PER_MINUTE", approvalRateLimitPerMinute],
    ["ADMIN_RATE_LIMIT_PER_MINUTE", adminRateLimitPerMinute]
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }

  return {
    nodeEnv,
    host: env.API_HOST ?? "127.0.0.1",
    port,
    logLevel: logLevel as ApiConfig["logLevel"],
    databaseUrl: env.DATABASE_URL ?? "file:./data/dispatch-sentinel.sqlite",
    bmsWebhookSecret,
    dattoRmmExecutionEnabled: env.DATTO_RMM_EXECUTION_ENABLED === "true",
    dattoRmmBaseUrl: env.DATTO_RMM_BASE_URL ?? null,
    dattoRmmApiKey: env.DATTO_RMM_API_KEY ?? null,
    dattoRmmApiSecret: env.DATTO_RMM_API_SECRET ?? null,
    dattoRmmTimeoutMs,
    automationCallbackBaseUrl: env.AUTOMATION_CALLBACK_BASE_URL ?? `http://${env.API_HOST ?? "127.0.0.1"}:${port}`,
    automationCallbackSecret,
    approvalTokenSecret,
    automationJobTimeoutMinutes,
    bmsWritesEnabled: env.BMS_WRITES_ENABLED === "true",
    bmsQueueAutomationReview: env.BMS_QUEUE_AUTOMATION_REVIEW ?? "Automation Review",
    bmsQueueLevel1: env.BMS_QUEUE_LEVEL1 ?? "Level 1",
    bmsQueueLevel2: env.BMS_QUEUE_LEVEL2 ?? "Level 2",
    bmsQueueSecurity: env.BMS_QUEUE_SECURITY ?? "Security",
    bmsQueueHumanReview: env.BMS_QUEUE_HUMAN_REVIEW ?? "Human Review",
    bmsStatusAutoTriage: env.BMS_STATUS_AUTO_TRIAGE ?? "Auto-Triage",
    bmsStatusAwaitingClientConfirmation: env.BMS_STATUS_AWAITING_CLIENT_CONFIRMATION ?? "Awaiting Client Confirmation",
    bmsStatusAutomationRunning: env.BMS_STATUS_AUTOMATION_RUNNING ?? "Automation Running",
    bmsStatusNeedsQa: env.BMS_STATUS_NEEDS_QA ?? "Needs QA",
    bmsStatusEscalated: env.BMS_STATUS_ESCALATED ?? "Escalated",
    bmsStatusCompleted: env.BMS_STATUS_COMPLETED ?? "Completed",
    bmsQueueAutoEligible: env.BMS_QUEUE_AUTO_ELIGIBLE === "true",
    bmsDenyAutomationRouteToHuman: env.BMS_DENY_AUTOMATION_ROUTE_TO_HUMAN !== "false",
    bmsSuccessPublicNoteEnabled: env.BMS_SUCCESS_PUBLIC_NOTE_ENABLED === "true",
    bmsCloseTicketsEnabled: env.BMS_CLOSE_TICKETS_ENABLED === "true",
    bmsPriorityUpdatesEnabled: env.BMS_PRIORITY_UPDATES_ENABLED === "true",
    adminBootstrapEmail,
    adminBootstrapPassword,
    adminSetupToken,
    adminSessionSecret,
    encryptionKey,
    encryptionKeyVersion,
    adminAllowedOrigin,
    adminSessionTtlMinutes,
    webhookRateLimitPerMinute,
    approvalRateLimitPerMinute,
    adminRateLimitPerMinute,
    globalAutomationDisabled: env.GLOBAL_AUTOMATION_DISABLED === "true",
    dryRunOnly: env.DRY_RUN_ONLY === "true"
  };
}

export interface ConfigValidationResult {
  ok: boolean;
  code?: "missing_secret" | "missing_credentials";
  message?: string;
}

export function validateWebhookConfig(config: Pick<ApiConfig, "bmsWebhookSecret">): ConfigValidationResult {
  if (!config.bmsWebhookSecret) {
    return {
      ok: false,
      code: "missing_secret",
      message: "BMS webhook secret is not configured."
    };
  }
  return { ok: true };
}

export function validateApprovalConfig(config: Pick<ApiConfig, "approvalTokenSecret">): ConfigValidationResult {
  if (!config.approvalTokenSecret) {
    return {
      ok: false,
      code: "missing_secret",
      message: "Approval token secret is not configured."
    };
  }
  return { ok: true };
}

export function validateDattoConfig(
  config: Pick<ApiConfig, "dattoRmmExecutionEnabled" | "dattoRmmBaseUrl" | "dattoRmmApiKey" | "dattoRmmApiSecret" | "automationCallbackSecret">
): ConfigValidationResult {
  if (!config.automationCallbackSecret) {
    return {
      ok: false,
      code: "missing_secret",
      message: "Component callback secret is not configured."
    };
  }
  if (!config.dattoRmmExecutionEnabled) {
    return { ok: true };
  }
  if (!config.dattoRmmBaseUrl || !config.dattoRmmApiKey || !config.dattoRmmApiSecret) {
    return {
      ok: false,
      code: "missing_credentials",
      message: "Datto RMM credentials are not configured."
    };
  }
  return { ok: true };
}
