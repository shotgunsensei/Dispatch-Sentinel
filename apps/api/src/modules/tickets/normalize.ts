import type { Ticket, TicketStatus } from "@dispatch-sentinel/shared";
import type { RawBmsTicket } from "../bms/types.js";

const statusMap: Record<string, TicketStatus> = {
  new: "new",
  open: "open",
  pending: "pending_client",
  "pending client": "pending_client",
  "pending approval": "pending_approval",
  resolved: "resolved",
  closed: "closed"
};

export function normalizeBmsTicket(rawTicket: RawBmsTicket): Ticket {
  const now = new Date().toISOString();

  return {
    id: `ticket:${rawTicket.id}`,
    externalBmsId: rawTicket.id,
    accountId: rawTicket.account?.id ?? "unknown-account",
    accountName: rawTicket.account?.name ?? null,
    contactId: rawTicket.contact?.id ?? null,
    contactName: rawTicket.contact?.name ?? null,
    contactEmail: rawTicket.contact?.email ?? null,
    title: rawTicket.title?.trim() || "Untitled BMS ticket",
    description: (rawTicket.details ?? rawTicket.body ?? "").trim(),
    queue: rawTicket.queue ?? null,
    status: normalizeStatus(rawTicket.status),
    priority: rawTicket.priority ?? null,
    source: "bms",
    createdAt: rawTicket.createdAt ?? now,
    updatedAt: rawTicket.updatedAt ?? rawTicket.createdAt ?? now
  };
}

function normalizeStatus(status: string | null | undefined): TicketStatus {
  if (!status) {
    return "new";
  }

  return statusMap[status.trim().toLowerCase()] ?? "open";
}
