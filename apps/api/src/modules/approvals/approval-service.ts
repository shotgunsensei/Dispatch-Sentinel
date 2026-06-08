import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ApprovalRequest, ComponentRegistryEntry, Device, Ticket } from "@dispatch-sentinel/shared";
import type { ComponentRegistryRepository } from "../component-registry/registry.js";
import type { DeviceAdapter } from "../assets/types.js";
import type { BmsAdapter } from "../bms/types.js";

export interface ApprovalRequestCreateInput {
  ticket: Ticket;
  device: Device;
  component: ComponentRegistryEntry;
  requesterEmail: string;
  baseUrl: string;
  now?: Date;
  expiresInMinutes?: number;
}

export interface ApprovalRequestCreateResult {
  request: ApprovalRequest;
  token: string;
  email: ConfirmationEmail;
}

export interface ConfirmationEmail {
  subject: string;
  body: string;
  approveLink: string;
  rejectLink: string;
}

export interface ApprovalActionContext {
  ip: string | null;
  userAgent: string | null;
  now?: Date;
}

export class ApprovalRequestRepository {
  private readonly requests = new Map<string, ApprovalRequest>();

  create(request: ApprovalRequest): ApprovalRequest {
    this.requests.set(request.id, structuredClone(request));
    return structuredClone(request);
  }

  get(id: string): ApprovalRequest | null {
    const request = this.requests.get(id);
    return request ? structuredClone(request) : null;
  }

  findByToken(token: string): ApprovalRequest | null {
    const tokenHash = hashApprovalToken(token);
    for (const request of this.requests.values()) {
      if (safeEqual(request.tokenHash, tokenHash)) {
        return structuredClone(request);
      }
    }
    return null;
  }

  findActiveDuplicate(input: { ticketId: string; deviceUid: string; componentId: string }): ApprovalRequest | null {
    const request = [...this.requests.values()].find(
      (candidate) =>
        candidate.ticketId === input.ticketId &&
        candidate.deviceUid === input.deviceUid &&
        candidate.componentId === input.componentId &&
        candidate.status === "pending"
    );
    return request ? structuredClone(request) : null;
  }

  update(request: ApprovalRequest): ApprovalRequest {
    this.requests.set(request.id, structuredClone(request));
    return structuredClone(request);
  }

  cancel(id: string, now = new Date()): ApprovalRequest | null {
    const request = this.requests.get(id);
    if (!request || request.status !== "pending") {
      return null;
    }
    const cancelled: ApprovalRequest = {
      ...request,
      status: "canceled",
      updatedAt: now.toISOString()
    };
    this.requests.set(cancelled.id, structuredClone(cancelled));
    return structuredClone(cancelled);
  }

  list(): ApprovalRequest[] {
    return [...this.requests.values()].map((request) => structuredClone(request));
  }
}

export class ApprovalService {
  constructor(
    private readonly repository: ApprovalRequestRepository,
    private readonly componentRegistry: ComponentRegistryRepository,
    private readonly deviceAdapter: DeviceAdapter,
    private readonly bmsAdapter: BmsAdapter | null = null
  ) {}

  async createApprovalRequest(input: ApprovalRequestCreateInput): Promise<ApprovalRequestCreateResult> {
    if (!input.ticket.contactId || !input.ticket.contactEmail) {
      throw new Error("Approval request requires a known contact.");
    }

    validateComponentForApproval(input.component);
    validateDeviceForApproval(input.device);
    const deviceUid = input.device.dattoDeviceUid ?? input.device.id;
    const duplicate = this.repository.findActiveDuplicate({
      ticketId: input.ticket.id,
      deviceUid,
      componentId: input.component.id
    });
    if (duplicate) {
      throw new Error("An active approval request already exists for this ticket, device, and component.");
    }

    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + (input.expiresInMinutes ?? 60) * 60 * 1000).toISOString();
    const token = randomBytes(32).toString("base64url");
    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      ticketId: input.ticket.id,
      accountId: input.ticket.accountId,
      contactId: input.ticket.contactId,
      deviceUid,
      componentId: input.component.id,
      tokenHash: hashApprovalToken(token),
      status: "pending",
      expiresAt,
      approvedAt: null,
      rejectedAt: null,
      requesterEmail: input.requesterEmail,
      approvalIp: null,
      userAgent: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    const created = this.repository.create(request);
    const email = generateConfirmationEmail({
      ticket: input.ticket,
      device: input.device,
      component: input.component,
      token,
      baseUrl: input.baseUrl
    });

    await this.writeInternalNote(input.ticket.externalBmsId, `Approval requested for ${input.component.name} on ${input.device.hostname}.`);

    return { request: created, token, email };
  }

  previewToken(token: string, now = new Date()): ApprovalRequest {
    const request = this.repository.findByToken(token);
    if (!request) {
      throw new Error("Approval token was not found.");
    }
    return this.ensureTokenUsable(request, now);
  }

  async approve(token: string, context: ApprovalActionContext): Promise<ApprovalRequest> {
    const now = context.now ?? new Date();
    const request = this.ensureTokenUsable(this.requireRequest(token), now);
    await this.validateCurrentMappings(request);
    const updated = this.repository.update({
      ...request,
      status: "approved",
      approvedAt: now.toISOString(),
      approvalIp: context.ip,
      userAgent: context.userAgent,
      updatedAt: now.toISOString()
    });
    await this.writeInternalNoteForRequest(updated, "approved");
    return updated;
  }

  async reject(token: string, context: ApprovalActionContext): Promise<ApprovalRequest> {
    const now = context.now ?? new Date();
    const request = this.ensureTokenUsable(this.requireRequest(token), now);
    await this.validateCurrentMappings(request);
    const updated = this.repository.update({
      ...request,
      status: "rejected",
      rejectedAt: now.toISOString(),
      approvalIp: context.ip,
      userAgent: context.userAgent,
      updatedAt: now.toISOString()
    });
    await this.writeInternalNoteForRequest(updated, "rejected");
    return updated;
  }

  private requireRequest(token: string): ApprovalRequest {
    const request = this.repository.findByToken(token);
    if (!request) {
      throw new Error("Approval token was not found.");
    }
    return request;
  }

  private ensureTokenUsable(request: ApprovalRequest, now: Date): ApprovalRequest {
    if (request.status !== "pending") {
      throw new Error("Approval token has already been used.");
    }

    if (Date.parse(request.expiresAt) <= now.getTime()) {
      const expired = this.repository.update({
        ...request,
        status: "expired",
        updatedAt: now.toISOString()
      });
      void this.writeInternalNoteForRequest(expired, "expired");
      throw new Error("Approval token has expired.");
    }

    return request;
  }

  private async validateCurrentMappings(request: ApprovalRequest): Promise<void> {
    const component = this.componentRegistry.get(request.componentId);
    if (!component || !component.enabled) {
      throw new Error("Approval cannot continue because the component is disabled or missing.");
    }

    const device = await this.deviceAdapter.getDeviceByUid(request.deviceUid);
    if (!device || !device.isAutomationEligible || device.assetType === "server") {
      throw new Error("Approval cannot continue because the device is not eligible.");
    }

    if (!component.allowedAssetTypes.includes(device.assetType)) {
      throw new Error("Approval device no longer matches the component asset policy.");
    }
  }

  private async writeInternalNoteForRequest(request: ApprovalRequest, status: "approved" | "rejected" | "expired") {
    await this.writeInternalNote(request.ticketId.replace(/^ticket:/, ""), `Approval ${status} for component ${request.componentId} on device ${request.deviceUid}.`);
  }

  private async writeInternalNote(ticketId: string | null, note: string) {
    if (this.bmsAdapter && ticketId) {
      await this.bmsAdapter.addInternalNote(ticketId, note);
    }
  }
}

export function generateConfirmationEmail(input: {
  ticket: Ticket;
  device: Device;
  component: ComponentRegistryEntry;
  token: string;
  baseUrl: string;
}): ConfirmationEmail {
  const ticketNumber = input.ticket.externalBmsId ?? input.ticket.id.replace(/^ticket:/, "");
  const approveLink = `${input.baseUrl.replace(/\/$/, "")}/approve/${encodeURIComponent(input.token)}`;
  const rejectLink = `${input.baseUrl.replace(/\/$/, "")}/reject/${encodeURIComponent(input.token)}`;
  const subject = `Confirm device for ticket #${ticketNumber}: ${input.ticket.title}`;
  const body = [
    "We found a likely match for your request.",
    "",
    `Ticket: #${ticketNumber}`,
    `Requested action: ${input.component.name}`,
    `Device: ${input.device.hostname}`,
    `Last logged-in user: ${input.device.lastLoggedInUser ?? "unknown"}`,
    `Status: ${input.device.onlineStatus}`,
    `Client: ${input.ticket.accountName ?? input.ticket.accountId}`,
    "",
    "No changes will be made unless you approve this action.",
    "",
    "Approve:",
    approveLink,
    "",
    "Reject:",
    rejectLink,
    "",
    "If this is not the correct device, reject this request and a technician will review the ticket."
  ].join("\n");

  return { subject, body, approveLink, rejectLink };
}

export function hashApprovalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "hex");
  const bBuffer = Buffer.from(b, "hex");
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function validateComponentForApproval(component: ComponentRegistryEntry): void {
  if (!component.enabled) {
    throw new Error("Cannot request approval for a disabled component.");
  }
}

function validateDeviceForApproval(device: Device): void {
  if (!device.dattoDeviceUid || !device.isAutomationEligible || device.assetType === "server") {
    throw new Error("Cannot request approval for an ineligible device.");
  }
}
