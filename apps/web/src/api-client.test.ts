import { afterEach, describe, expect, it, vi } from "vitest";

describe("web API client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("reports unauthorized responses", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Unauthorized. Login is required." }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest, ApiRequestError } = await import("./api-client.js");

    await expect(apiRequest("/api/admin/tenants")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 401,
      message: "Unauthorized. Login is required."
    } satisfies Partial<InstanceType<typeof ApiRequestError>>);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/admin/tenants", expect.objectContaining({
      credentials: "include"
    }));
  });

  it("runs the centralized unauthorized handler for protected admin 401 responses", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Admin authentication is required." }), { status: 401 })));
    const { apiRequest, setUnauthorizedHandler } = await import("./api-client.js");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(apiRequest("/api/admin/tenants")).rejects.toMatchObject({
      status: 401
    });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("marks 401 requests as still authenticated when the handler confirms the session", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Admin authentication is required." }), { status: 401 })));
    const { apiRequest, setUnauthorizedHandler } = await import("./api-client.js");
    setUnauthorizedHandler(() => "authenticated");

    await expect(apiRequest("/api/admin/tenants")).rejects.toMatchObject({
      status: 401,
      sessionStillValid: true
    });
  });

  it("does not run the unauthorized handler for failed login attempts", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Invalid admin credentials." }), { status: 401 })));
    const { apiRequest, setUnauthorizedHandler } = await import("./api-client.js");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(apiRequest("/api/admin/login", { method: "POST", body: { token: "wrong" } })).rejects.toMatchObject({
      status: 401
    });

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("createTenant posts through the API base URL with credentials included", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tenant: {
        id: "tenant-acme",
        name: "Acme",
        slug: "acme",
        status: "active",
        webhookUrl: "/api/webhooks/bms/acme"
      }
    }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { createTenant } = await import("./api-client.js");

    const tenant = await createTenant({ name: "Acme", slug: "acme" });

    expect(tenant.id).toBe("tenant-acme");
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/admin/tenants", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ name: "Acme", slug: "acme" })
    }));
  });

  it("createTenant triggers the centralized redirect path on 401", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Admin authentication is required." }), { status: 401 })));
    const { createTenant, setUnauthorizedHandler } = await import("./api-client.js");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(createTenant({ name: "Acme", slug: "acme" })).rejects.toMatchObject({
      status: 401
    });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("createTenant preserves session-valid 401 state for the form to show retry messaging", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Admin authentication is required." }), { status: 401 })));
    const { createTenant, setUnauthorizedHandler } = await import("./api-client.js");
    setUnauthorizedHandler(() => "authenticated");

    await expect(createTenant({ name: "Acme", slug: "acme" })).rejects.toMatchObject({
      status: 401,
      sessionStillValid: true
    });
  });

  it("createTenant reports duplicate slug without invoking logout handling", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Tenant already exists." }), { status: 409 })));
    const { createTenant, setUnauthorizedHandler } = await import("./api-client.js");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(createTenant({ name: "Acme", slug: "acme" })).rejects.toMatchObject({
      status: 409,
      message: "Tenant already exists."
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("createTenant reports server errors without invoking logout handling", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Tenant creation failed." }), { status: 500 })));
    const { createTenant, setUnauthorizedHandler } = await import("./api-client.js");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(createTenant({ name: "Acme", slug: "acme" })).rejects.toMatchObject({
      status: 500,
      message: "Tenant creation failed."
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("reports missing API base URL as an offline configuration error", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    const { apiRequest } = await import("./api-client.js");

    await expect(apiRequest("/health")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: null,
      message: "NEXT_PUBLIC_API_BASE_URL is not configured."
    });
  });
});
