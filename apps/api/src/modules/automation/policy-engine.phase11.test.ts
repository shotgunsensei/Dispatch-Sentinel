import type { ComponentRegistryEntry, Device, Ticket, TicketIntent } from "@dispatch-sentinel/shared";
import { describe, expect, it } from "vitest";
import { classifyTicket } from "../classifier/rule-based-classifier.js";
import { ComponentRegistryRepository } from "../component-registry/registry.js";
import { evaluateTicketPolicy } from "./policy-engine.js";

const eligibleCases: Array<{ title: string; description: string; intent: TicketIntent; slug: string; expected: "AUTO_ELIGIBLE_CONFIRM_CLIENT" | "REQUIRE_TECH_APPROVAL" }> = [
  {
    title: "Mapped drive missing on ACCOUNTING-PC-04",
    description: "Please repair mapped drive not working for the user.",
    intent: "repair_mapped_drive",
    slug: "repair-mapped-drive",
    expected: "AUTO_ELIGIBLE_CONFIRM_CLIENT"
  },
  {
    title: "Scanner not working on ACCOUNTING-PC-04",
    description: "Restart scanner WIA service please.",
    intent: "restart_scanner_wia",
    slug: "restart-scanner-wia",
    expected: "AUTO_ELIGIBLE_CONFIRM_CLIENT"
  },
  {
    title: "Restart VPN client on ACCOUNTING-PC-04",
    description: "The VPN client is hung and needs the known VPN client service restarted.",
    intent: "restart_vpn_client",
    slug: "restart-vpn-client",
    expected: "AUTO_ELIGIBLE_CONFIRM_CLIENT"
  },
  {
    title: "VPN diagnostics on ACCOUNTING-PC-04",
    description: "Please collect VPN diagnostics and VPN logs.",
    intent: "collect_vpn_diagnostics",
    slug: "collect-vpn-diagnostics",
    expected: "AUTO_ELIGIBLE_CONFIRM_CLIENT"
  },
  {
    title: "Browser cache cleanup on ACCOUNTING-PC-04",
    description: "Please clear Chrome browser cache for a website cache issue.",
    intent: "browser_cache_cleanup",
    slug: "browser-cache-cleanup",
    expected: "AUTO_ELIGIBLE_CONFIRM_CLIENT"
  },
  {
    title: "Teams diagnostics on ACCOUNTING-PC-04",
    description: "Collect Teams Office diagnostics for call quality.",
    intent: "teams_office_diagnostics",
    slug: "teams-office-diagnostics",
    expected: "AUTO_ELIGIBLE_CONFIRM_CLIENT"
  },
  {
    title: "Reboot workstation ACCOUNTING-PC-04",
    description: "User confirmed we can reboot workstation after updates.",
    intent: "reboot_workstation",
    slug: "reboot-workstation",
    expected: "AUTO_ELIGIBLE_CONFIRM_CLIENT"
  },
  {
    title: "Clear stuck print jobs on ACCOUNTING-PC-04",
    description: "User confirmed to clear stuck print jobs in the local print queue.",
    intent: "clear_stuck_print_jobs",
    slug: "clear-stuck-print-jobs",
    expected: "AUTO_ELIGIBLE_CONFIRM_CLIENT"
  }
];

describe("Phase 11 approved automation library", () => {
  it.each(eligibleCases)("classifies and approves $intent only through registry", ({ title, description, intent, slug, expected }) => {
    const registry = new ComponentRegistryRepository();
    const component = registry.get(slug)!;
    const ticket = ticketFromText(title, description);
    const decision = decide(ticket, component);

    expect(component.allowedIntents).toContain(intent);
    expect(decision.detectedIntent).toBe(intent);
    expect(decision.outcome).toBe(expected);
    expect(decision.componentRegistryEntryId).toBe(component.id);
  });

  it("blocks a new category when the registry component is missing", () => {
    const ticket = ticketFromText("Mapped drive missing on ACCOUNTING-PC-04", "Please repair mapped drive not working.");
    const decision = decide(ticket, null);

    expect(decision.detectedIntent).toBe("repair_mapped_drive");
    expect(decision.outcome).toBe("ESCALATE_TO_HUMAN");
    expect(decision.reasons).toContain("no matching component registry entry found");
  });

  it.each([
    ["VPN policy change on ACCOUNTING-PC-04", "Please change VPN policy and firewall routing."],
    ["Browser saved passwords on ACCOUNTING-PC-04", "Clear browser saved passwords and credentials."],
    ["Office account issue on ACCOUNTING-PC-04", "Fix Office license activation and account login."]
  ])("escalates unsafe variation: %s", (title, description) => {
    const registry = new ComponentRegistryRepository();
    const ticket = ticketFromText(title, description);
    const classification = classifyTicket(ticket, { contactDeviceCorrelated: true, accountSiteMatched: true });
    const component = registry.findEnabledMatch(classification.intent, "workstation");
    const decision = evaluateTicketPolicy({
      ticket,
      classification,
      componentRegistryEntry: component,
      deviceMatchStatus: "matched",
      matchedDevice: workstation()
    });

    expect(decision.outcome).toBe("ESCALATE_TO_HUMAN");
    expect(decision.reasons).toContain("security or high-risk request requires human review");
  });
});

function decide(ticket: Ticket, component: ComponentRegistryEntry | null) {
  const classification = classifyTicket(ticket, { contactDeviceCorrelated: true, accountSiteMatched: true });
  return evaluateTicketPolicy({
    ticket,
    classification,
    componentRegistryEntry: component,
    deviceMatchStatus: "matched",
    matchedDevice: workstation()
  });
}

function ticketFromText(title: string, description: string): Ticket {
  return {
    id: "ticket:phase11",
    externalBmsId: "BMS-P11",
    accountId: "acct-001",
    accountName: "Contoso Accounting",
    contactId: "contact-001",
    contactName: "Alicia Smith",
    contactEmail: "alicia@example.test",
    title,
    description,
    queue: "Helpdesk",
    status: "new",
    priority: "Medium",
    source: "bms",
    createdAt: "2026-06-08T12:00:00.000Z",
    updatedAt: "2026-06-08T12:00:00.000Z"
  };
}

function workstation(): Device {
  return {
    id: "device-accounting-pc-04",
    accountId: "acct-001",
    dattoSiteUid: "site-001",
    siteLocationId: "loc-001",
    dattoDeviceUid: "datto-device-accounting-pc-04",
    hostname: "ACCOUNTING-PC-04",
    kind: "workstation",
    assetType: "workstation",
    lastLoggedInUser: "alicia",
    onlineStatus: "online",
    isAutomationEligible: true,
    lastSeenAt: "2026-06-08T12:00:00.000Z",
    serialNumber: "SERIAL-001",
    operatingSystem: "Windows 11 Pro",
    createdAt: "2026-06-08T12:00:00.000Z",
    updatedAt: "2026-06-08T12:00:00.000Z"
  };
}
