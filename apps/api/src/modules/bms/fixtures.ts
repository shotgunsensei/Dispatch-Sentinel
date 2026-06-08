import type { RawBmsTicket } from "./types.js";

export const mockBmsTickets: RawBmsTicket[] = [
  {
    id: "BMS-1001",
    title: "Printer will not print in accounting",
    details: "HP LaserJet on ACCOUNTING-PC-04 is stuck with jobs in queue.",
    account: { id: "acct-001", name: "Contoso Accounting" },
    contact: { id: "contact-001", name: "Alicia Smith", email: "alicia@example.test" },
    queue: "Helpdesk",
    priority: "Medium",
    status: "New",
    source: "portal",
    createdAt: "2026-06-05T13:00:00.000Z",
    updatedAt: "2026-06-05T13:00:00.000Z"
  },
  {
    id: "BMS-1002",
    title: "Please run GPUpdate",
    details: "User reports mapped drive policy has not applied on WS-FIN-22.",
    account: { id: "acct-002", name: "Northwind Finance" },
    contact: { id: "contact-002", name: "Ben Carter", email: "ben@example.test" },
    queue: "Helpdesk",
    priority: "Low",
    status: "New",
    source: "email",
    createdAt: "2026-06-05T13:05:00.000Z",
    updatedAt: "2026-06-05T13:05:00.000Z"
  },
  {
    id: "BMS-1003",
    title: "Computer slow",
    details: "Laptop takes a long time to open Outlook and browser tabs.",
    account: { id: "acct-003", name: "Fabrikam Legal" },
    contact: { id: "contact-003", name: "Cara Nguyen", email: "cara@example.test" },
    queue: "Helpdesk",
    priority: "Medium",
    status: "New",
    source: "portal",
    createdAt: "2026-06-05T13:10:00.000Z",
    updatedAt: "2026-06-05T13:10:00.000Z"
  },
  {
    id: "BMS-1004",
    title: "Password reset needed",
    details: "User cannot sign in and requests a password reset.",
    account: { id: "acct-004", name: "Tailspin Health" },
    contact: { id: "contact-004", name: "Devon Patel", email: "devon@example.test" },
    queue: "Helpdesk",
    priority: "High",
    status: "New",
    source: "phone",
    createdAt: "2026-06-05T13:15:00.000Z",
    updatedAt: "2026-06-05T13:15:00.000Z"
  },
  {
    id: "BMS-1005",
    title: "MFA reset",
    details: "New phone, needs authenticator reset.",
    account: { id: "acct-004", name: "Tailspin Health" },
    contact: { id: "contact-005", name: "Elliot Ross", email: "elliot@example.test" },
    queue: "Helpdesk",
    priority: "High",
    status: "New",
    source: "portal",
    createdAt: "2026-06-05T13:20:00.000Z",
    updatedAt: "2026-06-05T13:20:00.000Z"
  },
  {
    id: "BMS-1006",
    title: "Suspicious email",
    details: "User received a message asking for payroll changes and wants it checked.",
    account: { id: "acct-005", name: "Adventure Works" },
    contact: { id: "contact-006", name: "Fatima Jones", email: "fatima@example.test" },
    queue: "Security",
    priority: "High",
    status: "New",
    source: "email",
    createdAt: "2026-06-05T13:25:00.000Z",
    updatedAt: "2026-06-05T13:25:00.000Z"
  },
  {
    id: "BMS-1007",
    title: "Server down",
    details: "APP-SERVER-02 is unavailable and users cannot access the line-of-business app.",
    account: { id: "acct-006", name: "Wide World Importers" },
    contact: { id: "contact-007", name: "Grace Lee", email: "grace@example.test" },
    queue: "Infrastructure",
    priority: "Critical",
    status: "New",
    source: "phone",
    createdAt: "2026-06-05T13:30:00.000Z",
    updatedAt: "2026-06-05T13:30:00.000Z"
  },
  {
    id: "BMS-1008",
    title: "Computer broken",
    details: "It just does not work. Please fix.",
    account: { id: "acct-007", name: "Blue Yonder" },
    contact: { id: "contact-008", name: "Hannah Miles", email: "hannah@example.test" },
    queue: "Helpdesk",
    priority: "Medium",
    status: "New",
    source: "portal",
    createdAt: "2026-06-05T13:35:00.000Z",
    updatedAt: "2026-06-05T13:35:00.000Z"
  }
];
