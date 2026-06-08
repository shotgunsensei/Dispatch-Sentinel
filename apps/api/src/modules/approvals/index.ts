export * from "./approval-service.js";

export const approvalsModule = {
  name: "approvals",
  phase: "5",
  executionAuthority: false
} as const;
