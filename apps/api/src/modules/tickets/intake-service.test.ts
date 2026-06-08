import { describe, expect, it, vi } from "vitest";
import { InMemoryAuditSink } from "../audit/audit-sink.js";
import { MockBmsAdapter } from "../bms/mock-bms-adapter.js";
import { TicketIntakeService } from "./intake-service.js";

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("TicketIntakeService idempotency", () => {
  it("duplicate webhook does not duplicate work", async () => {
    const audit = new InMemoryAuditSink(logger);
    const service = new TicketIntakeService(new MockBmsAdapter(), audit, logger);

    const first = await service.enqueueTicketEvaluation("BMS-1001", "ticket.created");
    const duplicate = await service.enqueueTicketEvaluation("BMS-1001", "ticket.created");

    expect(first.id).toBe(duplicate.id);
    expect(service.listJobs()).toHaveLength(1);
    expect(audit.list().filter((event) => event.type === "bms.ticket.fetched")).toHaveLength(1);
    expect(audit.list().some((event) => event.type === "bms.webhook.duplicate_skipped")).toBe(true);
  });
});
