import { describe, expect, it } from "vitest";
import { mockBmsTickets } from "../bms/fixtures.js";
import { MockBmsAdapter } from "../bms/mock-bms-adapter.js";
import { normalizeBmsTicket } from "./normalize.js";
import { TicketEvaluationService } from "./ticket-evaluation-service.js";

describe("TicketEvaluationService", () => {
  it("can write a generated internal note through the mock BMS adapter only", async () => {
    const adapter = new MockBmsAdapter();
    const service = new TicketEvaluationService(adapter);
    const ticket = normalizeBmsTicket(mockBmsTickets[0]!);

    const decision = await service.evaluate({
      ticket,
      classifierContext: { contactDeviceCorrelated: true, accountSiteMatched: true },
      componentRegistryEntry: {
        id: "component:restart_print_spooler",
        name: "Restart Print Spooler",
        slug: "restart-print-spooler",
        description: "Restart print spooler.",
        dattoComponentUid: "mock-spooler",
        category: "restart_print_spooler",
        allowedIntents: ["restart_print_spooler"],
        allowedAssetTypes: ["workstation"],
        riskLevel: "low",
        requiresClientConfirmation: true,
        requiresTechApproval: false,
        enabled: true,
        maxRunsPerDevicePerDay: 2,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      },
      deviceMatchStatus: "matched",
      matchedDevice: {
        id: "device:accounting-pc-04",
        accountId: ticket.accountId,
        dattoSiteUid: "site-001",
        siteLocationId: "loc-001",
        dattoDeviceUid: "device-001",
        hostname: "ACCOUNTING-PC-04",
        kind: "workstation",
        assetType: "workstation",
        lastLoggedInUser: "alicia",
        onlineStatus: "online",
        isAutomationEligible: true,
        lastSeenAt: ticket.createdAt,
        serialNumber: "SERIAL-001",
        operatingSystem: "Windows 11 Pro",
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      },
      writeInternalNote: true
    });

    expect(decision.outcome).toBe("AUTO_ELIGIBLE_CONFIRM_CLIENT");
    expect(adapter.internalNotes).toHaveLength(1);
    expect(adapter.internalNotes[0]).toMatchObject({
      ticketId: "BMS-1001"
    });
    expect(adapter.internalNotes[0]?.note).toContain("Decision: AUTO_ELIGIBLE_CONFIRM_CLIENT");
    expect(adapter.internalNotes[0]?.note).toContain("do not execute in Phase 5");
  });
});
