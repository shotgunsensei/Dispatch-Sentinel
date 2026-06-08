import type { ComponentRegistryEntry, Device, Ticket } from "@dispatch-sentinel/shared";
import { evaluateTicketPolicy, type DeviceMatchStatus, type PolicyDecision } from "../automation/policy-engine.js";
import type { DeviceMatchResult } from "../assets/device-matcher.js";
import { classifyTicket, type ClassifierContext } from "../classifier/rule-based-classifier.js";
import type { BmsAdapter } from "../bms/types.js";
import type { BmsWorkflowService } from "../bms/workflow.js";

export interface TicketEvaluationInput {
  ticket: Ticket;
  classifierContext: ClassifierContext;
  componentRegistryEntry: ComponentRegistryEntry | null;
  deviceMatchStatus: DeviceMatchStatus;
  matchedDevice: Device | null;
  deviceMatchResult?: DeviceMatchResult | null;
  writeInternalNote?: boolean;
}

export class TicketEvaluationService {
  constructor(
    private readonly bmsAdapter: BmsAdapter,
    private readonly bmsWorkflow: BmsWorkflowService | null = null
  ) {}

  async evaluate(input: TicketEvaluationInput): Promise<PolicyDecision> {
    const classification = classifyTicket(input.ticket, input.classifierContext);
    const decision = evaluateTicketPolicy({
      ticket: input.ticket,
      classification,
      componentRegistryEntry: input.componentRegistryEntry,
      deviceMatchStatus: input.deviceMatchStatus,
      matchedDevice: input.matchedDevice,
      deviceMatchResult: input.deviceMatchResult
    });

    if (input.writeInternalNote && input.ticket.externalBmsId && this.bmsWorkflow) {
      await this.bmsWorkflow.applyDecision(decision);
    } else if (input.writeInternalNote && input.ticket.externalBmsId) {
      await this.bmsAdapter.addInternalNote(input.ticket.externalBmsId, decision.note);
    }

    return decision;
  }
}
