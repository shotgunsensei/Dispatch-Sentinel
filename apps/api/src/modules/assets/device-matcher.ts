import type { Device, Ticket } from "@dispatch-sentinel/shared";
import type { HistoricalTicketDeviceRelation } from "./types.js";

export type DeviceMatchOutcome = "single_high_confidence_match" | "multiple_possible_matches" | "no_match" | "unsafe_match";

export interface DeviceMatchCandidate {
  device: Device;
  score: number;
  reasons: string[];
}

export interface DeviceMatchResult {
  outcome: DeviceMatchOutcome;
  confidence: number;
  matchedDevice: Device | null;
  candidates: DeviceMatchCandidate[];
  reasons: string[];
}

export interface DeviceMatchContext {
  ticket: Ticket;
  devices: Device[];
  siteLocationId?: string | null;
  historicalRelations?: HistoricalTicketDeviceRelation[];
}

const hostnameTokenPattern = /\b[A-Z0-9]+(?:-[A-Z0-9]+)+\b/gi;

export function matchDeviceForTicket(context: DeviceMatchContext): DeviceMatchResult {
  const scopedDevices = context.devices.filter((device) => device.accountId === context.ticket.accountId);
  const candidates = scopedDevices
    .map((device) => scoreDevice(context, device))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return {
      outcome: "no_match",
      confidence: 0,
      matchedDevice: null,
      candidates: [],
      reasons: ["no device matched ticket context"]
    };
  }

  const similarMatches = candidates.filter((candidate) => Math.abs(candidate.score - candidates[0]!.score) <= 10);
  const adjustedCandidates =
    similarMatches.length > 1
      ? candidates.map((candidate) =>
          similarMatches.some((match) => match.device.id === candidate.device.id)
            ? {
                ...candidate,
                score: clampScore(candidate.score - 30),
                reasons: [...candidate.reasons, "multiple similar matches penalty: -30"]
              }
            : candidate
        )
      : candidates;
  adjustedCandidates.sort((a, b) => b.score - a.score);

  const best = adjustedCandidates[0]!;
  const topSimilar = adjustedCandidates.filter((candidate) => Math.abs(candidate.score - best.score) <= 10);

  if (best.device.assetType === "server" || best.device.kind === "server") {
    return {
      outcome: "unsafe_match",
      confidence: best.score,
      matchedDevice: best.device,
      candidates: adjustedCandidates,
      reasons: [...best.reasons, "server match requires technician approval"]
    };
  }

  if (topSimilar.length > 1 || best.score < 85 && best.score >= 60) {
    return {
      outcome: "multiple_possible_matches",
      confidence: best.score,
      matchedDevice: null,
      candidates: adjustedCandidates,
      reasons: [...best.reasons, "device confidence requires client selection"]
    };
  }

  if (best.score >= 85) {
    return {
      outcome: "single_high_confidence_match",
      confidence: best.score,
      matchedDevice: best.device,
      candidates: adjustedCandidates,
      reasons: best.reasons
    };
  }

  return {
    outcome: "no_match",
    confidence: best.score,
    matchedDevice: null,
    candidates: adjustedCandidates,
    reasons: [...best.reasons, "device confidence below human-review threshold"]
  };
}

function scoreDevice(context: DeviceMatchContext, device: Device): DeviceMatchCandidate {
  const ticketText = `${context.ticket.title}\n${context.ticket.description}`;
  const ticketTextLower = ticketText.toLowerCase();
  const hostnameLower = device.hostname.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  if (ticketTextLower.includes(hostnameLower)) {
    score += 40;
    reasons.push("exact hostname match: +40");
  } else {
    const hostnameParts = device.hostname.toLowerCase().split(/[-_.\s]+/).filter((part) => part.length >= 3);
    const ticketTokens = new Set(ticketTextLower.match(hostnameTokenPattern)?.map((token) => token.toLowerCase()) ?? []);
    const partialMatch = hostnameParts.some((part) => ticketTextLower.includes(part)) || [...ticketTokens].some((token) => hostnameLower.includes(token));
    if (partialMatch) {
      score += 20;
      reasons.push("partial hostname match: +20");
    }
  }

  if (contactMatchesLastUser(context.ticket, device)) {
    score += 25;
    reasons.push("contact matches last logged-in user: +25");
  }

  if (device.accountId === context.ticket.accountId) {
    score += 20;
    reasons.push("same account: +20");
  }

  if (context.siteLocationId && device.siteLocationId === context.siteLocationId) {
    score += 10;
    reasons.push("same location: +10");
  }

  if (isRecentlyOnline(device)) {
    score += 10;
    reasons.push("online recently: +10");
  }

  if (context.historicalRelations?.some((relation) => relation.ticketId === context.ticket.id && relation.deviceId === device.id)) {
    score += 15;
    reasons.push("past ticket/device relation: +15");
  }

  if (device.assetType === "server" || device.kind === "server") {
    score -= 40;
    reasons.push("server penalty: -40");
  }

  return {
    device,
    score: clampScore(score),
    reasons
  };
}

function contactMatchesLastUser(ticket: Ticket, device: Device): boolean {
  if (!device.lastLoggedInUser) {
    return false;
  }

  const lastUser = normalizeIdentity(device.lastLoggedInUser);
  const emailUser = ticket.contactEmail?.split("@")[0] ?? "";
  const contactNameParts = ticket.contactName?.split(/\s+/) ?? [];
  const candidates = [emailUser, ...contactNameParts].map(normalizeIdentity).filter(Boolean);
  return candidates.some((candidate) => candidate === lastUser);
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRecentlyOnline(device: Device): boolean {
  if (device.onlineStatus !== "online" || !device.lastSeenAt) {
    return false;
  }

  const lastSeen = Date.parse(device.lastSeenAt);
  const reference = Date.parse("2026-06-05T14:00:00.000Z");
  return Number.isFinite(lastSeen) && reference - lastSeen <= 24 * 60 * 60 * 1000;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}
