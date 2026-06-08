import type { AutomationDecision, AutomationRun } from "@dispatch-sentinel/shared";
import { describe, expect, it, vi } from "vitest";
import { InMemoryAuditSink } from "../audit/audit-sink.js";
import { BmsWorkflowService, createBmsWorkflowConfig } from "./workflow.js";
import { MockBmsAdapter } from "./mock-bms-adapter.js";

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("BmsWorkflowService", () => {
  it.each([
    ["AUTO_ELIGIBLE_CONFIRM_CLIENT", "Awaiting Client Confirmation", "Automation Review"],
    ["ASK_CLIENT_TO_SELECT_DEVICE", "Auto-Triage", null],
    ["REQUIRE_TECH_APPROVAL", "Auto-Triage", "Level 2"],
    ["ESCALATE_TO_HUMAN", "Escalated", "Human Review"],
    ["DENY_AUTOMATION", "Escalated", "Human Review"]
  ] as const)("maps %s decisions to BMS actions", async (outcome, expectedStatus, expectedQueue) => {
    const fixture = createFixture();

    await fixture.workflow.applyDecision(decision(outcome));

    expect(fixture.bms.internalNotes).toHaveLength(outcome === "ASK_CLIENT_TO_SELECT_DEVICE" ? 2 : 1);
    expect(fixture.bms.statusUpdates.at(-1)?.status).toBe(expectedStatus);
    if (expectedQueue) {
      expect(fixture.bms.queueUpdates.at(-1)?.queue).toBe(expectedQueue);
    } else {
      expect(fixture.bms.queueUpdates).toHaveLength(0);
    }
  });

  it("does not duplicate notes for the same decision", async () => {
    const fixture = createFixture();
    const automationDecision = decision("AUTO_ELIGIBLE_CONFIRM_CLIENT");

    await fixture.workflow.applyDecision(automationDecision);
    await fixture.workflow.applyDecision(automationDecision);

    expect(fixture.bms.internalNotes).toHaveLength(1);
    expect(fixture.bms.statusUpdates).toHaveLength(1);
    expect(fixture.audit.list().some((event) => event.type === "bms.ticket.update_skipped")).toBe(true);
  });

  it("moves successful automation to QA", async () => {
    const fixture = createFixture();

    await fixture.workflow.applyAutomationResult(run(), "success", "Spooler restarted.");

    expect(fixture.bms.internalNotes.at(-1)?.note).toContain("completed successfully");
    expect(fixture.bms.statusUpdates.at(-1)?.status).toBe("Needs QA");
  });

  it("failure escalates to human review", async () => {
    const fixture = createFixture();

    await fixture.workflow.applyAutomationResult(run(), "failure", "Access denied.");

    expect(fixture.bms.internalNotes.at(-1)?.note).toContain("Escalating to human review");
    expect(fixture.bms.statusUpdates.at(-1)?.status).toBe("Escalated");
    expect(fixture.bms.queueUpdates.at(-1)?.queue).toBe("Human Review");
  });

  it("disabled BMS writes do not break evaluation", async () => {
    const fixture = createFixture(false);

    await fixture.workflow.applyDecision(decision("ESCALATE_TO_HUMAN"));
    await fixture.workflow.applyAutomationResult(run(), "failure", "Device offline.");

    expect(fixture.bms.internalNotes).toHaveLength(0);
    expect(fixture.bms.statusUpdates).toHaveLength(0);
    expect(fixture.audit.list().filter((event) => event.type === "bms.ticket.update_skipped")).toHaveLength(2);
  });
});

function createFixture(writesEnabled = true) {
  const bms = new MockBmsAdapter();
  const audit = new InMemoryAuditSink(logger);
  const workflow = new BmsWorkflowService(bms, config(writesEnabled), audit);
  return { bms, audit, workflow };
}

function config(writesEnabled: boolean) {
  return createBmsWorkflowConfig({
    writesEnabled,
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
    bmsPriorityUpdatesEnabled: false
  });
}

function decision(outcome: AutomationDecision["outcome"]): AutomationDecision {
  return {
    id: `decision-${outcome}`,
    ticketId: "ticket:BMS-1001",
    deviceId: outcome === "ASK_CLIENT_TO_SELECT_DEVICE" ? null : "datto-device-accounting-pc-04",
    componentRegistryEntryId: "component-restart-print-spooler",
    outcome,
    confidence: outcome === "DENY_AUTOMATION" ? 35 : 92,
    detectedIntent: outcome === "ESCALATE_TO_HUMAN" ? "unknown" : "restart_print_spooler",
    reasons: ["test reason"],
    nextAction: "test next action",
    createdAt: "2026-06-08T14:00:00.000Z"
  };
}

function run(): AutomationRun {
  return {
    id: "run-001",
    ticketId: "ticket:BMS-1001",
    deviceUid: "datto-device-accounting-pc-04",
    componentId: "component-restart-print-spooler",
    approvalRequestId: "approval-001",
    status: "running",
    dattoJobUid: "job-001",
    startedAt: "2026-06-08T14:00:00.000Z",
    completedAt: null,
    resultSummary: null,
    errorMessage: null,
    createdAt: "2026-06-08T14:00:00.000Z",
    updatedAt: "2026-06-08T14:00:00.000Z"
  };
}
