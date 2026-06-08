import type { ApprovalRequest, AutomationDecision, AutomationRun, ComponentRegistryEntry } from "@dispatch-sentinel/shared";
import type { Logger } from "../../logger.js";
import type { InMemoryAuditSink } from "../audit/audit-sink.js";
import type { ComponentRegistryRepository } from "../component-registry/registry.js";
import type { DattoRmmAdapter } from "../datto-rmm/types.js";
import type { BmsAdapter } from "../bms/types.js";
import type { BmsWorkflowService } from "../bms/workflow.js";

export interface AutomationRunnerConfig {
  executionEnabled: boolean;
  dryRun: boolean;
  callbackBaseUrl: string;
  adminExecutionEnabled?: boolean;
  globalAutomationDisabled?: boolean;
  dryRunOnly?: boolean;
  blockedAccounts?: string[];
  allowedAccounts?: string[];
}

export interface AutomationRunInput {
  decision: AutomationDecision;
  approvalRequest: ApprovalRequest;
  variables?: Record<string, string | number | boolean | null>;
  now?: Date;
}

const phase7AllowedComponentSlugs = new Set([
  "restart-print-spooler",
  "run-gpupdate",
  "collect-workstation-diagnostics"
]);

export class AutomationRunRepository {
  private readonly runs = new Map<string, AutomationRun>();

  create(run: AutomationRun): AutomationRun {
    this.runs.set(run.id, structuredClone(run));
    return structuredClone(run);
  }

  update(run: AutomationRun): AutomationRun {
    this.runs.set(run.id, structuredClone(run));
    return structuredClone(run);
  }

  get(id: string): AutomationRun | null {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : null;
  }

  findByDattoJobUid(jobUid: string): AutomationRun | null {
    const run = [...this.runs.values()].find((candidate) => candidate.dattoJobUid === jobUid);
    return run ? structuredClone(run) : null;
  }

  list(): AutomationRun[] {
    return [...this.runs.values()].map((run) => structuredClone(run));
  }

  listActive(now: Date, timeoutMinutes: number): AutomationRun[] {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    return [...this.runs.values()]
      .filter((run) => run.status === "queued" || run.status === "running")
      .filter((run) => !run.startedAt || now.getTime() - Date.parse(run.startedAt) >= timeoutMs || run.dattoJobUid)
      .map((run) => structuredClone(run));
  }

  countRunsForDeviceComponentOnDay(deviceUid: string, componentId: string, dayIso: string): number {
    return [...this.runs.values()].filter(
      (run) =>
        run.deviceUid === deviceUid &&
        run.componentId === componentId &&
        (run.status === "succeeded" || run.status === "completed") &&
        run.startedAt?.slice(0, 10) === dayIso.slice(0, 10)
    ).length;
  }
}

export class AutomationRunner {
  constructor(
    private readonly runRepository: AutomationRunRepository,
    private readonly componentRegistry: ComponentRegistryRepository,
    private readonly adapter: DattoRmmAdapter,
    private readonly auditSink: InMemoryAuditSink,
    private readonly logger: Logger,
    private readonly config: AutomationRunnerConfig,
    private readonly bmsAdapter: BmsAdapter | null = null,
    private readonly bmsWorkflow: BmsWorkflowService | null = null
  ) {}

  async runApprovedQuickJob(input: AutomationRunInput): Promise<AutomationRun> {
    const now = input.now ?? new Date();
    const run = this.runRepository.create({
      id: crypto.randomUUID(),
      ticketId: input.decision.ticketId,
      deviceUid: input.approvalRequest.deviceUid,
      componentId: input.approvalRequest.componentId,
      approvalRequestId: input.approvalRequest.id,
      status: "queued",
      dattoJobUid: null,
      startedAt: null,
      completedAt: null,
      resultSummary: null,
      errorMessage: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    try {
      const component = this.componentRegistry.get(input.approvalRequest.componentId);
      await this.validateGuard(input, component, now);

      this.auditSink.record({
        type: "automation.run.guard_passed",
        ticketId: input.decision.ticketId,
        outcome: "success",
        metadata: {
          runId: run.id,
          deviceUid: input.approvalRequest.deviceUid,
          componentId: input.approvalRequest.componentId,
          dryRun: this.config.dryRun
        }
      });

      const running = this.runRepository.update({
        ...run,
        status: "running",
        startedAt: now.toISOString(),
        updatedAt: now.toISOString()
      });

      const result = await this.adapter.runQuickJob(
        input.approvalRequest.deviceUid,
        component!.dattoComponentUid,
        {
          ...input.variables,
          ticketId: input.decision.ticketId,
          callbackUrl: `${this.config.callbackBaseUrl.replace(/\/$/, "")}/api/automation/result`,
          automationRunId: run.id,
          componentSlug: component!.slug
        }
      );

      await this.writeBmsStarted(running, `Datto RMM job started for ${component!.name}. Job UID: ${result.jobUid}.`);
      this.auditSink.record({
        type: "automation.run.started",
        ticketId: input.decision.ticketId,
        outcome: "success",
        metadata: {
          runId: run.id,
          dattoJobUid: result.jobUid,
          componentId: component!.id
        }
      });

      return this.runRepository.update({
        ...running,
        status: result.status === "failed" ? "failed" : result.status === "completed" || result.status === "succeeded" ? "completed" : "queued",
        dattoJobUid: result.jobUid,
        completedAt: result.status === "failed" || result.status === "completed" || result.status === "succeeded" ? new Date(now.getTime() + 1000).toISOString() : null,
        resultSummary: result.summary,
        errorMessage: result.status === "failed" ? result.summary : null,
        updatedAt: new Date(now.getTime() + 1000).toISOString()
      });
    } catch (error) {
      this.auditSink.record({
        type: "automation.run.blocked",
        ticketId: input.decision.ticketId,
        outcome: "rejected",
        metadata: {
          runId: run.id,
          reason: error instanceof Error ? error.message : String(error)
        }
      });
      this.logger.warn("Automation run blocked", {
        runId: run.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return this.runRepository.update({
        ...run,
        status: "blocked",
        completedAt: now.toISOString(),
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: now.toISOString()
      });
    }
  }

  private async validateGuard(
    input: AutomationRunInput,
    component: ReturnType<ComponentRegistryRepository["get"]>,
    now: Date
  ): Promise<void> {
    if (input.decision.outcome !== "AUTO_ELIGIBLE_CONFIRM_CLIENT") {
      throw new Error("Ticket decision is not eligible for approved execution.");
    }

    if (input.approvalRequest.status !== "approved") {
      throw new Error("Approval request is not approved.");
    }

    if (this.config.globalAutomationDisabled) {
      throw new Error("Global automation kill switch is enabled.");
    }

    if (this.config.blockedAccounts?.includes(input.approvalRequest.accountId)) {
      throw new Error("Client/account automation kill switch is enabled.");
    }

    if (this.config.allowedAccounts?.length && !this.config.allowedAccounts.includes(input.approvalRequest.accountId)) {
      throw new Error("Client/account is not in the allowed automation list.");
    }

    if (!component || !component.enabled) {
      throw new Error("Component is disabled or missing from the registry.");
    }

    if (!phase7AllowedComponentSlugs.has(component.slug)) {
      throw new Error("Component is not allowed for Phase 7 live execution.");
    }

    if (component.riskLevel !== "low") {
      throw new Error("Only low-risk components can run in Phase 7.");
    }

    if (!component.allowedAssetTypes.includes("workstation")) {
      throw new Error("Only workstation components can run in Phase 7.");
    }

    if (this.config.adminExecutionEnabled === false) {
      throw new Error("Admin safety setting disables automation execution.");
    }

    if (input.approvalRequest.componentId !== input.decision.componentRegistryEntryId) {
      throw new Error("Approval component does not match the ticket decision.");
    }

    if (input.approvalRequest.deviceUid !== input.decision.deviceId) {
      throw new Error("Approval device does not match the ticket decision.");
    }

    const runsToday = this.runRepository.countRunsForDeviceComponentOnDay(
      input.approvalRequest.deviceUid,
      input.approvalRequest.componentId,
      now.toISOString()
    );
    if (runsToday >= component.maxRunsPerDevicePerDay) {
      throw new Error("Device has reached the daily run limit for this component.");
    }

    if (!this.config.executionEnabled && !this.config.dryRun) {
      throw new Error("Execution flag prevents real Datto RMM adapter use.");
    }

    if (this.config.dryRunOnly && !this.config.dryRun) {
      throw new Error("Dry-run only kill switch prevents live execution.");
    }

    const device = await this.adapter.getDevice(input.approvalRequest.deviceUid);
    if (!device || !device.isAutomationEligible || device.assetType !== "workstation" || device.kind === "server") {
      throw new Error("Only approved workstation devices can run in Phase 7.");
    }
  }

  private async writeBmsNote(ticketId: string, note: string): Promise<void> {
    if (this.bmsAdapter) {
      await this.bmsAdapter.addInternalNote(ticketId.replace(/^ticket:/, ""), note);
    }
  }

  private async writeBmsStarted(run: AutomationRun, note: string): Promise<void> {
    if (this.bmsWorkflow) {
      await this.bmsWorkflow.applyAutomationResult(run, "started", note);
      return;
    }
    await this.writeBmsNote(run.ticketId, note);
  }
}
