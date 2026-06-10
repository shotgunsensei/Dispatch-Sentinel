import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedSecretValue {
  encryptedValue: string;
  iv: string;
  authTag: string;
  keyVersion: string;
  lastFour: string | null;
}

export interface EncryptionKeyStatus {
  ok: boolean;
  message?: string;
}

export class SecretEncryptionService {
  constructor(
    private readonly base64Key: string | null,
    private readonly keyVersion = "v1"
  ) {}

  status(): EncryptionKeyStatus {
    try {
      this.getKey();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Encryption key is invalid."
      };
    }
  }

  encrypt(plaintext: string): EncryptedSecretValue {
    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encryptedValue = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encryptedValue: encryptedValue.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      keyVersion: this.keyVersion,
      lastFour: plaintext.length >= 4 ? plaintext.slice(-4) : null
    };
  }

  decrypt(secret: EncryptedSecretValue): string {
    const key = this.getKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.iv, "base64"));
    decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.encryptedValue, "base64")),
      decipher.final()
    ]).toString("utf8");
  }

  private getKey(): Buffer {
    if (!this.base64Key) {
      throw new Error("DISPATCH_SENTINEL_ENCRYPTION_KEY is required.");
    }
    const key = Buffer.from(this.base64Key, "base64");
    if (key.length !== 32) {
      throw new Error("DISPATCH_SENTINEL_ENCRYPTION_KEY must decode to 32 bytes.");
    }
    return key;
  }
}
