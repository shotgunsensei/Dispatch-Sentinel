import type { ApprovalRequest, AutomationDecision, AutomationRun, ComponentRegistryEntry } from "@dispatch-sentinel/shared";
import { describe, expect, it, vi } from "vitest";
import { InMemoryAuditSink } from "../audit/audit-sink.js";
import { ComponentRegistryRepository } from "../component-registry/registry.js";
import { DryRunDattoRmmAdapter } from "../datto-rmm/dry-run-adapter.js";
import { RealDattoRmmAdapter } from "../datto-rmm/real-adapter.js";
import { AutomationRunRepository, AutomationRunner, type AutomationRunnerConfig } from "./automation-runner.js";
import type { ApiConfig } from "../../config.js";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

describe("AutomationRunner", () => {
  it("dry-run creates automation run", async () => {
    const fixture = createFixture();
    const run = await fixture.runner.runApprovedQuickJob({
      decision: decision(fixture.component),
      approvalRequest: approval(fixture.component),
      now: new Date("2026-06-05T14:00:00.000Z")
    });

    expect(run.status).toBe("completed");
    expect(run.dattoJobUid).toMatch(/^dry-run-job-/);
    expect(run.resultSummary).toContain("simulated success");
    expect(fixture.adapter.intendedJobs).toHaveLength(1);
    expect(fixture.auditSink.list().some((event) => event.type === "automation.run.guard_passed")).toBe(true);
  });

  it("unapproved request cannot run", async () => {
    const fixture = createFixture();
    const run = await fixture.runner.runApprovedQuickJob({
      decision: decision(fixture.component),
      approvalRequest: { ...approval(fixture.component), status: "pending" }
    });

    expect(run.status).toBe("blocked");
    expect(run.errorMessage).toContain("not approved");
    expect(fixture.adapter.intendedJobs).toHaveLength(0);
  });

  it("disabled component cannot run", async () => {
    const fixture = createFixture();
    fixture.registry.update("restart-print-spooler", { enabled: false });
    const run = await fixture.runner.runApprovedQuickJob({
      decision: decision(fixture.component),
      approvalRequest: approval(fixture.component),
      now: new Date("2026-06-05T14:00:00.000Z")
    });

    expect(run.status).toBe("blocked");
    expect(run.errorMessage).toContain("disabled or missing");
    expect(fixture.adapter.intendedJobs).toHaveLength(0);
  });

  it("mismatched device cannot run", async () => {
    const fixture = createFixture();
    const run = await fixture.runner.runApprovedQuickJob({
      decision: decision(fixture.component),
      approvalRequest: { ...approval(fixture.component), deviceUid: "datto-device-other" }
    });

    expect(run.status).toBe("blocked");
    expect(run.errorMessage).toContain("device does not match");
    expect(fixture.adapter.intendedJobs).toHaveLength(0);
  });

  it("max daily runs blocks execution", async () => {
    const fixture = createFixture();
    for (let index = 0; index < fixture.component.maxRunsPerDevicePerDay; index++) {
      fixture.repository.create(successfulRun(fixture.component, index));
    }

    const run = await fixture.runner.runApprovedQuickJob({
      decision: decision(fixture.component),
      approvalRequest: approval(fixture.component),
      now: new Date("2026-06-05T14:00:00.000Z")
    });

    expect(run.status).toBe("blocked");
    expect(run.errorMessage).toContain("daily run limit");
    expect(fixture.adapter.intendedJobs).toHaveLength(0);
  });

  it("execution flag prevents real adapter use", async () => {
    const registry = new ComponentRegistryRepository();
    const component = registry.get("restart-print-spooler")!;
    const repository = new AutomationRunRepository();
    const auditSink = new InMemoryAuditSink(logger);
    const realAdapter = new RealDattoRmmAdapter(config(false), logger);
    const runner = new AutomationRunner(repository, registry, realAdapter, auditSink, logger, {
      executionEnabled: false,
      dryRun: false,
      callbackBaseUrl: "https://dispatch.example.test"
    });

    const run = await runner.runApprovedQuickJob({
      decision: decision(component),
      approvalRequest: approval(component)
    });

    expect(run.status).toBe("blocked");
    expect(run.errorMessage).toContain("Execution flag prevents real Datto RMM adapter use");
  });

  it("execution disabled setting blocks execution", async () => {
    const fixture = createFixture({ adminExecutionEnabled: false });
    const run = await fixture.runner.runApprovedQuickJob({
      decision: decision(fixture.component),
      approvalRequest: approval(fixture.component)
    });

    expect(run.status).toBe("blocked");
    expect(run.errorMessage).toContain("Admin safety setting disables automation execution");
    expect(fixture.adapter.intendedJobs).toHaveLength(0);
  });

  it("global automation kill switch blocks execution", async () => {
    const fixture = createFixture({ globalAutomationDisabled: true });
    const run = await fixture.runner.runApprovedQuickJob({
      decision: decision(fixture.component),
      approvalRequest: approval(fixture.component)
    });

    expect(run.status).toBe("blocked");
    expect(run.errorMessage).toContain("Global automation kill switch");
  });

  it("client account kill switch blocks execution", async () => {
    const fixture = createFixture({ blockedAccounts: ["acct-001"] });
    const run = await fixture.runner.runApprovedQuickJob({
      decision: decision(fixture.component),
      approvalRequest: approval(fixture.component)
    });

    expect(run.status).toBe("blocked");
    expect(run.errorMessage).toContain("Client/account automation kill switch");
  });

  it("dry-run only kill switch blocks live execution", async () => {
    const registry = new ComponentRegistryRepository();
    const component = registry.get("restart-print-spooler")!;
    const repository = new AutomationRunRepository();
    const auditSink = new InMemoryAuditSink(logger);
    const adapter = new DryRunDattoRmmAdapter(logger);
    const runner = new AutomationRunner(repository, registry, adapter, auditSink, logger, {
      executionEnabled: true,
      dryRun: false,
      dryRunOnly: true,
      callbackBaseUrl: "https://dispatch.example.test"
    });

    const run = await runner.runApprovedQuickJob({
      decision: decision(component),
      approvalRequest: approval(component)
    });

    expect(run.status).toBe("blocked");
    expect(run.errorMessage).toContain("Dry-run only kill switch");
  });

  it("server device is blocked", async () => {
    const fixture = createFixture();
    const run = await fixture.runner.runApprovedQuickJob({
      decision: { ...decision(fixture.component), deviceId: "datto-device-app-server-02" },
      approvalRequest: { ...approval(fixture.component), deviceUid: "datto-device-app-server-02" }
    });

    expect(run.status).toBe("blocked");
    expect(run.errorMessage).toContain("Only approved workstation devices");
  });

  it("high-risk component is blocked", async () => {
    const fixture = createFixture();
    const highRisk = fixture.registry.update("restart-print-spooler", { riskLevel: "high" })!;
    const run = await fixture.runner.runApprovedQuickJob({
      decision: decision(highRisk),
      approvalRequest: approval(highRisk)
    });

    expect(run.status).toBe("blocked");
    expect(run.errorMessage).toContain("Only low-risk components");
  });

  it("passes required component variables to Datto RMM", async () => {
    const fixture = createFixture();
    const run = await fixture.runner.runApprovedQuickJob({
      decision: decision(fixture.component),
      approvalRequest: approval(fixture.component)
    });
    const intendedJob = fixture.adapter.intendedJobs[0]!;

    expect(run.status).toBe("completed");
    expect(intendedJob.variables).toMatchObject({
      ticketId: "ticket:BMS-1001",
      callbackUrl: "https://dispatch.example.test/api/automation/result",
      automationRunId: run.id,
      componentSlug: "restart-print-spooler"
    });
  });
});

function createFixture(configOverrides: Partial<AutomationRunnerConfig> = {}) {
  const registry = new ComponentRegistryRepository();
  const component = registry.get("restart-print-spooler")!;
  const repository = new AutomationRunRepository();
  const auditSink = new InMemoryAuditSink(logger);
  const adapter = new DryRunDattoRmmAdapter(logger);
  const runner = new AutomationRunner(repository, registry, adapter, auditSink, logger, {
    executionEnabled: false,
    dryRun: true,
    callbackBaseUrl: "https://dispatch.example.test",
    ...configOverrides
  });

  return { registry, component, repository, auditSink, adapter, runner };
}

function decision(component: ComponentRegistryEntry): AutomationDecision {
  return {
    id: "decision-001",
    ticketId: "ticket:BMS-1001",
    deviceId: "datto-device-accounting-pc-04",
    componentRegistryEntryId: component.id,
    outcome: "AUTO_ELIGIBLE_CONFIRM_CLIENT",
    confidence: 95,
    detectedIntent: "restart_print_spooler",
    reasons: ["test decision"],
    nextAction: "Dry-run test.",
    createdAt: "2026-06-05T14:00:00.000Z"
  };
}

function approval(component: ComponentRegistryEntry): ApprovalRequest {
  return {
    id: "approval-001",
    ticketId: "ticket:BMS-1001",
    accountId: "acct-001",
    contactId: "contact-001",
    deviceUid: "datto-device-accounting-pc-04",
    componentId: component.id,
    tokenHash: "hash",
    status: "approved",
    expiresAt: "2026-06-05T15:00:00.000Z",
    approvedAt: "2026-06-05T14:01:00.000Z",
    rejectedAt: null,
    requesterEmail: "alicia@example.test",
    approvalIp: "127.0.0.1",
    userAgent: "vitest",
    createdAt: "2026-06-05T14:00:00.000Z",
    updatedAt: "2026-06-05T14:01:00.000Z"
  };
}

function successfulRun(component: ComponentRegistryEntry, index: number): AutomationRun {
  return {
    id: `run-${index}`,
    ticketId: "ticket:BMS-1001",
    deviceUid: "datto-device-accounting-pc-04",
    componentId: component.id,
    approvalRequestId: `approval-${index}`,
    status: "succeeded",
    dattoJobUid: `dry-run-job-${index}`,
    startedAt: "2026-06-05T10:00:00.000Z",
    completedAt: "2026-06-05T10:01:00.000Z",
    resultSummary: "Existing run",
    errorMessage: null,
    createdAt: "2026-06-05T10:00:00.000Z",
    updatedAt: "2026-06-05T10:01:00.000Z"
  };
}

function config(executionEnabled: boolean): ApiConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 4310,
    logLevel: "error",
    databaseUrl: "file:./test.sqlite",
    bmsWebhookSecret: "secret",
    dattoRmmExecutionEnabled: executionEnabled,
    dattoRmmBaseUrl: "https://rmm.example.test",
    dattoRmmApiKey: "redacted-key",
    dattoRmmApiSecret: "redacted-secret",
    dattoRmmTimeoutMs: 1000,
    automationCallbackBaseUrl: "https://dispatch.example.test",
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
    adminSessionTtlMinutes: 480,
    webhookRateLimitPerMinute: 60,
    approvalRateLimitPerMinute: 30,
    adminRateLimitPerMinute: 120,
    globalAutomationDisabled: false,
    dryRunOnly: false
  };
}
