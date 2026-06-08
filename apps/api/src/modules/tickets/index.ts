export * from "./normalize.js";
export * from "./ticket-evaluation-service.js";

export const ticketsModule = {
  name: "tickets",
  phase: "2",
  externalCallsEnabled: false,
  intakeEnabled: true
} as const;
