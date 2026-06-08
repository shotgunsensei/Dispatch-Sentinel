import type { Ticket } from "@dispatch-sentinel/shared";
import type { Logger } from "../../logger.js";
import type { InMemoryAuditSink } from "../audit/audit-sink.js";
import type { BmsAdapter } from "../bms/types.js";
import { normalizeBmsTicket } from "./normalize.js";

export interface TicketEvaluationJob {
  id: string;
  ticketId: string;
  eventType: "ticket.created" | "ticket.updated";
  status: "queued" | "completed" | "failed";
  createdAt: string;
}

export class TicketIntakeService {
  private readonly jobs: TicketEvaluationJob[] = [];
  private readonly normalizedTickets = new Map<string, Ticket>();
  private readonly processedWebhookKeys = new Set<string>();

  constructor(
    private readonly bmsAdapter: BmsAdapter,
    private readonly auditSink: InMemoryAuditSink,
    private readonly logger: Logger
  ) {}

  async enqueueTicketEvaluation(ticketId: string, eventType: TicketEvaluationJob["eventType"]): Promise<TicketEvaluationJob> {
    const webhookKey = `${eventType}:${ticketId}`;
    const existingJob = this.jobs.find((job) => job.ticketId === ticketId && job.eventType === eventType && job.status === "completed");
    if (this.processedWebhookKeys.has(webhookKey) && existingJob) {
      this.auditSink.record({
        type: "bms.webhook.duplicate_skipped",
        ticketId,
        outcome: "success",
        metadata: { eventType }
      });
      return { ...existingJob };
    }
    this.processedWebhookKeys.add(webhookKey);

    const job: TicketEvaluationJob = {
      id: crypto.randomUUID(),
      ticketId,
      eventType,
      status: "queued",
      createdAt: new Date().toISOString()
    };
    this.jobs.push(job);

    try {
      const rawTicket = await this.bmsAdapter.getTicketById(ticketId);
      if (!rawTicket) {
        throw new Error("Ticket was not found in the BMS adapter.");
      }

      this.auditSink.record({
        type: "bms.ticket.fetched",
        ticketId,
        outcome: "success",
        metadata: { jobId: job.id }
      });

      const ticket = normalizeBmsTicket(rawTicket);
      this.normalizedTickets.set(ticket.id, ticket);
      job.status = "completed";

      this.auditSink.record({
        type: "bms.ticket.normalized",
        ticketId,
        outcome: "success",
        metadata: {
          jobId: job.id,
          internalTicketId: ticket.id,
          queue: ticket.queue,
          status: ticket.status
        }
      });
    } catch (error) {
      job.status = "failed";
      this.auditSink.record({
        type: "bms.ticket.intake_error",
        ticketId,
        outcome: "error",
        metadata: {
          jobId: job.id,
          errorName: error instanceof Error ? error.name : "UnknownError"
        }
      });
      this.logger.error("BMS ticket intake failed", {
        ticketId,
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return job;
  }

  listJobs(): TicketEvaluationJob[] {
    return [...this.jobs];
  }

  listNormalizedTickets(): Ticket[] {
    return [...this.normalizedTickets.values()];
  }
}
