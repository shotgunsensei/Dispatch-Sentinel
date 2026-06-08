import type { InMemoryAuditSink } from "../audit/audit-sink.js";
import type { BmsAdapter } from "../bms/types.js";
import type { BmsWorkflowService } from "../bms/workflow.js";
import type { DattoRmmAdapter } from "../datto-rmm/types.js";
import type { AutomationRunRepository } from "./automation-runner.js";

export class AutomationJobPoller {
  constructor(
    private readonly runRepository: AutomationRunRepository,
    private readonly dattoAdapter: DattoRmmAdapter,
    private readonly auditSink: InMemoryAuditSink,
    private readonly bmsAdapter: BmsAdapter | null = null,
    private readonly timeoutMinutes = 30,
    private readonly bmsWorkflow: BmsWorkflowService | null = null
  ) {}

  async poll(now = new Date()): Promise<void> {
    const activeRuns = this.runRepository.listActive(now, this.timeoutMinutes);
    for (const run of activeRuns) {
      if (!run.dattoJobUid || (run.startedAt && now.getTime() - Date.parse(run.startedAt) >= this.timeoutMinutes * 60 * 1000)) {
        const updated = this.runRepository.update({
          ...run,
          status: "unknown",
          completedAt: now.toISOString(),
          resultSummary: "No callback or conclusive Datto RMM status received before timeout.",
          errorMessage: "Job unknown/no callback. Escalate to human review.",
          updatedAt: now.toISOString()
        });
        this.auditSink.record({
          type: "automation.run.unknown",
          ticketId: updated.ticketId,
          outcome: "error",
          metadata: { runId: updated.id }
        });
        await this.writeBmsResult(updated, "unknown", "Job unknown/no callback.");
        continue;
      }

      const status = await this.dattoAdapter.getJobStatus(run.dattoJobUid);
      if (status.status === "completed" || status.status === "succeeded" || status.status === "failed") {
        const updated = this.runRepository.update({
          ...run,
          status: status.status === "failed" ? "failed" : "completed",
          completedAt: now.toISOString(),
          resultSummary: status.summary,
          errorMessage: status.status === "failed" ? status.summary : null,
          updatedAt: now.toISOString()
        });
        await this.writeBmsResult(updated, status.status === "failed" ? "failure" : "success", status.summary);
      }
    }
  }

  private async writeBmsNote(ticketId: string, note: string): Promise<void> {
    if (this.bmsAdapter) {
      await this.bmsAdapter.addInternalNote(ticketId.replace(/^ticket:/, ""), note);
    }
  }

  private async writeBmsResult(run: Parameters<BmsWorkflowService["applyAutomationResult"]>[0], kind: "success" | "failure" | "unknown", message: string): Promise<void> {
    if (this.bmsWorkflow) {
      await this.bmsWorkflow.applyAutomationResult(run, kind, message);
      return;
    }
    await this.writeBmsNote(run.ticketId, kind === "success" ? `Job completed successfully: ${message}` : `Job ${kind}: ${message}. Escalating to human review.`);
  }
}

export interface AutomationJobPollingWorker {
  start(): void;
  stop(): void;
}

export function createAutomationJobPollingWorker(
  poller: AutomationJobPoller,
  intervalMs = 60_000,
  onError: (error: unknown) => void = () => undefined
): AutomationJobPollingWorker {
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    start() {
      if (timer) {
        return;
      }
      timer = setInterval(() => {
        void poller.poll().catch(onError);
      }, intervalMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  };
}
