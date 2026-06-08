import type { Logger } from "../../logger.js";

export type AuditEventType =
  | "bms.webhook.received"
  | "bms.ticket.fetched"
  | "bms.ticket.normalized"
  | "bms.ticket.intake_error"
  | "bms.webhook.duplicate_skipped"
  | "bms.ticket.updated"
  | "bms.ticket.update_skipped"
  | "automation.run.guard_passed"
  | "automation.run.blocked"
  | "automation.run.started"
  | "automation.run.completed"
  | "automation.run.failed"
  | "automation.run.unknown"
  | "automation.callback.device_mismatch"
  | "approval.resend_requested"
  | "approval.cancelled"
  | "admin.safety_settings.updated";

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  ticketId: string | null;
  outcome: "success" | "rejected" | "error";
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface AuditEventFilter {
  ticketId?: string;
  deviceUid?: string;
  componentId?: string;
  action?: string;
}

export class InMemoryAuditSink {
  private readonly events: AuditEvent[] = [];

  constructor(private readonly logger: Logger) {}

  record(event: Omit<AuditEvent, "id" | "createdAt">): AuditEvent {
    const auditEvent: AuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.events.push(auditEvent);
    this.logger.info("Audit event recorded", {
      auditEventId: auditEvent.id,
      auditEventType: auditEvent.type,
      ticketId: auditEvent.ticketId,
      outcome: auditEvent.outcome
    });
    return auditEvent;
  }

  list(filter: AuditEventFilter = {}): AuditEvent[] {
    return this.events
      .filter((event) => {
        if (filter.ticketId && event.ticketId !== filter.ticketId) {
          return false;
        }
        if (filter.action && event.type !== filter.action) {
          return false;
        }
        if (filter.deviceUid && event.metadata.deviceUid !== filter.deviceUid) {
          return false;
        }
        if (filter.componentId && event.metadata.componentId !== filter.componentId) {
          return false;
        }
        return true;
      })
      .map((event) => structuredClone(event));
  }

  clear(): void {
    this.events.length = 0;
  }
}
