/**
 * Structured logger for the site, used on both the server (SSR) and the
 * client.
 *
 * Each call writes one event — timestamp, service, level, category, event
 * and, when given, context and error — to the matching console method.
 * This is the one module in src that calls console.* directly; everything
 * else logs through it.
 */

export type LogCategory = "infra" | "data" | "api";

export interface LogEvent {
  event: string;
  category: LogCategory;
  context?: Record<string, unknown>;
  error?: unknown;
}

export interface Logger {
  info: (e: LogEvent) => void;
  warn: (e: LogEvent) => void;
  error: (e: LogEvent) => void;
}

/** Build a logger that tags every event with `service`. */
export function createLogger(service: string): Logger {
  const emit = (level: "INFO" | "WARN" | "ERROR", e: LogEvent) => {
    const payload = {
      timestamp: new Date().toISOString(),
      service,
      level,
      category: e.category,
      event: e.event,
      ...(e.context ? { context: e.context } : {}),
      ...(e.error !== undefined ? { error: e.error } : {}),
    };
    const fn = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.info;
    fn(payload);
  };

  return {
    info: (e) => emit("INFO", e),
    warn: (e) => emit("WARN", e),
    error: (e) => emit("ERROR", e),
  };
}

/** The site's shared logger. */
export const logger = createLogger("website-astro-wcs");
