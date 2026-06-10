import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderRouteForTest, routeFromPath } from "./AdminApp.js";

describe("admin GUI routes", () => {
  it("maps required admin routes", () => {
    expect(routeFromPath("/admin/login")).toMatchObject({ route: "login" });
    expect(routeFromPath("/admin")).toMatchObject({ route: "dashboard" });
    expect(routeFromPath("/admin/tenants")).toMatchObject({ route: "tenants" });
    expect(routeFromPath("/admin/tenants/new")).toMatchObject({ route: "tenant-new" });
    expect(routeFromPath("/admin/tenants/tenant-1")).toMatchObject({ route: "tenant-detail", tenantId: "tenant-1" });
    expect(routeFromPath("/admin/tenants/tenant-1/secrets")).toMatchObject({ route: "tenant-secrets", tenantId: "tenant-1" });
    expect(routeFromPath("/admin/tenants/tenant-1/tests")).toMatchObject({ route: "tenant-tests", tenantId: "tenant-1" });
  });

  it("renders login without registration", () => {
    const html = renderToStaticMarkup(renderRouteForTest("/admin/login"));

    expect(html).toContain("Token or password");
    expect(html).toContain("Login");
    expect(html).toContain("No registration");
  });

  it("renders dashboard shell with API and safety badges", () => {
    const html = renderToStaticMarkup(renderRouteForTest("/admin"));

    expect(html).toContain("Tenant Setup &amp; Integration Control");
    expect(html).toContain("API Online");
    expect(html).toContain("Dry-run Safe");
    expect(html).toContain("Authenticated");
    expect(html).toContain("Global Datto execution");
  });

  it("renders new tenant form", () => {
    const html = renderToStaticMarkup(renderRouteForTest("/admin/tenants/new"));

    expect(html).toContain("New Tenant");
    expect(html).toContain("Tenant name");
    expect(html).toContain("Tenant slug");
  });
});
