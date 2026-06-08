import type { Logger } from "../../logger.js";
import { mockDattoDevices } from "../assets/fixtures.js";
import type { DattoJobStatus, DattoQuickJobResult, DattoQuickJobVariables, DattoRmmAdapter } from "./types.js";
import type { Device } from "@dispatch-sentinel/shared";

export class DryRunDattoRmmAdapter implements DattoRmmAdapter {
  readonly intendedJobs: Array<{ deviceUid: string; componentUid: string; variables: DattoQuickJobVariables; jobUid: string }> = [];

  constructor(
    private readonly logger: Logger,
    private readonly devices: Device[] = mockDattoDevices,
    private readonly shouldFail = false
  ) {}

  async listDevices(siteIdOrAccountId: string): Promise<Device[]> {
    return this.devices
      .filter((device) => device.dattoSiteUid === siteIdOrAccountId || device.accountId === siteIdOrAccountId)
      .map((device) => structuredClone(device));
  }

  async getDevice(deviceUid: string): Promise<Device | null> {
    const device = this.devices.find((candidate) => candidate.dattoDeviceUid === deviceUid);
    return device ? structuredClone(device) : null;
  }

  async runQuickJob(deviceUid: string, componentUid: string, variables: DattoQuickJobVariables): Promise<DattoQuickJobResult> {
    const jobUid = `dry-run-job-${crypto.randomUUID()}`;
    this.intendedJobs.push({ deviceUid, componentUid, variables: structuredClone(variables), jobUid });
    this.logger.info("Dry-run Datto RMM quick job", {
      deviceUid,
      componentUid,
      jobUid,
      dryRun: true
    });

    if (this.shouldFail) {
      return {
        jobUid,
        status: "failed",
        summary: "Dry-run Datto RMM quick job simulated failure."
      };
    }

    return {
      jobUid,
      status: "succeeded",
      summary: "Dry-run Datto RMM quick job simulated success."
    };
  }

  async getJobStatus(jobUid: string): Promise<DattoJobStatus> {
    const job = this.intendedJobs.find((candidate) => candidate.jobUid === jobUid);
    return {
      jobUid,
        status: job ? (this.shouldFail ? "failed" : "completed") : "unknown",
      summary: job ? "Dry-run job status resolved locally." : "Dry-run job was not found."
    };
  }
}
