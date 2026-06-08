import { describe, expect, it } from "vitest";
import { mockBmsTickets } from "./fixtures.js";
import { MockBmsAdapter } from "./mock-bms-adapter.js";

describe("MockBmsAdapter", () => {
  it("loads all required sample tickets", async () => {
    const adapter = new MockBmsAdapter();
    const tickets = await adapter.listNewTickets();
    const titles = tickets.map((ticket) => ticket.title);

    expect(mockBmsTickets).toHaveLength(8);
    expect(titles).toEqual(
      expect.arrayContaining([
        "Printer will not print in accounting",
        "Please run GPUpdate",
        "Computer slow",
        "Password reset needed",
        "MFA reset",
        "Suspicious email",
        "Server down",
        "Computer broken"
      ])
    );
  });

  it("fetches tickets by BMS ticket ID from local fixtures", async () => {
    const adapter = new MockBmsAdapter();

    await expect(adapter.getTicketById("BMS-1001")).resolves.toMatchObject({
      id: "BMS-1001",
      queue: "Helpdesk"
    });
  });
});
