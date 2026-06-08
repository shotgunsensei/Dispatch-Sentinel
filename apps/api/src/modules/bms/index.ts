export * from "./types.js";
export * from "./mock-bms-adapter.js";
export * from "./fixtures.js";
export * from "./workflow.js";

export class BmsClient {
  async getTicketById(): Promise<never> {
    throw new Error("Real BMS API calls are not implemented in Phase 1.");
  }

  async listNewTickets(): Promise<never> {
    throw new Error("Real BMS API calls are not implemented in Phase 1.");
  }

  async addInternalNote(): Promise<never> {
    throw new Error("Real BMS API calls are not implemented in Phase 1.");
  }

  async updateTicketStatus(): Promise<never> {
    throw new Error("Real BMS API calls are not implemented in Phase 1.");
  }

  async updateTicketQueue(): Promise<never> {
    throw new Error("Real BMS API calls are not implemented in Phase 1.");
  }
}
