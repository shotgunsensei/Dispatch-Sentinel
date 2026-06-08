import type { ComponentRegistryEntry, ComponentRiskLevel, DeviceKind, TicketIntent } from "@dispatch-sentinel/shared";

export interface ComponentRegistryUpdate {
  enabled?: boolean;
  allowedIntents?: TicketIntent[];
  riskLevel?: ComponentRiskLevel;
  requiresClientConfirmation?: boolean;
  requiresTechApproval?: boolean;
}

const allowedRiskLevels = new Set<ComponentRiskLevel>(["low", "medium", "high", "critical"]);
const allowedAssetTypes = new Set<DeviceKind>(["workstation", "server", "network", "unknown"]);
const allowedIntents = new Set<TicketIntent>([
  "restart_print_spooler",
  "run_gpupdate",
  "collect_workstation_diagnostics",
  "clear_safe_temp_files",
  "restart_user_app_process",
  "reboot_workstation",
  "repair_mapped_drive",
  "restart_scanner_wia",
  "restart_vpn_client",
  "collect_vpn_diagnostics",
  "browser_cache_cleanup",
  "teams_office_diagnostics",
  "clear_stuck_print_jobs",
  "password_reset",
  "mfa_reset",
  "security_incident",
  "server_issue",
  "unknown"
]);

const now = "2026-06-05T00:00:00.000Z";

export const mvpComponentRegistrySeed: ComponentRegistryEntry[] = [
  {
    id: "component-restart-print-spooler",
    name: "Restart Print Spooler",
    slug: "restart-print-spooler",
    description: "Restart the Windows Print Spooler service on an approved workstation.",
    dattoComponentUid: "mock-datto-component-restart-print-spooler",
    category: "print",
    allowedIntents: ["restart_print_spooler"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "low",
    requiresClientConfirmation: true,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 2,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-run-gpupdate",
    name: "Run GPUpdate",
    slug: "run-gpupdate",
    description: "Run GPUpdate on an approved workstation.",
    dattoComponentUid: "mock-datto-component-run-gpupdate",
    category: "policy",
    allowedIntents: ["run_gpupdate"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "low",
    requiresClientConfirmation: true,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 2,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-collect-workstation-diagnostics",
    name: "Collect Workstation Diagnostics",
    slug: "collect-workstation-diagnostics",
    description: "Collect safe workstation diagnostics for technician review.",
    dattoComponentUid: "mock-datto-component-collect-workstation-diagnostics",
    category: "diagnostics",
    allowedIntents: ["collect_workstation_diagnostics"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "low",
    requiresClientConfirmation: false,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 3,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-clear-safe-temp-files",
    name: "Clear Safe Temp Files",
    slug: "clear-safe-temp-files",
    description: "Clear approved safe temporary file locations on a workstation.",
    dattoComponentUid: "mock-datto-component-clear-safe-temp-files",
    category: "cleanup",
    allowedIntents: ["clear_safe_temp_files"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "medium",
    requiresClientConfirmation: true,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 1,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-restart-user-app-process",
    name: "Restart User App Process",
    slug: "restart-user-app-process",
    description: "Restart a known user-level application process on a workstation.",
    dattoComponentUid: "mock-datto-component-restart-user-app-process",
    category: "app_process",
    allowedIntents: ["restart_user_app_process"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "medium",
    requiresClientConfirmation: true,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 2,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-reboot-workstation",
    name: "Reboot Workstation",
    slug: "reboot-workstation",
    description: "Reboot an approved workstation after explicit confirmation.",
    dattoComponentUid: "mock-datto-component-reboot-workstation",
    category: "reboot",
    allowedIntents: ["reboot_workstation"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "medium",
    requiresClientConfirmation: true,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 1,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-repair-mapped-drive",
    name: "Repair Mapped Drive",
    slug: "repair-mapped-drive",
    description: "Repair mapped drive connections on an approved workstation without changing permissions.",
    dattoComponentUid: "mock-datto-component-repair-mapped-drive",
    category: "mapped_drive",
    allowedIntents: ["repair_mapped_drive"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "low",
    requiresClientConfirmation: true,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 2,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-restart-scanner-wia",
    name: "Restart Scanner WIA Services",
    slug: "restart-scanner-wia",
    description: "Restart scanner-related Windows Image Acquisition services on an approved workstation.",
    dattoComponentUid: "mock-datto-component-restart-scanner-wia",
    category: "scanner",
    allowedIntents: ["restart_scanner_wia"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "low",
    requiresClientConfirmation: true,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 2,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-restart-vpn-client",
    name: "Restart Known VPN Client Service",
    slug: "restart-vpn-client",
    description: "Restart a known approved VPN client service on an approved workstation.",
    dattoComponentUid: "mock-datto-component-restart-vpn-client",
    category: "vpn",
    allowedIntents: ["restart_vpn_client"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "medium",
    requiresClientConfirmation: true,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 1,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-collect-vpn-diagnostics",
    name: "Collect VPN Diagnostics",
    slug: "collect-vpn-diagnostics",
    description: "Collect VPN client diagnostics for technician review without changing VPN configuration.",
    dattoComponentUid: "mock-datto-component-collect-vpn-diagnostics",
    category: "vpn",
    allowedIntents: ["collect_vpn_diagnostics"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "low",
    requiresClientConfirmation: false,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 3,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-browser-cache-cleanup",
    name: "Browser Cache Cleanup",
    slug: "browser-cache-cleanup",
    description: "Clear safe browser cache locations without touching saved passwords or credentials.",
    dattoComponentUid: "mock-datto-component-browser-cache-cleanup",
    category: "browser",
    allowedIntents: ["browser_cache_cleanup"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "medium",
    requiresClientConfirmation: true,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 1,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-teams-office-diagnostics",
    name: "Teams Office Basic Diagnostics",
    slug: "teams-office-diagnostics",
    description: "Collect basic Teams and Office diagnostics without account or licensing changes.",
    dattoComponentUid: "mock-datto-component-teams-office-diagnostics",
    category: "office",
    allowedIntents: ["teams_office_diagnostics"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "low",
    requiresClientConfirmation: false,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 3,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "component-clear-stuck-print-jobs",
    name: "Clear Stuck Print Jobs",
    slug: "clear-stuck-print-jobs",
    description: "Clear stuck local print jobs on an approved workstation after confirmation.",
    dattoComponentUid: "mock-datto-component-clear-stuck-print-jobs",
    category: "print",
    allowedIntents: ["clear_stuck_print_jobs"],
    allowedAssetTypes: ["workstation"],
    riskLevel: "medium",
    requiresClientConfirmation: true,
    requiresTechApproval: false,
    enabled: true,
    maxRunsPerDevicePerDay: 1,
    createdAt: now,
    updatedAt: now
  }
];

export class ComponentRegistryRepository {
  private readonly entries = new Map<string, ComponentRegistryEntry>();

  constructor(seed: ComponentRegistryEntry[] = mvpComponentRegistrySeed) {
    for (const entry of seed) {
      const validated = validateComponentRegistryEntry(entry);
      this.entries.set(validated.id, structuredClone(validated));
    }
  }

  list(): ComponentRegistryEntry[] {
    return [...this.entries.values()].map((entry) => structuredClone(entry));
  }

  get(idOrSlug: string): ComponentRegistryEntry | null {
    const direct = this.entries.get(idOrSlug);
    if (direct) {
      return structuredClone(direct);
    }

    const bySlug = [...this.entries.values()].find((entry) => entry.slug === idOrSlug);
    return bySlug ? structuredClone(bySlug) : null;
  }

  findEnabledMatch(intent: TicketIntent, assetType: DeviceKind): ComponentRegistryEntry | null {
    const entry = [...this.entries.values()].find(
      (candidate) =>
        candidate.enabled &&
        candidate.allowedIntents.includes(intent) &&
        candidate.allowedAssetTypes.includes(assetType)
    );
    return entry ? structuredClone(entry) : null;
  }

  update(idOrSlug: string, update: ComponentRegistryUpdate): ComponentRegistryEntry | null {
    const existing = this.get(idOrSlug);
    if (!existing) {
      return null;
    }

    const updated = validateComponentRegistryEntry({
      ...existing,
      ...update,
      updatedAt: new Date().toISOString()
    });
    this.entries.set(updated.id, structuredClone(updated));
    return structuredClone(updated);
  }
}

export function validateComponentRegistryEntry(entry: ComponentRegistryEntry): ComponentRegistryEntry {
  if (!allowedRiskLevels.has(entry.riskLevel)) {
    throw new Error("risk_level must be one of low, medium, high, or critical.");
  }

  if (entry.allowedIntents.length === 0 || entry.allowedIntents.some((intent) => !allowedIntents.has(intent))) {
    throw new Error("allowed_intents must contain at least one supported classifier intent.");
  }

  if (entry.allowedAssetTypes.length === 0 || entry.allowedAssetTypes.some((assetType) => !allowedAssetTypes.has(assetType))) {
    throw new Error("allowed_asset_types must contain at least one supported asset type.");
  }

  if (entry.allowedAssetTypes.includes("server") && !entry.requiresTechApproval) {
    throw new Error("server asset type must require tech approval.");
  }

  if (entry.riskLevel === "critical" && (!entry.requiresTechApproval || entry.requiresClientConfirmation)) {
    throw new Error("critical risk cannot be auto-executable.");
  }

  if (!Number.isInteger(entry.maxRunsPerDevicePerDay) || entry.maxRunsPerDevicePerDay < 0) {
    throw new Error("max_runs_per_device_per_day must be a non-negative integer.");
  }

  return entry;
}
