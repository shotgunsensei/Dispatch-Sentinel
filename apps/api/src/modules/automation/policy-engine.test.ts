import type { ComponentRegistryEntry, Device, Ticket } from "@dispatch-sentinel/shared";
import { describe, expect, it } from "vitest";
import { mockBmsTickets } from "../bms/fixtures.js";
import { normalizeBmsTicket } from "../tickets/normalize.js";
import { evaluateTicketPolicy, type DeviceMatchStatus } from "./policy-engine.js";
import { classifyTicket, type ClassifierContext } from "../classifier/rule-based-classifier.js";

const approvedOutcomes = [
  "AUTO_ELIGIBLE_CONFIRM_CLIENT",
  "ASK_CLIENT_TO_SELECT_DEVICE",
  "REQUIRE_TECH_APPROVAL",
  "ESCALATE_TO_HUMAN",
  "DENY_AUTOMATION"
] as const;

describe("evaluateTicketPolicy", () => {
  it("marks a printer issue eligible for client confirmation when safe context is matched", () => {
    const decision = evaluateFixture("BMS-1001", {
      componentRegistryEntry: component("restart_print_spooler"),
      deviceMatchStatus: "matched",
      matchedDevice: workstation()
    });

    expect(decision.detectedIntent).toBe("restart_print_spooler");
    expect(decision.confidence).toBeGreaterThanOrEqual(90);
    expect(decision.outcome).toBe("AUTO_ELIGIBLE_CONFIRM_CLIENT");
    expect(decision.note).toContain("Detected intent: restart_print_spooler");
    expect(decision.note).toContain("Next action:");
  });

  it("marks a GPUpdate request eligible for client confirmation when safe context is matched", () => {
    const decision = evaluateFixture("BMS-1002", {
      componentRegistryEntry: component("run_gpupdate"),
      deviceMatchStatus: "matched",
      matchedDevice: workstation()
    });

    expect(decision.detectedIntent).toBe("run_gpupdate");
    expect(decision.outcome).toBe("AUTO_ELIGIBLE_CONFIRM_CLIENT");
  });

  it("escalates a vague issue", () => {
    const decision = evaluateFixture("BMS-1008", {
      classifierContext: { contactDeviceCorrelated: false, accountSiteMatched: true },
      componentRegistryEntry: null,
      deviceMatchStatus: "missing",
      matchedDevice: null
    });

    expect(decision.detectedIntent).toBe("unknown");
    expect(decision.outcome).toBe("ESCALATE_TO_HUMAN");
    expect(decision.reasons).toContain("unknown or unclear request cannot be safely automated");
  });

  it("denies password reset automation", () => {
    const decision = evaluateFixture("BMS-1004", {
      componentRegistryEntry: null,
      deviceMatchStatus: "missing",
      matchedDevice: null
    });

    expect(decision.detectedIntent).toBe("password_reset");
    expect(decision.outcome).toBe("DENY_AUTOMATION");
  });

  it("denies MFA reset automation", () => {
    const decision = evaluateFixture("BMS-1005", {
      componentRegistryEntry: null,
      deviceMatchStatus: "missing",
      matchedDevice: null
    });

    expect(decision.detectedIntent).toBe("mfa_reset");
    expect(decision.outcome).toBe("DENY_AUTOMATION");
  });

  it("escalates security issues", () => {
    const decision = evaluateFixture("BMS-1006", {
      componentRegistryEntry: null,
      deviceMatchStatus: "missing",
      matchedDevice: null
    });

    expect(decision.detectedIntent).toBe("security_incident");
    expect(decision.outcome).toBe("ESCALATE_TO_HUMAN");
  });

  it("requires technician review for server issues", () => {
    const decision = evaluateFixture("BMS-1007", {
      componentRegistryEntry: component("collect_workstation_diagnostics"),
      deviceMatchStatus: "server",
      matchedDevice: { ...workstation(), kind: "server" }
    });

    expect(decision.detectedIntent).toBe("server_issue");
    expect(decision.outcome).toBe("REQUIRE_TECH_APPROVAL");
  });

  it("escalates unknown issues", () => {
    const ticket = ticketFromPartial({
      title: "Need help",
      description: "Something is wrong but I am not sure what."
    });
    const decision = evaluate(ticket, {
      classifierContext: { contactDeviceCorrelated: false, accountSiteMatched: false },
      componentRegistryEntry: null,
      deviceMatchStatus: "missing",
      matchedDevice: null
    });

    expect(decision.detectedIntent).toBe("unknown");
    expect(decision.outcome).toBe("ESCALATE_TO_HUMAN");
  });

  it("applies confidence threshold behavior for otherwise safe tickets", () => {
    const highConfidence = evaluateFixture("BMS-1001", {
      componentRegistryEntry: component("restart_print_spooler"),
      deviceMatchStatus: "matched",
      matchedDevice: workstation()
    });
    const mediumConfidence = evaluate(ticketFromPartial({
      title: "Printer spooler stuck",
      description: "Please clear stuck print queue."
    }), {
      classifierContext: { contactDeviceCorrelated: false, accountSiteMatched: true },
      componentRegistryEntry: component("restart_print_spooler"),
      deviceMatchStatus: "ambiguous",
      matchedDevice: null
    });
    const lowConfidence = evaluate(ticketFromPartial({
      title: "Printer issue",
      description: "Printing is weird."
    }), {
      classifierContext: { contactDeviceCorrelated: false, accountSiteMatched: false },
      componentRegistryEntry: component("restart_print_spooler"),
      deviceMatchStatus: "missing",
      matchedDevice: null
    });

    expect(highConfidence.confidence).toBeGreaterThanOrEqual(90);
    expect(highConfidence.outcome).toBe("AUTO_ELIGIBLE_CONFIRM_CLIENT");
    expect(mediumConfidence.confidence).toBeGreaterThanOrEqual(70);
    expect(mediumConfidence.confidence).toBeLessThan(90);
    expect(mediumConfidence.outcome).toBe("ASK_CLIENT_TO_SELECT_DEVICE");
    expect(lowConfidence.confidence).toBeGreaterThanOrEqual(50);
    expect(lowConfidence.confidence).toBeLessThan(70);
    expect(lowConfidence.outcome).toBe("ESCALATE_TO_HUMAN");
  });

  it("always returns exactly one approved decision outcome", () => {
    const decisions = mockBmsTickets.map((ticket) =>
      evaluate(normalizeBmsTicket(ticket), {
        componentRegistryEntry: component("restart_print_spooler"),
        deviceMatchStatus: "matched",
        matchedDevice: workstation()
      })
    );

    for (const decision of decisions) {
      expect(approvedOutcomes).toContain(decision.outcome);
    }
  });
});

function evaluateFixture(
  ticketId: string,
  overrides: Partial<EvaluationOptions> = {}
) {
  const rawTicket = mockBmsTickets.find((ticket) => ticket.id === ticketId);
  if (!rawTicket) {
    throw new Error(`Missing fixture ${ticketId}`);
  }

  return evaluate(normalizeBmsTicket(rawTicket), overrides);
}

interface EvaluationOptions {
  classifierContext: ClassifierContext;
  componentRegistryEntry: ComponentRegistryEntry | null;
  deviceMatchStatus: DeviceMatchStatus;
  matchedDevice: Device | null;
}

function evaluate(ticket: Ticket, overrides: Partial<EvaluationOptions> = {}) {
  const options: EvaluationOptions = {
    classifierContext: { contactDeviceCorrelated: true, accountSiteMatched: true },
    componentRegistryEntry: component("collect_workstation_diagnostics"),
    deviceMatchStatus: "matched",
    matchedDevice: workstation(),
    ...overrides
  };
  const classification = classifyTicket(ticket, options.classifierContext);

  return evaluateTicketPolicy({
    ticket,
    classification,
    componentRegistryEntry: options.componentRegistryEntry,
    deviceMatchStatus: options.deviceMatchStatus,
    matchedDevice: options.matchedDevice
  });
}

function component(intent: string): ComponentRegistryEntry {
  return {
    id: `component:${intent}`,
    name: intent,
    slug: intent,
    description: `Mock ${intent}`,
    dattoComponentUid: `mock-${intent}`,
    category: intent,
    allowedIntents: [intent as ComponentRegistryEntry["allowedIntents"][number]],
    allowedAssetTypes: ["workstation"],
    riskLevel: "low",
    requiresClientConfirmation: true,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 2,
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z"
  };
}

function workstation(): Device {
  return {
    id: "device:ws-fin-22",
    accountId: "acct-001",
    dattoSiteUid: "site-001",
    siteLocationId: "loc-001",
    dattoDeviceUid: "device-001",
    hostname: "WS-FIN-22",
    kind: "workstation",
    assetType: "workstation",
    lastLoggedInUser: "ben",
    onlineStatus: "online",
    isAutomationEligible: true,
    lastSeenAt: "2026-06-05T00:00:00.000Z",
    serialNumber: "SERIAL-001",
    operatingSystem: "Windows 11 Pro",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z"
  };
}

function ticketFromPartial(fields: Pick<Ticket, "title" | "description">): Ticket {
  return {
    id: "ticket:test",
    externalBmsId: "BMS-TEST",
    accountId: "acct-test",
    accountName: "Test Account",
    contactId: null,
    contactName: null,
    contactEmail: null,
    title: fields.title,
    description: fields.description,
    queue: "Helpdesk",
    status: "new",
    priority: "Medium",
    source: "bms",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z"
  };
}
