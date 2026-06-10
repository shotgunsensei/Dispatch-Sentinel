import { describe, expect, it } from "vitest";
import { renderAdminDashboard } from "./main.js";

describe("admin dashboard routes", () => {
  it("renders the overview route", () => {
    const html = renderAdminDashboard("dashboard");

    expect(html).toContain("Phase 13 Control Center");
    expect(html).toContain("API status");
    expect(html).toContain("Global Datto execution");
  });

  it("renders admin login", () => {
    const html = renderAdminDashboard("login");

    expect(html).toContain("ADMIN_SETUP_TOKEN");
    expect(html).toContain("Login");
    expect(html).toContain("No registration");
  });

  it("renders tenant list and create form", () => {
    expect(renderAdminDashboard("tenants")).toContain("Tenant Registry");
    expect(renderAdminDashboard("tenants")).toContain("BMS configured");
    expect(renderAdminDashboard("tenant-new")).toContain("Create Tenant");
    expect(renderAdminDashboard("tenant-new")).toContain("Tenant slug");
  });

  it("renders tenant integration control center", () => {
    const html = renderAdminDashboard("tenant-detail");

    expect(html).toContain("BMS Configuration");
    expect(html).toContain("Webhook Configuration");
    expect(html).toContain("Datto RMM Configuration");
    expect(html).toContain("Execution Safety");
    expect(html).toContain("Integration Test Console");
    expect(html).not.toContain("tenant-webhook-secret");
  });
});
