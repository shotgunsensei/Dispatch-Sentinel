import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type AdminRole = "read_only" | "operator" | "admin";
export type AdminPermission = "read" | "operate" | "admin";

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  passwordHash: string;
}

export interface AdminSession {
  token: string;
  userId: string;
  email: string;
  role: AdminRole;
  expiresAt: string;
}

const rolePermissions: Record<AdminRole, AdminPermission[]> = {
  read_only: ["read"],
  operator: ["read", "operate"],
  admin: ["read", "operate", "admin"]
};

export class AdminAuthService {
  private readonly users = new Map<string, AdminUser>();
  private readonly sessions = new Map<string, AdminSession>();

  constructor(input: { email: string; password: string; role?: AdminRole; sessionTtlMinutes: number; setupToken?: string | null; sessionSecret?: string | null }) {
    const role = input.role ?? "admin";
    this.users.set(input.email.toLowerCase(), {
      id: "admin-bootstrap",
      email: input.email.toLowerCase(),
      role,
      passwordHash: hashPassword(input.password)
    });
    this.sessionTtlMinutes = input.sessionTtlMinutes;
    this.setupTokenHash = input.setupToken ? hashPassword(input.setupToken) : null;
    this.sessionSecret = input.sessionSecret ?? null;
  }

  private readonly sessionTtlMinutes: number;
  private readonly setupTokenHash: string | null;
  private readonly sessionSecret: string | null;

  login(email: string, password: string, now = new Date()): AdminSession {
    const user = this.users.get(email.toLowerCase());
    if (!user || !safeEqual(user.passwordHash, hashPassword(password))) {
      throw new Error("Invalid admin credentials.");
    }

    const token = this.createSessionToken();
    const session: AdminSession = {
      token,
      userId: user.id,
      email: user.email,
      role: user.role,
      expiresAt: new Date(now.getTime() + this.sessionTtlMinutes * 60 * 1000).toISOString()
    };
    this.sessions.set(token, session);
    return structuredClone(session);
  }

  loginWithSetupToken(setupToken: string, now = new Date()): AdminSession {
    if (!this.setupTokenHash || !safeEqual(this.setupTokenHash, hashPassword(setupToken))) {
      throw new Error("Invalid admin setup token.");
    }
    const token = this.createSessionToken();
    const session: AdminSession = {
      token,
      userId: "admin-setup",
      email: "setup-admin@dispatch.local",
      role: "admin",
      expiresAt: new Date(now.getTime() + this.sessionTtlMinutes * 60 * 1000).toISOString()
    };
    this.sessions.set(token, session);
    return structuredClone(session);
  }

  authenticate(header: string | string[] | undefined, now = new Date(), cookieHeader?: string | string[]): AdminSession | null {
    const token = parseBearerToken(header) ?? parseSessionCookie(cookieHeader);
    if (!token) {
      return null;
    }
    const session = this.sessions.get(token);
    if (!session || Date.parse(session.expiresAt) <= now.getTime()) {
      if (session) {
        this.sessions.delete(token);
      }
      return null;
    }
    return structuredClone(session);
  }

  revoke(token: string | null): void {
    if (token) {
      this.sessions.delete(token);
    }
  }

  requirePermission(session: AdminSession | null, permission: AdminPermission): AdminSession {
    if (!session) {
      throw new Error("Admin authentication is required.");
    }
    if (!rolePermissions[session.role].includes(permission)) {
      throw new Error("Admin role does not have permission for this action.");
    }
    return session;
  }

  isSetupConfigured(): boolean {
    return Boolean(this.setupTokenHash && this.sessionSecret);
  }

  private createSessionToken(): string {
    const nonce = randomBytes(32).toString("base64url");
    if (!this.sessionSecret) {
      return nonce;
    }
    const signature = createHmac("sha256", this.sessionSecret).update(nonce).digest("base64url");
    return `${nonce}.${signature}`;
  }
}

export function hashPassword(password: string): string {
  return createHash("sha256").update(`dispatch-sentinel:${password}`).digest("hex");
}

function parseBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function parseSessionCookie(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return null;
  }
  const match = value.split(";").map((part) => part.trim()).find((part) => part.startsWith("dispatch_sentinel_admin="));
  return match ? decodeURIComponent(match.slice("dispatch_sentinel_admin=".length)) : null;
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "hex");
  const bBuffer = Buffer.from(b, "hex");
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}
