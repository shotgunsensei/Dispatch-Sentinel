export type TicketStatus = "new" | "open" | "pending_client" | "pending_approval" | "resolved" | "closed";

export type DeviceKind = "workstation" | "server" | "network" | "unknown";

export type ComponentRiskLevel = "low" | "medium" | "high" | "critical";

export type AutomationDecisionOutcome =
  | "AUTO_ELIGIBLE_CONFIRM_CLIENT"
  | "ASK_CLIENT_TO_SELECT_DEVICE"
  | "REQUIRE_TECH_APPROVAL"
  | "ESCALATE_TO_HUMAN"
  | "DENY_AUTOMATION";

export type TicketIntent =
  | "restart_print_spooler"
  | "run_gpupdate"
  | "collect_workstation_diagnostics"
  | "clear_safe_temp_files"
  | "restart_user_app_process"
  | "reboot_workstation"
  | "password_reset"
  | "mfa_reset"
  | "security_incident"
  | "server_issue"
  | "unknown";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "canceled";

export type AutomationRunStatus = "queued" | "blocked" | "running" | "completed" | "succeeded" | "failed" | "unknown" | "cancelled";

export interface Ticket {
  id: string;
  externalBmsId: string | null;
  accountId: string;
  accountName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  title: string;
  description: string;
  queue: string | null;
  status: TicketStatus;
  priority: string | null;
  source: "bms";
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  accountId: string;
  dattoSiteUid: string | null;
  siteLocationId: string | null;
  dattoDeviceUid: string | null;
  hostname: string;
  kind: DeviceKind;
  assetType: DeviceKind;
  lastLoggedInUser: string | null;
  onlineStatus: "online" | "offline" | "unknown";
  isAutomationEligible: boolean;
  lastSeenAt: string | null;
  serialNumber: string | null;
  operatingSystem: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComponentRegistryEntry {
  id: string;
  name: string;
  slug: string;
  description: string;
  dattoComponentUid: string;
  category: string;
  allowedIntents: TicketIntent[];
  allowedAssetTypes: DeviceKind[];
  riskLevel: ComponentRiskLevel;
  requiresClientConfirmation: boolean;
  requiresTechApproval: boolean;
  enabled: boolean;
  maxRunsPerDevicePerDay: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationDecision {
  id: string;
  ticketId: string;
  deviceId: string | null;
  componentRegistryEntryId: string | null;
  outcome: AutomationDecisionOutcome;
  confidence: number;
  detectedIntent: TicketIntent;
  reasons: string[];
  nextAction: string;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  ticketId: string;
  accountId: string;
  contactId: string;
  deviceUid: string;
  componentId: string;
  tokenHash: string;
  status: ApprovalStatus;
  expiresAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  requesterEmail: string;
  approvalIp: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  ticketId: string;
  deviceUid: string;
  componentId: string;
  approvalRequestId: string | null;
  status: AutomationRunStatus;
  dattoJobUid: string | null;
  startedAt: string | null;
  completedAt: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
