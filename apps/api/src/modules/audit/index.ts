export * from "./audit-sink.js";

export const auditModule = {
  name: "audit",
  phase: "1",
  requiredForFutureExecution: true
} as const;
