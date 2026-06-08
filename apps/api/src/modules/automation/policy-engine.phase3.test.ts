import type { ComponentRegistryEntry, Device, Ticket } from "@dispatch-sentinel/shared";
import { describe, expect, it } from "vitest";
import { ComponentRegistryRepository } from "../component-registry/registry.js";
import { classifyTicket } from "../classifier/rule-based-classifier.js";
import { evaluateTicketPolicy } from "./policy-engine.js";

describe("Phase 3 registry-controlled policy gates", () => {
  it("disabled component blocks automation", () => {
    const registry = new ComponentRegistryRepository();
    const disabled = registry.update("restart-print-spooler", { enabled: false });

    const decision = evaluateWithComponent(disabled);

    expect(decision.outcome).toBe("ESCALATE_TO_HUMAN");
    expect(decision.reasons).toContain("matching component registry entry is disabled");
  });

  it("missing component blocks automation", () => {
    const decision = evaluateWithComponent(null);

    expect(decision.outcome).toBe("ESCALATE_TO_HUMAN");
    expect(decision.reasons).toContain("no matching component registry entry found");
  });

  it("high-risk component requires tech approval", () => {
    const registry = new ComponentRegistryRepository();
    const highRisk = registry.update("restart-print-spooler", { riskLevel: "high" });

    const decision = evaluateWithComponent(highRisk);

    expect(decision.outcome).toBe("REQUIRE_TECH_APPROVAL");
  });

  it("server asset requires tech approval", () => {
    const registry = new ComponentRegistryRepository([
      {
        ...new ComponentRegistryRepository().get("restart-print-spooler")!,
        allowedAssetTypes: ["server"],
        requiresTechApproval: true
      }
    ]);

    const decision = evaluateTicketPolicy({
      ticket: printerTicket(),
      classification: classifyTicket(printerTicket(), { contactDeviceCorrelated: true, accountSiteMatched: true }),
      componentRegistryEntry: registry.findEnabledMatch("restart_print_spooler", "server"),
      deviceMatchStatus: "server",
      matchedDevice: { ...workstation(), kind: "server", assetType: "server" }
    });

    expect(decision.outcome).toBe("REQUIRE_TECH_APPROVAL");
  });

  it("low-risk workstation component can proceed to client confirmation", () => {
    const registry = new ComponentRegistryRepository();
    const decision = evaluateWithComponent(registry.findEnabledMatch("restart_print_spooler", "workstation"));

    expect(decision.outcome).toBe("AUTO_ELIGIBLE_CONFIRM_CLIENT");
  });
});

function evaluateWithComponent(componentRegistryEntry: ComponentRegistryEntry | null) {
  const ticket = printerTicket();

  return evaluateTicketPolicy({
    ticket,
    classification: classifyTicket(ticket, { contactDeviceCorrelated: true, accountSiteMatched: true }),
    componentRegistryEntry,
    deviceMatchStatus: "matched",
    matchedDevice: workstation()
  });
}

function printerTicket(): Ticket {
  return {
    id: "ticket:BMS-1001",
    externalBmsId: "BMS-1001",
    accountId: "acct-001",
    accountName: "Contoso",
    contactId: "contact-001",
    contactName: "Alicia",
    contactEmail: "alicia@example.test",
    title: "Printer spooler stuck on ACCOUNTING-PC-04",
    description: "Printer queue is stuck and needs print spooler restart.",
    queue: "Helpdesk",
    status: "new",
    priority: "Medium",
    source: "bms",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z"
  };
}

function workstation(): Device {
  return {
    id: "device:accounting-pc-04",
    accountId: "acct-001",
    dattoSiteUid: "site-001",
    siteLocationId: "loc-001",
    dattoDeviceUid: "device-001",
    hostname: "ACCOUNTING-PC-04",
    kind: "workstation",
    assetType: "workstation",
    lastLoggedInUser: "alicia",
    onlineStatus: "online",
    isAutomationEligible: true,
    lastSeenAt: "2026-06-05T00:00:00.000Z",
    serialNumber: "SERIAL-001",
    operatingSystem: "Windows 11 Pro",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z"
  };
}
