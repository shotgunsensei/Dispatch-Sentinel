import { mockBmsTickets } from "./fixtures.js";
import type { BmsAdapter, BmsTicketFilters, RawBmsTicket } from "./types.js";

export class MockBmsAdapter implements BmsAdapter {
  private readonly tickets = new Map<string, RawBmsTicket>();
  readonly internalNotes: Array<{ ticketId: string; note: string }> = [];
  readonly publicNotes: Array<{ ticketId: string; note: string }> = [];
  readonly statusUpdates: Array<{ ticketId: string; status: string }> = [];
  readonly queueUpdates: Array<{ ticketId: string; queue: string }> = [];

  constructor(fixtures: RawBmsTicket[] = mockBmsTickets) {
    for (const ticket of fixtures) {
      this.tickets.set(ticket.id, structuredClone(ticket));
    }
  }

  async getTicketById(ticketId: string): Promise<RawBmsTicket | null> {
    const ticket = this.tickets.get(ticketId);
    return ticket ? structuredClone(ticket) : null;
  }

  async listNewTickets(filters: BmsTicketFilters = {}): Promise<RawBmsTicket[]> {
    const tickets = [...this.tickets.values()].filter((ticket) => {
      const statusMatches = filters.status ? ticket.status === filters.status : ticket.status === "New";
      const queueMatches = filters.queue ? ticket.queue === filters.queue : true;
      return statusMatches && queueMatches;
    });

    return tickets.slice(0, filters.limit ?? tickets.length).map((ticket) => structuredClone(ticket));
  }

  async addInternalNote(ticketId: string, note: string): Promise<void> {
    assertTicketExists(this.tickets, ticketId);
    this.internalNotes.push({ ticketId, note });
  }

  async addPublicNote(ticketId: string, note: string): Promise<void> {
    assertTicketExists(this.tickets, ticketId);
    this.publicNotes.push({ ticketId, note });
  }

  async updateTicketStatus(ticketId: string, status: string): Promise<void> {
    const ticket = assertTicketExists(this.tickets, ticketId);
    ticket.status = status;
    this.statusUpdates.push({ ticketId, status });
    ticket.updatedAt = new Date().toISOString();
  }

  async updateTicketQueue(ticketId: string, queue: string): Promise<void> {
    const ticket = assertTicketExists(this.tickets, ticketId);
    ticket.queue = queue;
    this.queueUpdates.push({ ticketId, queue });
    ticket.updatedAt = new Date().toISOString();
  }
}

function assertTicketExists(tickets: Map<string, RawBmsTicket>, ticketId: string): RawBmsTicket {
  const ticket = tickets.get(ticketId);
  if (!ticket) {
    throw new Error(`Mock BMS ticket not found: ${ticketId}`);
  }
  return ticket;
}
