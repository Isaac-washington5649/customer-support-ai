import { env } from "./env";

type LogLevel = "info" | "warn" | "error" | "debug";

type LogContext = Record<string, unknown> | undefined;

function write(level: LogLevel, message: string, context?: LogContext) {
  const payload = {
    level,
    message,
    service: env.OTEL_SERVICE_NAME,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const serialized = JSON.stringify(payload);
  // eslint-disable-next-line no-console
  (console[level] ?? console.log)(serialized);
}

export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  event: (name: string, data?: LogContext) => write("info", name, data),
};
