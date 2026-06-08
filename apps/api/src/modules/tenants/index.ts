export * from "./tenant-store.js";

export const tenantsModule = {
  name: "tenants",
  phase: "12",
  isolationRequired: true
} as const;
