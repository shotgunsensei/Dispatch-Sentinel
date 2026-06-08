import type { AutomationRun } from "@dispatch-sentinel/shared";
import { describe, expect, it, vi } from "vitest";
import { InMemoryAuditSink } from "../audit/audit-sink.js";
import { MockBmsAdapter } from "../bms/mock-bms-adapter.js";
import { DryRunDattoRmmAdapter } from "../datto-rmm/dry-run-adapter.js";
import { AutomationRunRepository } from "./automation-runner.js";
import { AutomationJobPoller } from "./job-poller.js";

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("AutomationJobPoller", () => {
  it("missing callback escalates after timeout", async () => {
    const repository = new AutomationRunRepository();
    repository.create(activeRun());
    const audit = new InMemoryAuditSink(logger);
    const bms = new MockBmsAdapter();
    const poller = new AutomationJobPoller(repository, new DryRunDattoRmmAdapter(logger), audit, bms, 30);

    await poller.poll(new Date("2026-06-05T14:31:00.000Z"));

    const run = repository.get("run-001")!;
    expect(run.status).toBe("unknown");
    expect(run.errorMessage).toContain("Escalate to human review");
    expect(bms.internalNotes.at(-1)?.note).toContain("Escalating to human review");
  });
});

function activeRun(): AutomationRun {
  return {
    id: "run-001",
    ticketId: "ticket:BMS-1001",
    deviceUid: "datto-device-accounting-pc-04",
    componentId: "component-restart-print-spooler",
    approvalRequestId: "approval-001",
    status: "running",
    dattoJobUid: null,
    startedAt: "2026-06-05T14:00:00.000Z",
    completedAt: null,
    resultSummary: null,
    errorMessage: null,
    createdAt: "2026-06-05T14:00:00.000Z",
    updatedAt: "2026-06-05T14:00:00.000Z"
  };
}
