export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function hasApiBaseUrl(): boolean {
  return apiBaseUrl.length > 0;
}

export async function apiRequest<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
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
    throw new ApiRequestError(message, response.status);
  }
  return body as T;
}

