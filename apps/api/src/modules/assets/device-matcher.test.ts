import { describe, expect, it } from "vitest";
import { mockDattoDevices } from "./fixtures.js";
import { matchDeviceForTicket } from "./device-matcher.js";
import type { Ticket } from "@dispatch-sentinel/shared";

describe("matchDeviceForTicket", () => {
  it("returns a high-confidence exact hostname match", () => {
    const result = matchDeviceForTicket({
      ticket: ticket({
        accountId: "acct-001",
        contactName: "Alicia Smith",
        contactEmail: "alicia@example.test",
        title: "Printer issue on ACCOUNTING-PC-04",
        description: "Print queue is stuck."
      }),
      siteLocationId: "loc-contoso-main",
      devices: mockDattoDevices
    });

    expect(result.outcome).toBe("single_high_confidence_match");
    expect(result.confidence).toBeGreaterThanOrEqual(85);
    expect(result.matchedDevice?.hostname).toBe("ACCOUNTING-PC-04");
    expect(result.reasons).toEqual(expect.arrayContaining(["exact hostname match: +40", "contact matches last logged-in user: +25"]));
  });

  it("matches contact email to last logged-in user", () => {
    const result = matchDeviceForTicket({
      ticket: ticket({
        accountId: "acct-002",
        contactName: "Ben Carter",
        contactEmail: "ben@example.test",
        title: "Please run GPUpdate",
        description: "Mapped drive policy is missing."
      }),
      siteLocationId: "loc-northwind-main",
      devices: mockDattoDevices
    });

    expect(result.outcome).toBe("multiple_possible_matches");
    expect(result.confidence).toBeGreaterThanOrEqual(60);
    expect(result.matchedDevice).toBeNull();
    expect(result.candidates[0]?.device.hostname).toBe("WS-FIN-22");
  });

  it("returns multiple possible matches for similar devices", () => {
    const result = matchDeviceForTicket({
      ticket: ticket({
        accountId: "acct-007",
        contactName: "Hannah Miles",
        contactEmail: "hannah@example.test",
        title: "Computer broken",
        description: "Blue PC is not working."
      }),
      siteLocationId: "loc-blue-main",
      devices: mockDattoDevices
    });

    expect(result.outcome).toBe("multiple_possible_matches");
    expect(result.matchedDevice).toBeNull();
    expect(result.candidates.filter((candidate) => candidate.device.hostname.startsWith("BLUE-PC"))).toHaveLength(2);
  });

  it("returns no match when device context is too weak", () => {
    const result = matchDeviceForTicket({
      ticket: ticket({
        accountId: "acct-nope",
        contactName: null,
        contactEmail: null,
        title: "Need help",
        description: "Something is wrong."
      }),
      devices: mockDattoDevices
    });

    expect(result.outcome).toBe("no_match");
    expect(result.confidence).toBe(0);
    expect(result.matchedDevice).toBeNull();
  });

  it("returns unsafe match for server devices", () => {
    const result = matchDeviceForTicket({
      ticket: ticket({
        accountId: "acct-006",
        contactName: "Grace Lee",
        contactEmail: "grace@example.test",
        title: "APP-SERVER-02 is down",
        description: "Line-of-business app is unavailable."
      }),
      siteLocationId: "loc-wideworld-main",
      devices: mockDattoDevices
    });

    expect(result.outcome).toBe("unsafe_match");
    expect(result.matchedDevice?.assetType).toBe("server");
    expect(result.reasons).toContain("server match requires technician approval");
  });

  it("does not award recent-online points to offline devices", () => {
    const result = matchDeviceForTicket({
      ticket: ticket({
        accountId: "acct-003",
        contactName: "Cara Nguyen",
        contactEmail: "cara@example.test",
        title: "Computer slow",
        description: "Laptop is very slow."
      }),
      siteLocationId: "loc-fabrikam-main",
      devices: mockDattoDevices
    });

    expect(result.outcome).toBe("multiple_possible_matches");
    expect(result.candidates[0]?.device.hostname).toBe("LAPTOP-CARA-01");
    expect(result.candidates[0]?.reasons).not.toContain("online recently: +10");
  });
});

function ticket(overrides: Partial<Ticket>): Ticket {
  return {
    id: "ticket:test",
    externalBmsId: "BMS-TEST",
    accountId: "acct-001",
    accountName: "Test Account",
    contactId: null,
    contactName: null,
    contactEmail: null,
    title: "Test ticket",
    description: "Test details",
    queue: "Helpdesk",
    status: "new",
    priority: "Medium",
    source: "bms",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides
  };
}
