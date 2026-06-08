import { describe, expect, it } from "vitest";
import { ComponentRegistryRepository } from "../component-registry/registry.js";
import { classifyTicket } from "../classifier/rule-based-classifier.js";
import { matchDeviceForTicket } from "../assets/device-matcher.js";
import { mockDattoDevices } from "../assets/fixtures.js";
import { evaluateTicketPolicy } from "./policy-engine.js";
import type { Ticket } from "@dispatch-sentinel/shared";

describe("Phase 4 device-match policy integration", () => {
  it("allows high-confidence safe device match to proceed to client confirmation", () => {
    const ticket = printerTicket("Printer issue on ACCOUNTING-PC-04");
    const match = matchDeviceForTicket({ ticket, devices: mockDattoDevices, siteLocationId: "loc-contoso-main" });
    const decision = evaluate(ticket, match);

    expect(match.outcome).toBe("single_high_confidence_match");
    expect(decision.outcome).toBe("AUTO_ELIGIBLE_CONFIRM_CLIENT");
  });

  it("maps multiple matches to ASK_CLIENT_TO_SELECT_DEVICE", () => {
    const ticket = {
      ...printerTicket("Printer issue on BLUE-PC"),
      accountId: "acct-007",
      contactName: "Hannah Miles",
      contactEmail: "hannah@example.test"
    };
    const match = matchDeviceForTicket({ ticket, devices: mockDattoDevices, siteLocationId: "loc-blue-main" });
    const decision = evaluate(ticket, match);

    expect(match.outcome).toBe("multiple_possible_matches");
    expect(decision.outcome).toBe("ASK_CLIENT_TO_SELECT_DEVICE");
  });

  it("maps no match to human escalation", () => {
    const ticket = { ...printerTicket("Printer issue"), accountId: "acct-missing", contactEmail: null, contactName: null };
    const match = matchDeviceForTicket({ ticket, devices: mockDattoDevices });
    const decision = evaluate(ticket, match);

    expect(match.outcome).toBe("no_match");
    expect(decision.outcome).toBe("ESCALATE_TO_HUMAN");
  });

  it("maps server match to technician approval", () => {
    const ticket = {
      ...printerTicket("Printer issue on APP-SERVER-02"),
      accountId: "acct-006",
      contactEmail: "grace@example.test",
      contactName: "Grace Lee"
    };
    const match = matchDeviceForTicket({ ticket, devices: mockDattoDevices, siteLocationId: "loc-wideworld-main" });
    const decision = evaluate(ticket, match);

    expect(match.outcome).toBe("unsafe_match");
    expect(decision.outcome).toBe("REQUIRE_TECH_APPROVAL");
  });
});

function evaluate(ticket: Ticket, match: ReturnType<typeof matchDeviceForTicket>) {
  const registry = new ComponentRegistryRepository();
  const status =
    match.outcome === "single_high_confidence_match"
      ? "matched"
      : match.outcome === "multiple_possible_matches"
        ? "ambiguous"
        : match.outcome === "unsafe_match"
          ? "server"
          : "missing";

  return evaluateTicketPolicy({
    ticket,
    classification: classifyTicket(ticket, { contactDeviceCorrelated: true, accountSiteMatched: true }),
    componentRegistryEntry: registry.findEnabledMatch("restart_print_spooler", match.matchedDevice?.assetType ?? "workstation"),
    deviceMatchStatus: status,
    matchedDevice: match.matchedDevice,
    deviceMatchResult: match
  });
}

function printerTicket(title: string): Ticket {
  return {
    id: "ticket:BMS-1001",
    externalBmsId: "BMS-1001",
    accountId: "acct-001",
    accountName: "Contoso",
    contactId: "contact-001",
    contactName: "Alicia Smith",
    contactEmail: "alicia@example.test",
    title,
    description: "Print queue is stuck and needs print spooler restart.",
    queue: "Helpdesk",
    status: "new",
    priority: "Medium",
    source: "bms",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z"
  };
}
