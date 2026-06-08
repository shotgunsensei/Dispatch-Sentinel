export interface BmsTicketFilters {
  queue?: string;
  status?: string;
  limit?: number;
}

export interface RawBmsTicket {
  id: string;
  title?: string | null;
  details?: string | null;
  body?: string | null;
  account?: {
    id?: string | null;
    name?: string | null;
  } | null;
  contact?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  queue?: string | null;
  priority?: string | null;
  status?: string | null;
  source?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface BmsAdapter {
  getTicketById(ticketId: string): Promise<RawBmsTicket | null>;
  listNewTickets(filters?: BmsTicketFilters): Promise<RawBmsTicket[]>;
  addInternalNote(ticketId: string, note: string): Promise<void>;
  addPublicNote?(ticketId: string, note: string): Promise<void>;
  updateTicketStatus(ticketId: string, status: string): Promise<void>;
  updateTicketQueue(ticketId: string, queue: string): Promise<void>;
}
