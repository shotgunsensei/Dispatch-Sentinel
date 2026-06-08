import type { Device } from "@dispatch-sentinel/shared";
import { mockDattoDevices } from "./fixtures.js";
import type { DeviceAdapter } from "./types.js";

export class MockDattoDeviceAdapter implements DeviceAdapter {
  private readonly devices = new Map<string, Device>();

  constructor(fixtures: Device[] = mockDattoDevices) {
    for (const device of fixtures) {
      if (device.dattoDeviceUid) {
        this.devices.set(device.dattoDeviceUid, structuredClone(device));
      }
    }
  }

  async listDevicesForAccount(accountId: string): Promise<Device[]> {
    return [...this.devices.values()]
      .filter((device) => device.accountId === accountId)
      .map((device) => structuredClone(device));
  }

  async getDeviceByUid(deviceUid: string): Promise<Device | null> {
    const device = this.devices.get(deviceUid);
    return device ? structuredClone(device) : null;
  }

  async searchDevices(accountId: string, query: string): Promise<Device[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return [...this.devices.values()]
      .filter((device) => device.accountId === accountId)
      .filter((device) =>
        [device.hostname, device.lastLoggedInUser, device.serialNumber]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery))
      )
      .map((device) => structuredClone(device));
  }
}
