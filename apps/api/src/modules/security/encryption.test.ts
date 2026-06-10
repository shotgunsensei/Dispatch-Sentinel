import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SecretEncryptionService } from "./encryption.js";

describe("SecretEncryptionService", () => {
  it("encrypts and decrypts secret values", () => {
    const service = new SecretEncryptionService(randomBytes(32).toString("base64"));
    const encrypted = service.encrypt("tenant-secret-value");

    expect(encrypted.encryptedValue).not.toBe("tenant-secret-value");
    expect(encrypted.lastFour).toBe("alue");
    expect(service.decrypt(encrypted)).toBe("tenant-secret-value");
  });

  it("fails safely with an invalid encryption key", () => {
    const service = new SecretEncryptionService(Buffer.from("short").toString("base64"));

    expect(service.status()).toMatchObject({ ok: false });
    expect(() => service.encrypt("secret")).toThrow("32 bytes");
  });
});
