type LogLevel = "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const sensitiveKeyPattern = /secret|token|password|authorization|apiKey|api_key|clientSecret|client_secret|credential/i;
const sensitiveValuePattern = /(bearer\s+[a-z0-9._~+/-]+|x-dispatch-sentinel-[a-z-]+|sk_live_[a-z0-9]+|sk_test_[a-z0-9]+)/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[REDACTED]" : redactSecrets(entry)
      ])
    );
  }

  if (typeof value === "string" && sensitiveValuePattern.test(value)) {
    return "[REDACTED]";
  }

  return value;
}

export function createLogger(minimumLevel: LogLevel = "info"): Logger {
  function write(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
    if (levelPriority[level] < levelPriority[minimumLevel]) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      service: "dispatch-sentinel-api",
      message,
      ...(redactSecrets(context) as Record<string, unknown>)
    };

    const line = JSON.stringify(payload);
    if (level === "error") {
      console.error(line);
      return;
    }

    console.log(line);
  }

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context)
  };
}
