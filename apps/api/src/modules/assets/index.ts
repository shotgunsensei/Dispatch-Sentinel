export * from "./types.js";
export * from "./fixtures.js";
export * from "./mock-datto-device-adapter.js";
export * from "./device-matcher.js";

export const assetsModule = {
  name: "assets",
  phase: "5",
  externalCallsEnabled: false
} as const;
