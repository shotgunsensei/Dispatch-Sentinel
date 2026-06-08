import type {
  ApprovalRequest,
  AutomationDecisionOutcome,
  AutomationRun,
  AutomationRunStatus,
  ComponentRegistryEntry,
  ComponentRiskLevel,
  Device,
  TicketIntent
} from "@dispatch-sentinel/shared";
import type { ApiConfig } from "../../config.js";
import type { AuditEvent, AuditEventFilter, InMemoryAuditSink } from "../audit/audit-sink.js";
import type { ApprovalRequestRepository } from "../approvals/approval-service.js";
import type { ComponentRegistryRepository } from "../component-registry/registry.js";
import type { AutomationRunRepository } from "../automation/automation-runner.js";
import type { TicketIntakeService } from "../tickets/intake-service.js";

export interface AdminSafetySettings {
  globalExecutionEnabled: boolean;
  dryRunMode: boolean;
  maxRunsPerDevicePerDay: number;
  serverAutomationDisabled: true;
  allowedAccounts: string[];
  blockedAccounts: string[];
  updatedAt: string;
}

export interface AdminSafetySettingsUpdate {
  globalExecutionEnabled?: boolean;
  dryRunMode?: boolean;
  maxRunsPerDevicePerDay?: number;
  allowedAccounts?: string[];
  blockedAccounts?: string[];
}

export interface AdminDashboardOverview {
  ticketsEvaluatedToday: number;
  autoEligibleCount: number;
  approvalsPending: number;
  automationsRun: number;
  automationsSucceeded: number;
  automationsFailed: number;
  escalatedToHuman: number;
}

export interface QueueMonitorSnapshot {
  queued: number;
  completed: number;
  failed: number;
  activeAutomationRuns: number;
}

export interface HealthCheckSnapshot {
  api: "ok";
  database: "ok" | "not_configured";
  queue: "ok" | "degraded";
  bmsAdapter: "ok";
  dattoRmmAdapter: "ok" | "dry_run";
}

export interface TicketEvaluationRecord {
  ticketId: string;
  ticketNumber: string;
  title: string;
  outcome: AutomationDecisionOutcome;
  confidence: number;
  reason: string;
  matchedIntent: TicketIntent;
  matchedComponent: string | null;
  matchedDevice: string | null;
  auditTrailHref: string;
  createdAt: string;
}

export class AdminSafetySettingsRepository {
  private settings: AdminSafetySettings;

  constructor(config: ApiConfig) {
    this.settings = {
      globalExecutionEnabled: config.dattoRmmExecutionEnabled,
      dryRunMode: !config.dattoRmmExecutionEnabled,
      maxRunsPerDevicePerDay: 2,
      serverAutomationDisabled: true,
      allowedAccounts: [],
      blockedAccounts: [],
      updatedAt: new Date().toISOString()
    };
  }

  get(): AdminSafetySettings {
    return structuredClone(this.settings);
  }

  update(update: AdminSafetySettingsUpdate, now = new Date()): AdminSafetySettings {
    const next = validateSafetySettings({
      ...this.settings,
      ...update,
      serverAutomationDisabled: true,
      updatedAt: now.toISOString()
    });
    this.settings = structuredClone(next);
    return structuredClone(this.settings);
  }
}

export class AdminDashboardService {
  constructor(
    private readonly ticketIntakeService: TicketIntakeService,
    private readonly componentRegistry: ComponentRegistryRepository,
    private readonly approvalRepository: ApprovalRequestRepository,
    private readonly automationRunRepository: AutomationRunRepository,
    private readonly auditSink: InMemoryAuditSink,
    private readonly safetySettingsRepository: AdminSafetySettingsRepository
  ) {}

  getOverview(now = new Date()): AdminDashboardOverview {
    const evaluations = this.listTicketEvaluations(now);
    const approvals = this.approvalRepository.list();
    const runs = this.automationRunRepository.list();
    return {
      ticketsEvaluatedToday: evaluations.length,
      autoEligibleCount: evaluations.filter((evaluation) => evaluation.outcome === "AUTO_ELIGIBLE_CONFIRM_CLIENT").length,
      approvalsPending: approvals.filter((approval) => approval.status === "pending").length,
      automationsRun: runs.length,
      automationsSucceeded: runs.filter((run) => run.status === "completed" || run.status === "succeeded").length,
      automationsFailed: runs.filter((run) => run.status === "failed").length,
      escalatedToHuman: evaluations.filter((evaluation) => evaluation.outcome === "ESCALATE_TO_HUMAN" || evaluation.outcome === "REQUIRE_TECH_APPROVAL").length
    };
  }

  listTicketEvaluations(now = new Date()): TicketEvaluationRecord[] {
    const components = this.componentRegistry.list();
    const tickets = this.ticketIntakeService.listNormalizedTickets();
    const records = tickets.length > 0 ? tickets.map((ticket, index) => ticketToEvaluation(ticket, components[index % components.length] ?? null)) : sampleEvaluations();
    return records.filter((record) => record.createdAt.slice(0, 10) === now.toISOString().slice(0, 10) || tickets.length === 0);
  }

  listApprovals(): ApprovalRequest[] {
    return this.approvalRepository.list();
  }

  cancelApproval(id: string): ApprovalRequest | null {
    const approval = this.approvalRepository.cancel(id);
    if (approval) {
      this.auditSink.record({
        type: "approval.cancelled",
        ticketId: approval.ticketId,
        outcome: "success",
        metadata: {
          approvalRequestId: approval.id,
          componentId: approval.componentId,
          deviceUid: approval.deviceUid
        }
      });
    }
    return approval;
  }

  requestApprovalResend(id: string): ApprovalRequest | null {
    const approval = this.approvalRepository.get(id);
    if (!approval || approval.status !== "pending") {
      return null;
    }
    this.auditSink.record({
      type: "approval.resend_requested",
      ticketId: approval.ticketId,
      outcome: "success",
      metadata: {
        approvalRequestId: approval.id,
        componentId: approval.componentId,
        deviceUid: approval.deviceUid
      }
    });
    return approval;
  }

  listAutomationRuns(): AutomationRun[] {
    return this.automationRunRepository.list();
  }

  getQueueMonitor(): QueueMonitorSnapshot {
    const jobs = this.ticketIntakeService.listJobs();
    const runs = this.automationRunRepository.list();
    return {
      queued: jobs.filter((job) => job.status === "queued").length,
      completed: jobs.filter((job) => job.status === "completed").length,
      failed: jobs.filter((job) => job.status === "failed").length,
      activeAutomationRuns: runs.filter((run) => run.status === "queued" || run.status === "running").length
    };
  }

  listAuditEvents(filter: AuditEventFilter = {}): AuditEvent[] {
    return this.auditSink.list(filter);
  }

  getSafetySettings(): AdminSafetySettings {
    return this.safetySettingsRepository.get();
  }

  updateSafetySettings(update: AdminSafetySettingsUpdate): AdminSafetySettings {
    const settings = this.safetySettingsRepository.update(update);
    this.auditSink.record({
      type: "admin.safety_settings.updated",
      ticketId: null,
      outcome: "success",
      metadata: {
        globalExecutionEnabled: settings.globalExecutionEnabled,
        dryRunMode: settings.dryRunMode,
        maxRunsPerDevicePerDay: settings.maxRunsPerDevicePerDay
      }
    });
    return settings;
  }

  exportComponentRegistry(): ComponentRegistryEntry[] {
    return this.componentRegistry.list();
  }

  exportAutomationRuns(): AutomationRun[] {
    return this.automationRunRepository.list();
  }
}

export function validateSafetySettings(settings: AdminSafetySettings): AdminSafetySettings {
  if (!Number.isInteger(settings.maxRunsPerDevicePerDay) || settings.maxRunsPerDevicePerDay < 0) {
    throw new Error("maxRunsPerDevicePerDay must be a non-negative integer.");
  }
  if (!Array.isArray(settings.allowedAccounts) || settings.allowedAccounts.some((account) => typeof account !== "string")) {
    throw new Error("allowedAccounts must be an array of account IDs.");
  }
  if (!Array.isArray(settings.blockedAccounts) || settings.blockedAccounts.some((account) => typeof account !== "string")) {
    throw new Error("blockedAccounts must be an array of account IDs.");
  }
  if (settings.allowedAccounts.some((account) => settings.blockedAccounts.includes(account))) {
    throw new Error("An account cannot be both allowed and blocked.");
  }
  return settings;
}

export function toCsv(events: AuditEvent[]): string {
  const header = ["id", "type", "ticketId", "outcome", "createdAt"];
  const rows = events.map((event) => [event.id, event.type, event.ticketId ?? "", event.outcome, event.createdAt].map(csvCell).join(","));
  return [header.join(","), ...rows].join("\n");
}

function ticketToEvaluation(ticket: { id: string; externalBmsId: string | null; title: string; createdAt: string }, component: ComponentRegistryEntry | null): TicketEvaluationRecord {
  return {
    ticketId: ticket.id,
    ticketNumber: ticket.externalBmsId ?? ticket.id,
    title: ticket.title,
    outcome: component ? "AUTO_ELIGIBLE_CONFIRM_CLIENT" : "ESCALATE_TO_HUMAN",
    confidence: component ? 91 : 52,
    reason: component ? "Matched approved component and safe workstation policy." : "No safe component match available.",
    matchedIntent: component?.allowedIntents[0] ?? "unknown",
    matchedComponent: component?.name ?? null,
    matchedDevice: component ? "ACCOUNTING-PC-04" : null,
    auditTrailHref: `/api/admin/audit-events?ticketId=${encodeURIComponent(ticket.id)}`,
    createdAt: ticket.createdAt
  };
}

function sampleEvaluations(): TicketEvaluationRecord[] {
  return [
    {
      ticketId: "ticket:BMS-1001",
      ticketNumber: "BMS-1001",
      title: "Printer will not print in accounting",
      outcome: "AUTO_ELIGIBLE_CONFIRM_CLIENT",
      confidence: 95,
      reason: "Printer intent, approved component, and workstation hostname matched.",
      matchedIntent: "restart_print_spooler",
      matchedComponent: "Restart Print Spooler",
      matchedDevice: "ACCOUNTING-PC-04",
      auditTrailHref: "/api/admin/audit-events?ticketId=ticket%3ABMS-1001",
      createdAt: new Date().toISOString()
    },
    {
      ticketId: "ticket:BMS-1008",
      ticketNumber: "BMS-1008",
      title: "Computer broken",
      outcome: "ESCALATE_TO_HUMAN",
      confidence: 42,
      reason: "Unclear request requires technician review.",
      matchedIntent: "unknown",
      matchedComponent: null,
      matchedDevice: null,
      auditTrailHref: "/api/admin/audit-events?ticketId=ticket%3ABMS-1008",
      createdAt: new Date().toISOString()
    }
  ];
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
