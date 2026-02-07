export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ?? {})
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext): void => log("debug", message, context),
  info: (message: string, context?: LogContext): void => log("info", message, context),
  warn: (message: string, context?: LogContext): void => log("warn", message, context),
  error: (message: string, context?: LogContext): void => log("error", message, context)
};
