import type { AutomationDecision, AutomationRun } from "@dispatch-sentinel/shared";
import type { InMemoryAuditSink } from "../audit/audit-sink.js";
import type { BmsAdapter } from "./types.js";

export interface BmsWorkflowConfig {
  writesEnabled: boolean;
  queues: {
    automationReview: string;
    level1: string;
    level2: string;
    security: string;
    humanReview: string;
  };
  statuses: {
    autoTriage: string;
    awaitingClientConfirmation: string;
    automationRunning: string;
    needsQa: string;
    escalated: string;
    completed: string;
  };
  queueAutoEligible: boolean;
  denyAutomationRouteToHuman: boolean;
  successPublicNoteEnabled: boolean;
  closeTicketsEnabled: boolean;
  priorityUpdatesEnabled: boolean;
}

export type AutomationResultKind = "started" | "success" | "failure" | "unknown";

export class BmsWorkflowService {
  private readonly processedKeys = new Set<string>();

  constructor(
    private readonly adapter: BmsAdapter,
    private readonly config: BmsWorkflowConfig,
    private readonly auditSink: InMemoryAuditSink | null = null
  ) {}

  async applyDecision(decision: AutomationDecision & { note?: string }): Promise<void> {
    const ticketId = normalizeTicketId(decision.ticketId);
    const key = `decision:${decision.id}:${decision.outcome}`;
    await this.once(key, ticketId, async () => {
      await this.writeInternalNote(ticketId, decision.note ?? decisionNote(decision));

      switch (decision.outcome) {
        case "AUTO_ELIGIBLE_CONFIRM_CLIENT":
          await this.updateStatus(ticketId, this.config.statuses.awaitingClientConfirmation);
          if (this.config.queueAutoEligible) {
            await this.updateQueue(ticketId, this.config.queues.automationReview);
          }
          break;
        case "ASK_CLIENT_TO_SELECT_DEVICE":
          await this.writeInternalNote(ticketId, "Device selection request queued for client confirmation. No automation will run until the device is confirmed.");
          await this.updateStatus(ticketId, this.config.statuses.autoTriage);
          break;
        case "REQUIRE_TECH_APPROVAL":
          await this.updateQueue(ticketId, this.config.queues.level2 || this.config.queues.automationReview);
          await this.updateStatus(ticketId, this.config.statuses.autoTriage);
          break;
        case "ESCALATE_TO_HUMAN":
          await this.updateQueue(ticketId, this.queueForEscalation(decision));
          await this.updateStatus(ticketId, this.config.statuses.escalated);
          break;
        case "DENY_AUTOMATION":
          if (this.config.denyAutomationRouteToHuman) {
            await this.updateQueue(ticketId, this.config.queues.humanReview);
            await this.updateStatus(ticketId, this.config.statuses.escalated);
          }
          break;
      }
    });
  }

  async applyAutomationResult(run: AutomationRun, kind: AutomationResultKind, message: string): Promise<void> {
    const ticketId = normalizeTicketId(run.ticketId);
    const key = `run:${run.id}:${kind}`;
    await this.once(key, ticketId, async () => {
      if (kind === "started") {
        await this.writeInternalNote(ticketId, `Automation started for run ${run.id}: ${message}`);
        await this.updateStatus(ticketId, this.config.statuses.automationRunning);
        return;
      }

      if (kind === "success") {
        await this.writeInternalNote(ticketId, `Automation completed successfully for run ${run.id}: ${message}`);
        if (this.config.successPublicNoteEnabled && this.adapter.addPublicNote) {
          await this.adapter.addPublicNote(ticketId, `Dispatch Sentinel completed the approved automation. A technician will review the result before closure.`);
        }
        await this.updateStatus(ticketId, this.config.closeTicketsEnabled ? this.config.statuses.completed : this.config.statuses.needsQa);
        return;
      }

      const failureMessage = kind === "unknown"
        ? `Automation result unknown for run ${run.id}: ${message}`
        : `Automation failed for run ${run.id}: ${message}`;
      await this.writeInternalNote(ticketId, `${failureMessage}. Escalating to human review.`);
      await this.updateStatus(ticketId, this.config.statuses.escalated);
      await this.updateQueue(ticketId, this.config.queues.humanReview);
    });
  }

  hasProcessed(key: string): boolean {
    return this.processedKeys.has(key);
  }

  private async once(key: string, ticketId: string, work: () => Promise<void>): Promise<void> {
    if (this.processedKeys.has(key)) {
      this.auditSink?.record({
        type: "bms.ticket.update_skipped",
        ticketId,
        outcome: "success",
        metadata: { reason: "idempotent_duplicate", key }
      });
      return;
    }
    this.processedKeys.add(key);
    if (!this.config.writesEnabled) {
      this.auditSink?.record({
        type: "bms.ticket.update_skipped",
        ticketId,
        outcome: "success",
        metadata: { reason: "writes_disabled", key }
      });
      return;
    }
    await work();
    this.auditSink?.record({
      type: "bms.ticket.updated",
      ticketId,
      outcome: "success",
      metadata: { key }
    });
  }

  private async writeInternalNote(ticketId: string, note: string): Promise<void> {
    await this.adapter.addInternalNote(ticketId, note);
  }

  private async updateStatus(ticketId: string, status: string): Promise<void> {
    await this.adapter.updateTicketStatus(ticketId, status);
  }

  private async updateQueue(ticketId: string, queue: string): Promise<void> {
    await this.adapter.updateTicketQueue(ticketId, queue);
  }

  private queueForEscalation(decision: AutomationDecision): string {
    if (decision.detectedIntent === "security_incident") {
      return this.config.queues.security;
    }
    return this.config.queues.humanReview || this.config.queues.level1;
  }
}

export function createBmsWorkflowConfig(input: {
  writesEnabled: boolean;
  bmsQueueAutomationReview: string;
  bmsQueueLevel1: string;
  bmsQueueLevel2: string;
  bmsQueueSecurity: string;
  bmsQueueHumanReview: string;
  bmsStatusAutoTriage: string;
  bmsStatusAwaitingClientConfirmation: string;
  bmsStatusAutomationRunning: string;
  bmsStatusNeedsQa: string;
  bmsStatusEscalated: string;
  bmsStatusCompleted: string;
  bmsQueueAutoEligible: boolean;
  bmsDenyAutomationRouteToHuman: boolean;
  bmsSuccessPublicNoteEnabled: boolean;
  bmsCloseTicketsEnabled: boolean;
  bmsPriorityUpdatesEnabled: boolean;
}): BmsWorkflowConfig {
  return {
    writesEnabled: input.writesEnabled,
    queues: {
      automationReview: input.bmsQueueAutomationReview,
      level1: input.bmsQueueLevel1,
      level2: input.bmsQueueLevel2,
      security: input.bmsQueueSecurity,
      humanReview: input.bmsQueueHumanReview
    },
    statuses: {
      autoTriage: input.bmsStatusAutoTriage,
      awaitingClientConfirmation: input.bmsStatusAwaitingClientConfirmation,
      automationRunning: input.bmsStatusAutomationRunning,
      needsQa: input.bmsStatusNeedsQa,
      escalated: input.bmsStatusEscalated,
      completed: input.bmsStatusCompleted
    },
    queueAutoEligible: input.bmsQueueAutoEligible,
    denyAutomationRouteToHuman: input.bmsDenyAutomationRouteToHuman,
    successPublicNoteEnabled: input.bmsSuccessPublicNoteEnabled,
    closeTicketsEnabled: input.bmsCloseTicketsEnabled,
    priorityUpdatesEnabled: input.bmsPriorityUpdatesEnabled
  };
}

function decisionNote(decision: AutomationDecision): string {
  return [
    "Dispatch Sentinel Phase 9 BMS decision:",
    `Detected intent: ${decision.detectedIntent}`,
    `Confidence score: ${decision.confidence}`,
    `Decision: ${decision.outcome}`,
    `Reason: ${decision.reasons.join("; ")}`,
    `Next action: ${decision.nextAction}`
  ].join("\n");
}

function normalizeTicketId(ticketId: string): string {
  return ticketId.replace(/^ticket:/, "");
}
