import type { Device } from "@dispatch-sentinel/shared";

export interface DeviceAdapter {
  listDevicesForAccount(accountId: string): Promise<Device[]>;
  getDeviceByUid(deviceUid: string): Promise<Device | null>;
  searchDevices(accountId: string, query: string): Promise<Device[]>;
}

export interface HistoricalTicketDeviceRelation {
  ticketId: string;
  deviceId: string;
}
