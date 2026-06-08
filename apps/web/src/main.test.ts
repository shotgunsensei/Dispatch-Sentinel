import { describe, expect, it } from "vitest";
import { renderAdminDashboard } from "./main.js";

describe("admin dashboard routes", () => {
  it("renders the overview route", () => {
    const html = renderAdminDashboard("overview");

    expect(html).toContain("Phase 12 Admin");
    expect(html).toContain("Tickets evaluated today");
    expect(html).toContain("Escalated to human");
  });

  it("renders ticket evaluations", () => {
    const html = renderAdminDashboard("evaluations");

    expect(html).toContain("Recent ticket evaluations");
    expect(html).toContain("AUTO_ELIGIBLE_CONFIRM_CLIENT");
    expect(html).toContain("Open audit");
  });

  it("renders component registry controls", () => {
    const html = renderAdminDashboard("components");

    expect(html).toContain("Approved component registry");
    expect(html).toContain("Enable | Disable | Edit");
    expect(html).toContain("Allowed intents");
  });

  it("renders approvals, runs, audit, and safety routes", () => {
    expect(renderAdminDashboard("approvals")).toContain("Resend | Cancel");
    expect(renderAdminDashboard("runs")).toContain("Automation runs");
    expect(renderAdminDashboard("audit")).toContain("Export CSV");
    expect(renderAdminDashboard("safety")).toContain("Server automation");
  });
});
