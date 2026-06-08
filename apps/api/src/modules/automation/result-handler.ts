import type { AutomationRun } from "@dispatch-sentinel/shared";
import type { InMemoryAuditSink } from "../audit/audit-sink.js";
import type { BmsAdapter } from "../bms/types.js";
import type { BmsWorkflowService } from "../bms/workflow.js";
import type { DattoRmmAdapter } from "../datto-rmm/types.js";
import type { AutomationRunRepository } from "./automation-runner.js";

export interface AutomationResultPayload {
  automationRunId: string;
  ticketId: string;
  hostname: string;
  success: boolean;
  message: string;
  details: string;
  timestamp: string;
}

export class AutomationResultHandler {
  constructor(
    private readonly runRepository: AutomationRunRepository,
    private readonly dattoAdapter: DattoRmmAdapter,
    private readonly auditSink: InMemoryAuditSink,
    private readonly bmsAdapter: BmsAdapter | null = null,
    private readonly bmsWorkflow: BmsWorkflowService | null = null
  ) {}

  async handleCallback(payload: AutomationResultPayload): Promise<AutomationRun> {
    validateResultPayload(payload);
    const run = this.requireRun(payload.automationRunId);
    const device = await this.dattoAdapter.getDevice(run.deviceUid);

    if (device && device.hostname !== payload.hostname) {
      this.auditSink.record({
        type: "automation.callback.device_mismatch",
        ticketId: run.ticketId,
        outcome: "error",
        metadata: {
          runId: run.id,
          expectedHostname: device.hostname,
          callbackHostname: payload.hostname
        }
      });
    }

    const status = payload.success ? "completed" : "failed";
    const updated = this.runRepository.update({
      ...run,
      status,
      completedAt: payload.timestamp,
      resultSummary: payload.message,
      errorMessage: payload.success ? null : payload.details || payload.message,
      updatedAt: payload.timestamp
    });

    this.auditSink.record({
      type: payload.success ? "automation.run.completed" : "automation.run.failed",
      ticketId: run.ticketId,
      outcome: payload.success ? "success" : "error",
      metadata: {
        runId: run.id,
        message: payload.message
      }
    });

    await this.writeBmsResult(updated, payload.success, payload.success ? payload.message : payload.details || payload.message);
    return updated;
  }

  private requireRun(runId: string): AutomationRun {
    const run = this.runRepository.get(runId);
    if (!run) {
      throw new Error("Automation run was not found.");
    }
    return run;
  }

  private async writeBmsNote(ticketId: string, note: string): Promise<void> {
    if (this.bmsAdapter) {
      await this.bmsAdapter.addInternalNote(ticketId.replace(/^ticket:/, ""), note);
    }
  }

  private async writeBmsResult(run: AutomationRun, success: boolean, message: string): Promise<void> {
    if (this.bmsWorkflow) {
      await this.bmsWorkflow.applyAutomationResult(run, success ? "success" : "failure", message);
      return;
    }
    await this.writeBmsNote(run.ticketId, success ? `Job completed successfully: ${message}` : `Job failed and requires human review: ${message}`);
  }
}

export function validateResultPayload(payload: unknown): asserts payload is AutomationResultPayload {
  if (!isRecord(payload)) {
    throw new Error("Result payload must be an object.");
  }
  for (const field of ["automationRunId", "ticketId", "hostname", "message", "details", "timestamp"]) {
    if (typeof payload[field] !== "string") {
      throw new Error(`${field} must be a string.`);
    }
  }
  if (typeof payload.success !== "boolean") {
    throw new Error("success must be a boolean.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
