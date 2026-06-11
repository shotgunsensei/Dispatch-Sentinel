export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly sessionStillValid = false
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type UnauthorizedHandler = (path: string) => Promise<"authenticated" | "unauthenticated" | void> | "authenticated" | "unauthenticated" | void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export interface CreatedTenant {
  id: string;
  name: string;
  slug: string;
  status: "active" | "disabled";
  webhookUrl: string;
}

export function hasApiBaseUrl(): boolean {
  return apiBaseUrl.length > 0;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export async function apiRequest<T = unknown>(path: string, options: { method?: string; body?: unknown; skipUnauthorizedHandler?: boolean } = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new ApiRequestError("NEXT_PUBLIC_API_BASE_URL is not configured.", null);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (!response.ok) {
    const message = typeof body.message === "string" ? body.message : response.status === 401 ? "Unauthorized. Login is required." : "Request failed.";
    let sessionStillValid = false;
    if (response.status === 401 && path.startsWith("/api/admin/") && path !== "/api/admin/login") {
      const authResult = options.skipUnauthorizedHandler ? undefined : await unauthorizedHandler?.(path);
      sessionStillValid = authResult === "authenticated";
    }
    throw new ApiRequestError(message, response.status, sessionStillValid);
  }
  return body as T;
}

export async function createTenant(input: { name: string; slug: string }): Promise<CreatedTenant> {
  const body = await apiRequest<{ tenant: CreatedTenant }>("/api/admin/tenants", {
    method: "POST",
    body: input
  });
  return body.tenant;
}
