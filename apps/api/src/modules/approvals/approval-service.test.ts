import { describe, expect, it } from "vitest";
import type { ComponentRegistryEntry, Device, Ticket } from "@dispatch-sentinel/shared";
import { MockDattoDeviceAdapter } from "../assets/mock-datto-device-adapter.js";
import { ComponentRegistryRepository } from "../component-registry/registry.js";
import { ApprovalRequestRepository, ApprovalService, hashApprovalToken } from "./approval-service.js";

describe("ApprovalService", () => {
  it("creates approval request with one-time hashed token and confirmation email", async () => {
    const fixture = createFixture();
    const result = await fixture.service.createApprovalRequest(createInput(fixture));

    expect(result.token).toBeTruthy();
    expect(result.request.tokenHash).toBe(hashApprovalToken(result.token));
    expect(result.request.status).toBe("pending");
    expect(result.request.expiresAt).toBe("2026-06-05T15:00:00.000Z");
    expect(result.email.subject).toBe("Confirm device for ticket #BMS-1001: Printer issue");
    expect(result.email.body).toContain("No changes will be made unless you approve this action.");
    expect(result.email.body).toContain(result.email.approveLink);
    expect(result.email.body).toContain(result.email.rejectLink);
  });

  it("approves valid token once", async () => {
    const fixture = createFixture();
    const { token } = await fixture.service.createApprovalRequest(createInput(fixture));
    const approved = await fixture.service.approve(token, { ip: "127.0.0.1", userAgent: "vitest", now: new Date("2026-06-05T14:05:00.000Z") });

    expect(approved.status).toBe("approved");
    expect(approved.approvedAt).toBe("2026-06-05T14:05:00.000Z");
    expect(approved.approvalIp).toBe("127.0.0.1");
  });

  it("rejects valid token once", async () => {
    const fixture = createFixture();
    const { token } = await fixture.service.createApprovalRequest(createInput(fixture));
    const rejected = await fixture.service.reject(token, { ip: "127.0.0.1", userAgent: "vitest", now: new Date("2026-06-05T14:10:00.000Z") });

    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectedAt).toBe("2026-06-05T14:10:00.000Z");
  });

  it("fails expired tokens", async () => {
    const fixture = createFixture();
    const { token } = await fixture.service.createApprovalRequest(createInput(fixture));

    await expect(
      fixture.service.approve(token, { ip: null, userAgent: null, now: new Date("2026-06-05T15:01:00.000Z") })
    ).rejects.toThrow("Approval token has expired.");

    expect(fixture.repository.findByToken(token)?.status).toBe("expired");
  });

  it("fails reused tokens", async () => {
    const fixture = createFixture();
    const { token } = await fixture.service.createApprovalRequest(createInput(fixture));
    await fixture.service.approve(token, { ip: null, userAgent: null, now: new Date("2026-06-05T14:01:00.000Z") });

    await expect(
      fixture.service.reject(token, { ip: null, userAgent: null, now: new Date("2026-06-05T14:02:00.000Z") })
    ).rejects.toThrow("Approval token has already been used.");
  });

  it("disabled component prevents approval", async () => {
    const fixture = createFixture();
    const { token } = await fixture.service.createApprovalRequest(createInput(fixture));
    fixture.componentRegistry.update("restart-print-spooler", { enabled: false });

    await expect(
      fixture.service.approve(token, { ip: null, userAgent: null, now: new Date("2026-06-05T14:01:00.000Z") })
    ).rejects.toThrow("component is disabled or missing");
  });

  it("mismatched device/component fails approval", async () => {
    const fixture = createFixture();
    const component = fixture.componentRegistry.get("restart-print-spooler")!;
    const device = { ...fixture.device, dattoDeviceUid: "missing-device" };
    const { token } = await fixture.service.createApprovalRequest(createInput(fixture, { component, device }));

    await expect(
      fixture.service.approve(token, { ip: null, userAgent: null, now: new Date("2026-06-05T14:01:00.000Z") })
    ).rejects.toThrow("device is not eligible");
  });
});

function createFixture() {
  const repository = new ApprovalRequestRepository();
  const componentRegistry = new ComponentRegistryRepository();
  const deviceAdapter = new MockDattoDeviceAdapter();
  const service = new ApprovalService(repository, componentRegistry, deviceAdapter);
  const component = componentRegistry.get("restart-print-spooler")!;
  const device = {
    id: "device-accounting-pc-04",
    dattoDeviceUid: "datto-device-accounting-pc-04",
    hostname: "ACCOUNTING-PC-04",
    accountId: "acct-001",
    dattoSiteUid: "site-contoso-main",
    siteLocationId: "loc-contoso-main",
    kind: "workstation",
    assetType: "workstation",
    lastLoggedInUser: "alicia",
    onlineStatus: "online",
    isAutomationEligible: true,
    lastSeenAt: "2026-06-05T13:32:00.000Z",
    serialNumber: "CNTO-PC04-001",
    operatingSystem: "Windows 11 Pro",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z"
  } satisfies Device;

  return { repository, componentRegistry, service, component, device };
}

function createInput(
  fixture: ReturnType<typeof createFixture>,
  overrides: Partial<{ component: ComponentRegistryEntry; device: Device }> = {}
) {
  return {
    ticket: ticket(),
    device: overrides.device ?? fixture.device,
    component: overrides.component ?? fixture.component,
    requesterEmail: "alicia@example.test",
    baseUrl: "https://dispatch.example.test",
    now: new Date("2026-06-05T14:00:00.000Z")
  };
}

function ticket(): Ticket {
  return {
    id: "ticket:BMS-1001",
    externalBmsId: "BMS-1001",
    accountId: "acct-001",
    accountName: "Contoso Accounting",
    contactId: "contact-001",
    contactName: "Alicia Smith",
    contactEmail: "alicia@example.test",
    title: "Printer issue",
    description: "Printer queue is stuck.",
    queue: "Helpdesk",
    status: "new",
    priority: "Medium",
    source: "bms",
    createdAt: "2026-06-05T13:00:00.000Z",
    updatedAt: "2026-06-05T13:00:00.000Z"
  };
}
