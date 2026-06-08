import { describe, expect, it, vi } from "vitest";
import { createLogger, redactSecrets } from "./logger.js";

describe("logger redaction", () => {
  it("redacts sensitive keys recursively", () => {
    expect(redactSecrets({
      token: "secret-token",
      nested: {
        apiKey: "key",
        safe: "visible"
      }
    })).toEqual({
      token: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        safe: "visible"
      }
    });
  });

  it("does not log secrets", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = createLogger("info");

    logger.info("test", {
      authorization: "Bearer should-not-leak",
      safe: "visible"
    });

    const line = String(spy.mock.calls[0]?.[0] ?? "");
    expect(line).toContain("visible");
    expect(line).not.toContain("should-not-leak");
    expect(line).toContain("[REDACTED]");
    spy.mockRestore();
  });
});
