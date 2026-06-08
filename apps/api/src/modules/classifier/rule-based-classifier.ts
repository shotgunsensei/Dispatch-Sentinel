import type { Ticket, TicketIntent } from "@dispatch-sentinel/shared";

export interface ClassifierContext {
  contactDeviceCorrelated: boolean;
  accountSiteMatched: boolean;
}

export interface ClassificationResult {
  intent: TicketIntent;
  confidence: number;
  explicitHostname: string | null;
  clearKeywordMatch: boolean;
  contactDeviceCorrelated: boolean;
  accountSiteMatched: boolean;
  ambiguityPenaltyApplied: boolean;
  highRiskPenaltyApplied: boolean;
  hardDeny: boolean;
  matchedKeywords: string[];
  reasons: string[];
}

interface IntentRule {
  intent: TicketIntent;
  keywords: RegExp[];
}

const safeIntentRules: IntentRule[] = [
  {
    intent: "clear_stuck_print_jobs",
    keywords: [/clear stuck print jobs/i, /clear print queue/i, /stuck print jobs/i]
  },
  {
    intent: "restart_print_spooler",
    keywords: [/print(?:er|ing)?/i, /spooler/i, /stuck print queue/i]
  },
  {
    intent: "run_gpupdate",
    keywords: [/gpupdate/i, /group policy/i, /mapped drive policy/i]
  },
  {
    intent: "collect_workstation_diagnostics",
    keywords: [/computer slow/i, /workstation diagnostics/i, /collect diagnostics/i, /slow laptop/i]
  },
  {
    intent: "clear_safe_temp_files",
    keywords: [/temp files/i, /clear cache/i, /disk cleanup/i, /free up space/i]
  },
  {
    intent: "restart_user_app_process",
    keywords: [/restart (?:outlook|teams|chrome|edge|word|excel)/i, /app (?:hung|frozen|not responding)/i]
  },
  {
    intent: "reboot_workstation",
    keywords: [/reboot workstation/i, /restart workstation/i, /reboot (?:pc|computer|laptop)/i]
  },
  {
    intent: "repair_mapped_drive",
    keywords: [/mapped drive (?:missing|not working|repair|fix|disconnected)/i, /network drive (?:missing|not working|disconnected)/i]
  },
  {
    intent: "restart_scanner_wia",
    keywords: [/scanner (?:not working|stuck|offline)/i, /\bwia\b/i, /windows image acquisition/i]
  },
  {
    intent: "restart_vpn_client",
    keywords: [/restart (?:known )?vpn (?:client|service)/i, /vpn client (?:hung|stuck|not responding)/i]
  },
  {
    intent: "collect_vpn_diagnostics",
    keywords: [/vpn diagnostics/i, /collect vpn logs/i, /vpn connection diagnostics/i]
  },
  {
    intent: "browser_cache_cleanup",
    keywords: [/browser cache/i, /clear (?:chrome|edge|browser) cache/i, /website cache issue/i]
  },
  {
    intent: "teams_office_diagnostics",
    keywords: [/(?:teams|office|outlook) diagnostics/i, /collect (?:teams|office|outlook) logs/i, /office basic diagnostics/i]
  }
];

const hardDenyIntentRules: IntentRule[] = [
  {
    intent: "password_reset",
    keywords: [/password reset/i, /reset password/i, /cannot sign in/i, /locked out/i]
  },
  {
    intent: "mfa_reset",
    keywords: [/\bmfa\b/i, /authenticator reset/i, /multi[- ]factor/i, /new phone/i]
  },
  {
    intent: "security_incident",
    keywords: [
      /suspicious login/i,
      /phishing/i,
      /suspicious email/i,
      /malware/i,
      /ransomware/i,
      /account compromise/i,
      /compromised account/i
    ]
  },
  {
    intent: "server_issue",
    keywords: [/server down/i, /\bserver\b.*(?:unavailable|offline|down)/i, /domain controller/i]
  }
];

const hardDenyKeywordRules = [
  /firewall/i,
  /network policy/i,
  /backup failure/i,
  /delete (?:data|files|folder)/i,
  /data deletion/i,
  /vpn (?:password|credential|mfa|token|policy|firewall)/i,
  /browser (?:password|saved passwords|credentials)/i,
  /office (?:license|activation|account|password)/i,
  /teams (?:account|login|mfa|password)/i
];

const ambiguousKeywordRules = [
  /computer broken/i,
  /does not work/i,
  /not working/i,
  /broken/i,
  /fix it/i,
  /help/i,
  /issue/i
];

const hostnamePattern = /\b(?:[A-Z]{2,}[A-Z0-9]*-[A-Z0-9-]*\d{1,4}|[A-Z]+(?:PC|WS|LAPTOP|DESKTOP|SERVER)[A-Z0-9-]*\d*)\b/i;

export function classifyTicket(ticket: Ticket, context: ClassifierContext): ClassificationResult {
  const text = `${ticket.title}\n${ticket.description}`.trim();
  const explicitHostname = text.match(hostnamePattern)?.[0] ?? null;
  const hardDenyRule = findFirstRuleMatch(hardDenyIntentRules, text);
  const safeRule = findFirstRuleMatch(safeIntentRules, text);
  const highRiskKeyword = hardDenyKeywordRules.find((rule) => rule.test(text));
  const intent = hardDenyRule?.intent ?? safeRule?.intent ?? (highRiskKeyword ? "security_incident" : "unknown");
  const matchedKeywords = [
    ...(hardDenyRule?.matchedKeywords ?? []),
    ...(safeRule?.matchedKeywords ?? []),
    ...(highRiskKeyword ? [highRiskKeyword.source] : [])
  ];
  const clearKeywordMatch = matchedKeywords.length > 0;
  const ambiguityPenaltyApplied = shouldApplyAmbiguityPenalty(text, clearKeywordMatch, intent);
  const highRiskPenaltyApplied = Boolean(hardDenyRule || highRiskKeyword);
  const hardDeny = highRiskPenaltyApplied || intent === "password_reset" || intent === "mfa_reset" || intent === "server_issue";

  const reasons: string[] = [];
  let confidence = 20;

  if (clearKeywordMatch) {
    confidence += 45;
    reasons.push(`clear keyword match for ${intent}`);
  } else {
    reasons.push("no clear automation keyword match");
  }

  if (explicitHostname) {
    confidence += 20;
    reasons.push(`explicit hostname detected: ${explicitHostname}`);
  }

  if (context.contactDeviceCorrelated) {
    confidence += 10;
    reasons.push("contact/device correlation present");
  }

  if (context.accountSiteMatched) {
    confidence += 10;
    reasons.push("account/site match present");
  }

  if (ambiguityPenaltyApplied) {
    confidence -= 25;
    reasons.push("ambiguity penalty applied");
  }

  if (highRiskPenaltyApplied) {
    confidence -= 30;
    reasons.push("high-risk keyword penalty applied");
  }

  return {
    intent,
    confidence: clampConfidence(confidence),
    explicitHostname,
    clearKeywordMatch,
    contactDeviceCorrelated: context.contactDeviceCorrelated,
    accountSiteMatched: context.accountSiteMatched,
    ambiguityPenaltyApplied,
    highRiskPenaltyApplied,
    hardDeny,
    matchedKeywords,
    reasons
  };
}

function findFirstRuleMatch(rules: IntentRule[], text: string): { intent: TicketIntent; matchedKeywords: string[] } | null {
  for (const rule of rules) {
    const matchedKeywords = rule.keywords.filter((keyword) => keyword.test(text)).map((keyword) => keyword.source);
    if (matchedKeywords.length > 0) {
      return {
        intent: rule.intent,
        matchedKeywords
      };
    }
  }

  return null;
}

function shouldApplyAmbiguityPenalty(text: string, clearKeywordMatch: boolean, intent: TicketIntent): boolean {
  if (intent === "unknown") {
    return true;
  }

  if (clearKeywordMatch && intent !== "collect_workstation_diagnostics") {
    return false;
  }

  return ambiguousKeywordRules.some((rule) => rule.test(text));
}

function clampConfidence(score: number): number {
  return Math.max(0, Math.min(100, score));
}
