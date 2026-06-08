export * from "./policy-engine.js";
export * from "./automation-runner.js";
export * from "./result-handler.js";
export * from "./job-poller.js";

export const automationModule = {
  name: "automation",
  phase: "7",
  executionEnabled: false
} as const;
