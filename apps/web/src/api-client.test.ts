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

