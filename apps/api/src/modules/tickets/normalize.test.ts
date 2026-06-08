import { describe, expect, it } from "vitest";
import { normalizeBmsTicket } from "./normalize.js";

describe("normalizeBmsTicket", () => {
  it("handles missing optional fields while preserving core ticket data", () => {
    const ticket = normalizeBmsTicket({
      id: "BMS-MISSING",
      title: "Computer slow",
      body: "User reports the device is slow.",
      status: null
    });

    expect(ticket).toMatchObject({
      id: "ticket:BMS-MISSING",
      externalBmsId: "BMS-MISSING",
      title: "Computer slow",
      description: "User reports the device is slow.",
      accountId: "unknown-account",
      accountName: null,
      contactId: null,
      contactName: null,
      contactEmail: null,
      queue: null,
      priority: null,
      status: "new",
      source: "bms"
    });
    expect(ticket.createdAt).toBeTruthy();
  });
});
