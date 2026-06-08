import type {
  AutomationDecision,
  AutomationDecisionOutcome,
  ComponentRegistryEntry,
  Device,
  Ticket,
  TicketIntent
} from "@dispatch-sentinel/shared";
import type { ClassificationResult } from "../classifier/rule-based-classifier.js";
import type { DeviceMatchResult } from "../assets/device-matcher.js";

export type DeviceMatchStatus = "matched" | "missing" | "ambiguous" | "server";

export interface PolicyInput {
  ticket: Ticket;
  classification: ClassificationResult;
  componentRegistryEntry: ComponentRegistryEntry | null;
  deviceMatchStatus: DeviceMatchStatus;
  matchedDevice: Device | null;
  deviceMatchResult?: DeviceMatchResult | null;
}

export interface PolicyDecision extends AutomationDecision {
  note: string;
}

const approvedOutcomes: AutomationDecisionOutcome[] = [
  "AUTO_ELIGIBLE_CONFIRM_CLIENT",
  "ASK_CLIENT_TO_SELECT_DEVICE",
  "REQUIRE_TECH_APPROVAL",
  "ESCALATE_TO_HUMAN",
  "DENY_AUTOMATION"
];

const hardDenyIntents = new Set<TicketIntent>(["password_reset", "mfa_reset"]);
const humanReviewIntents = new Set<TicketIntent>(["security_incident", "server_issue"]);
const safeMvpIntents = new Set<TicketIntent>([
  "restart_print_spooler",
  "run_gpupdate",
  "collect_workstation_diagnostics",
  "clear_safe_temp_files",
  "restart_user_app_process",
  "reboot_workstation"
]);

export function evaluateTicketPolicy(input: PolicyInput): PolicyDecision {
  const reasons: string[] = [...input.classification.reasons];
  const nextAction = determineNextAction(input, reasons);
  const outcome = determineOutcome(input, reasons);

  assertApprovedOutcome(outcome);

  const decision: PolicyDecision = {
    id: crypto.randomUUID(),
    ticketId: input.ticket.id,
    deviceId: input.matchedDevice?.id ?? null,
    componentRegistryEntryId: input.componentRegistryEntry?.id ?? null,
    outcome,
    confidence: input.classification.confidence,
    detectedIntent: input.classification.intent,
    reasons,
    nextAction,
    note: "",
    createdAt: new Date().toISOString()
  };

  return {
    ...decision,
    note: generateInternalDecisionNote(decision)
  };
}

export function generateInternalDecisionNote(decision: Omit<PolicyDecision, "note">): string {
  return [
    "Dispatch Sentinel Phase 5 evaluation:",
    `Detected intent: ${decision.detectedIntent}`,
    `Confidence score: ${decision.confidence}`,
    `Decision: ${decision.outcome}`,
    `Reason: ${decision.reasons.join("; ")}`,
    `Next action: ${decision.nextAction}`
  ].join("\n");
}

function determineOutcome(input: PolicyInput, reasons: string[]): AutomationDecisionOutcome {
  const { classification, componentRegistryEntry, deviceMatchStatus, matchedDevice } = input;
  const deviceMatchConfidence = input.deviceMatchResult?.confidence ?? (deviceMatchStatus === "matched" ? 100 : 0);

  if (hardDenyIntents.has(classification.intent)) {
    reasons.push("hard-deny identity action is outside MVP scope");
    return "DENY_AUTOMATION";
  }

  if (classification.intent === "server_issue" || deviceMatchStatus === "server" || matchedDevice?.kind === "server") {
    reasons.push("server-related request requires technician review");
    return "REQUIRE_TECH_APPROVAL";
  }

  if (humanReviewIntents.has(classification.intent) || classification.highRiskPenaltyApplied) {
    reasons.push("security or high-risk request requires human review");
    return "ESCALATE_TO_HUMAN";
  }

  if (classification.intent === "unknown") {
    reasons.push("unknown or unclear request cannot be safely automated");
    return "ESCALATE_TO_HUMAN";
  }

  if (!safeMvpIntents.has(classification.intent)) {
    reasons.push("intent is outside MVP automation categories");
    return "ESCALATE_TO_HUMAN";
  }

  if (!componentRegistryEntry) {
    reasons.push("no matching component registry entry found");
    return "ESCALATE_TO_HUMAN";
  }

  if (!componentRegistryEntry.enabled) {
    reasons.push("matching component registry entry is disabled");
    return "ESCALATE_TO_HUMAN";
  }

  if (!componentRegistryEntry.allowedIntents.includes(classification.intent)) {
    reasons.push("component registry entry does not allow detected intent");
    return "ESCALATE_TO_HUMAN";
  }

  const matchedAssetType = matchedDevice?.kind ?? null;
  if (matchedAssetType && !componentRegistryEntry.allowedAssetTypes.includes(matchedAssetType)) {
    reasons.push(`component registry entry does not allow asset type ${matchedAssetType}`);
    return "ESCALATE_TO_HUMAN";
  }

  if (componentRegistryEntry.requiresTechApproval || componentRegistryEntry.riskLevel === "high" || componentRegistryEntry.riskLevel === "critical") {
    reasons.push(`component risk level is ${componentRegistryEntry.riskLevel}`);
    return "REQUIRE_TECH_APPROVAL";
  }

  if (input.ticket.priority?.toLowerCase() === "critical") {
    reasons.push("critical-priority tickets require technician review");
    return "REQUIRE_TECH_APPROVAL";
  }

  if (deviceMatchStatus === "missing") {
    reasons.push("no safe device match was found");
    return "ESCALATE_TO_HUMAN";
  }

  if (deviceMatchStatus === "ambiguous") {
    reasons.push("multiple possible device matches require client selection");
    return "ASK_CLIENT_TO_SELECT_DEVICE";
  }

  if (deviceMatchStatus === "matched" && deviceMatchConfidence < 85) {
    reasons.push(`device match confidence ${deviceMatchConfidence} is below high-confidence threshold`);
    return deviceMatchConfidence >= 60 ? "ASK_CLIENT_TO_SELECT_DEVICE" : "ESCALATE_TO_HUMAN";
  }

  if (classification.confidence >= 90) {
    if (deviceMatchStatus === "matched" && matchedDevice) {
      reasons.push("safe intent, enabled registry component, and matched device");
      return "AUTO_ELIGIBLE_CONFIRM_CLIENT";
    }

    reasons.push("safe intent and component matched, but device is not confirmed");
    return "ASK_CLIENT_TO_SELECT_DEVICE";
  }

  if (classification.confidence >= 70) {
    reasons.push("safe intent with medium confidence requires device selection or confirmation");
    return "ASK_CLIENT_TO_SELECT_DEVICE";
  }

  if (classification.confidence >= 50) {
    reasons.push("confidence is below automation confirmation threshold");
    return "ESCALATE_TO_HUMAN";
  }

  reasons.push("confidence is too low for automation");
  return "DENY_AUTOMATION";
}

function determineNextAction(input: PolicyInput, reasons: string[]): string {
  if (hardDenyIntents.has(input.classification.intent)) {
    return "Route to technician queue; do not automate identity or access changes.";
  }

  if (input.classification.intent === "server_issue" || input.deviceMatchStatus === "server") {
    return "Require technician review before any server-related action.";
  }

  if (input.classification.intent === "security_incident" || input.classification.highRiskPenaltyApplied) {
    return "Escalate to human security review.";
  }

  if (input.classification.intent === "unknown") {
    return "Ask a technician to clarify the request before any automation consideration.";
  }

  if (!input.componentRegistryEntry || !input.componentRegistryEntry.enabled) {
    return "Have a technician enable or map an approved component registry entry, or handle manually.";
  }

  if (!input.componentRegistryEntry.allowedIntents.includes(input.classification.intent)) {
    return "Have a technician review the registry intent mapping before any automation consideration.";
  }

  const matchedAssetType = input.matchedDevice?.kind ?? null;
  if (matchedAssetType && !input.componentRegistryEntry.allowedAssetTypes.includes(matchedAssetType)) {
    return "Have a technician review the registry asset-type mapping before any automation consideration.";
  }

  if (input.deviceMatchStatus !== "matched") {
    if (input.deviceMatchStatus === "missing") {
      return "Escalate to human review because no safe device match was found.";
    }
    return "Ask the client to select or confirm the affected workstation.";
  }

  const deviceMatchConfidence = input.deviceMatchResult?.confidence ?? 100;
  if (deviceMatchConfidence < 85) {
    return "Collect more device context before any confirmation workflow.";
  }

  if (input.classification.confidence >= 90) {
    return "Eligible to request client confirmation in a later phase; do not execute in Phase 5.";
  }

  reasons.push("next action selected from confidence threshold");
  return "Escalate to human review or collect more device context.";
}

function assertApprovedOutcome(outcome: AutomationDecisionOutcome): void {
  if (!approvedOutcomes.includes(outcome)) {
    throw new Error(`Policy produced unsupported outcome: ${outcome}`);
  }
}
