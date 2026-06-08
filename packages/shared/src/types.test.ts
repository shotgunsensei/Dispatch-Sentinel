import { describe, expect, it } from "vitest";
import type { AutomationDecisionOutcome, TicketIntent } from "./types.js";

const allowedOutcomes: AutomationDecisionOutcome[] = [
  "AUTO_ELIGIBLE_CONFIRM_CLIENT",
  "ASK_CLIENT_TO_SELECT_DEVICE",
  "REQUIRE_TECH_APPROVAL",
  "ESCALATE_TO_HUMAN",
  "DENY_AUTOMATION"
];

describe("AutomationDecisionOutcome", () => {
  it("documents the only allowed decision outcomes", () => {
    expect(allowedOutcomes).toHaveLength(5);
    expect(allowedOutcomes).toContain("ESCALATE_TO_HUMAN");
  });
});

describe("TicketIntent", () => {
  it("documents the Phase 2 rule-based classifier intents", () => {
    const intents: TicketIntent[] = [
      "restart_print_spooler",
      "run_gpupdate",
      "collect_workstation_diagnostics",
      "clear_safe_temp_files",
      "restart_user_app_process",
      "reboot_workstation",
      "password_reset",
      "mfa_reset",
      "security_incident",
      "server_issue",
      "unknown"
    ];

    expect(intents).toHaveLength(11);
    expect(intents).toContain("unknown");
  });
});
