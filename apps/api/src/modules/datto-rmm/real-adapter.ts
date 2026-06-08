import type { ApiConfig } from "../../config.js";
import type { Logger } from "../../logger.js";
import type { Device } from "@dispatch-sentinel/shared";
import type { DattoJobStatus, DattoQuickJobResult, DattoQuickJobVariables, DattoRmmAdapter } from "./types.js";

export class RealDattoRmmAdapter implements DattoRmmAdapter {
  constructor(
    private readonly config: ApiConfig,
    private readonly logger: Logger
  ) {}

  async listDevices(siteIdOrAccountId: string): Promise<Device[]> {
    const body = await this.safeReadRequest("listDevices", `/api/v2/devices?scope=${encodeURIComponent(siteIdOrAccountId)}`);
    return Array.isArray(body?.devices) ? body.devices.filter(isDevice) : [];
  }

  async getDevice(deviceUid: string): Promise<Device | null> {
    const body = await this.safeReadRequest("getDevice", `/api/v2/devices/${encodeURIComponent(deviceUid)}`);
    return isDevice(body?.device) ? body.device : null;
  }

  async runQuickJob(deviceUid: string, componentUid: string, variables: DattoQuickJobVariables): Promise<DattoQuickJobResult> {
    if (!this.config.dattoRmmExecutionEnabled) {
      throw new Error("Real Datto RMM execution is disabled. Set DATTO_RMM_EXECUTION_ENABLED=true to allow live quick jobs.");
    }

    const body = await this.writeRequest("runQuickJob", "/api/v2/quick-jobs", {
      deviceUid,
      componentUid,
      variables
    });

    return {
      jobUid: requireString(body?.jobUid ?? body?.uid, "Datto RMM quick job response did not include a job UID."),
      status: normalizeJobStatus(body?.status),
      summary: typeof body?.summary === "string" ? body.summary : "Datto RMM quick job accepted."
    };
  }

  async getJobStatus(jobUid: string): Promise<DattoJobStatus> {
    const body = await this.safeReadRequest("getJobStatus", `/api/v2/jobs/${encodeURIComponent(jobUid)}`);
    return {
      jobUid,
      status: normalizeJobStatus(body?.status),
      summary: typeof body?.summary === "string" ? body.summary : "Datto RMM job status read."
    };
  }

  private async safeReadRequest(operation: string, path: string): Promise<Record<string, unknown>> {
    this.ensureConfigured();
    for (let attempt = 1; attempt <= 2; attempt++) {
      this.logger.info("Datto RMM read scaffold", {
        operation,
        path,
        attempt,
        timeoutMs: this.config.dattoRmmTimeoutMs,
        hasApiKey: Boolean(this.config.dattoRmmApiKey),
        hasApiSecret: Boolean(this.config.dattoRmmApiSecret)
      });
      try {
        return await this.request("GET", path);
      } catch (error) {
        if (attempt === 2) {
          throw error;
        }
      }
    }
    return {};
  }

  private async writeRequest(operation: string, path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.ensureConfigured();
    this.logger.info("Datto RMM write request", {
      operation,
      path,
      timeoutMs: this.config.dattoRmmTimeoutMs,
      hasApiKey: Boolean(this.config.dattoRmmApiKey),
      hasApiSecret: Boolean(this.config.dattoRmmApiSecret)
    });
    return this.request("POST", path, payload);
  }

  private async request(method: "GET" | "POST", path: string, payload?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.dattoRmmTimeoutMs);
    try {
      const response = await fetch(`${this.config.dattoRmmBaseUrl!.replace(/\/$/, "")}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: this.buildAuthHeader()
        },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller.signal
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) as Record<string, unknown> : {};
      if (!response.ok) {
        throw new Error(`Datto RMM request failed with status ${response.status}.`);
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildAuthHeader(): string {
    return `Bearer ${this.config.dattoRmmApiKey}:${this.config.dattoRmmApiSecret}`;
  }

  private ensureConfigured(): void {
    if (!this.config.dattoRmmBaseUrl || !this.config.dattoRmmApiKey || !this.config.dattoRmmApiSecret) {
      throw new Error("Datto RMM real adapter is missing required environment configuration.");
    }
  }
}

function normalizeJobStatus(status: unknown): DattoJobStatus["status"] {
  if (status === "queued" || status === "running" || status === "completed" || status === "succeeded" || status === "failed") {
    return status;
  }
  return "unknown";
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(message);
  }
  return value;
}

function isDevice(value: unknown): value is Device {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<Device>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.dattoDeviceUid === "string" &&
    typeof candidate.hostname === "string" &&
    typeof candidate.accountId === "string" &&
    typeof candidate.assetType === "string"
  );
}
