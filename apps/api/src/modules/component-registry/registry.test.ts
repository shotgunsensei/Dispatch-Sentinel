import { describe, expect, it } from "vitest";
import { ComponentRegistryRepository, mvpComponentRegistrySeed, validateComponentRegistryEntry } from "./registry.js";

describe("ComponentRegistryRepository", () => {
  it("seeds the six MVP components", () => {
    const registry = new ComponentRegistryRepository();

    expect(registry.list().map((entry) => entry.name)).toEqual([
      "Restart Print Spooler",
      "Run GPUpdate",
      "Collect Workstation Diagnostics",
      "Clear Safe Temp Files",
      "Restart User App Process",
      "Reboot Workstation"
    ]);
  });

  it("matches only enabled components by intent and asset type", () => {
    const registry = new ComponentRegistryRepository();

    expect(registry.findEnabledMatch("restart_print_spooler", "workstation")?.slug).toBe("restart-print-spooler");

    registry.update("restart-print-spooler", { enabled: false });

    expect(registry.findEnabledMatch("restart_print_spooler", "workstation")).toBeNull();
  });

  it("validates risk levels", () => {
    expect(() =>
      validateComponentRegistryEntry({
        ...mvpComponentRegistrySeed[0]!,
        riskLevel: "invalid-risk" as never
      })
    ).toThrow("risk_level must be one of low, medium, high, or critical");
  });

  it("requires tech approval for server asset types", () => {
    expect(() =>
      validateComponentRegistryEntry({
        ...mvpComponentRegistrySeed[0]!,
        allowedAssetTypes: ["server"],
        requiresTechApproval: false
      })
    ).toThrow("server asset type must require tech approval");
  });

  it("prevents critical risk from being auto-executable", () => {
    expect(() =>
      validateComponentRegistryEntry({
        ...mvpComponentRegistrySeed[0]!,
        riskLevel: "critical",
        requiresTechApproval: false
      })
    ).toThrow("critical risk cannot be auto-executable");
  });
});
