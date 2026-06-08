import type { Device } from "@dispatch-sentinel/shared";

export interface DattoQuickJobVariables {
  [key: string]: string | number | boolean | null;
}

export interface DattoQuickJobResult {
  jobUid: string;
  status: "queued" | "running" | "completed" | "succeeded" | "failed" | "unknown";
  summary: string;
}

export interface DattoJobStatus {
  jobUid: string;
  status: "queued" | "running" | "completed" | "succeeded" | "failed" | "unknown";
  summary: string;
}

export interface DattoRmmAdapter {
  listDevices(siteIdOrAccountId: string): Promise<Device[]>;
  getDevice(deviceUid: string): Promise<Device | null>;
  runQuickJob(deviceUid: string, componentUid: string, variables: DattoQuickJobVariables): Promise<DattoQuickJobResult>;
  getJobStatus(jobUid: string): Promise<DattoJobStatus>;
}
