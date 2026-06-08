import type { AutomationRun } from "@dispatch-sentinel/shared";
import { describe, expect, it, vi } from "vitest";
import { InMemoryAuditSink } from "../audit/audit-sink.js";
import { MockBmsAdapter } from "../bms/mock-bms-adapter.js";
import { DryRunDattoRmmAdapter } from "../datto-rmm/dry-run-adapter.js";
import { AutomationRunRepository } from "./automation-runner.js";
import { AutomationResultHandler } from "./result-handler.js";

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("AutomationResultHandler", () => {
  it("callback success updates run and writes note", async () => {
    const fixture = createFixture();
    const updated = await fixture.handler.handleCallback({
      automationRunId: "run-001",
      ticketId: "ticket:BMS-1001",
      hostname: "ACCOUNTING-PC-04",
      success: true,
      message: "Spooler restarted.",
      details: "Service restart completed.",
      timestamp: "2026-06-05T14:10:00.000Z"
    });

    expect(updated.status).toBe("completed");
    expect(updated.resultSummary).toBe("Spooler restarted.");
    expect(fixture.bms.internalNotes.at(-1)?.note).toContain("Job completed successfully");
  });

  it("callback failure escalates to human review", async () => {
    const fixture = createFixture();
    const updated = await fixture.handler.handleCallback({
      automationRunId: "run-001",
      ticketId: "ticket:BMS-1001",
      hostname: "ACCOUNTING-PC-04",
      success: false,
      message: "Spooler restart failed.",
      details: "Access denied.",
      timestamp: "2026-06-05T14:10:00.000Z"
    });

    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("Access denied.");
    expect(fixture.bms.internalNotes.at(-1)?.note).toContain("requires human review");
  });

  it("device mismatch creates audit warning", async () => {
    const fixture = createFixture();
    await fixture.handler.handleCallback({
      automationRunId: "run-001",
      ticketId: "ticket:BMS-1001",
      hostname: "WRONG-HOST",
      success: true,
      message: "Done.",
      details: "",
      timestamp: "2026-06-05T14:10:00.000Z"
    });

    expect(fixture.audit.list().some((event) => event.type === "automation.callback.device_mismatch")).toBe(true);
  });
});

function createFixture() {
  const repository = new AutomationRunRepository();
  repository.create(activeRun());
  const audit = new InMemoryAuditSink(logger);
  const bms = new MockBmsAdapter();
  const handler = new AutomationResultHandler(repository, new DryRunDattoRmmAdapter(logger), audit, bms);
  return { repository, audit, bms, handler };
}

function activeRun(): AutomationRun {
  return {
    id: "run-001",
    ticketId: "ticket:BMS-1001",
    deviceUid: "datto-device-accounting-pc-04",
    componentId: "component-restart-print-spooler",
    approvalRequestId: "approval-001",
    status: "running",
    dattoJobUid: "job-001",
    startedAt: "2026-06-05T14:00:00.000Z",
    completedAt: null,
    resultSummary: null,
    errorMessage: null,
    createdAt: "2026-06-05T14:00:00.000Z",
    updatedAt: "2026-06-05T14:00:00.000Z"
  };
}
