export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createConsoleLogger(minLevel: LogLevel = "info"): Logger {
  const threshold = LEVEL_ORDER[minLevel];
  return {
    log(level, message, fields) {
      if (LEVEL_ORDER[level] < threshold) return;
      const entry = {
        ts: new Date().toISOString(),
        level,
        msg: message,
        ...(fields ?? {}),
      };
      const line = `[nawaitu] ${JSON.stringify(entry)}`;
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    },
  };
}
