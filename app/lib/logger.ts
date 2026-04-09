type LogLevel = "info" | "warn" | "error";

const IS_DEV = process.env.NODE_ENV !== "production";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

const COLOR: Record<LogLevel, string> = {
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};

const BADGE: Record<LogLevel, string> = {
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

function formatPretty(level: LogLevel, message: string, data?: Record<string, unknown>): string {
  const time = new Date().toLocaleTimeString("en-GB"); // HH:MM:SS
  const color = COLOR[level];
  const badge = `${color}${BOLD}${BADGE[level]}${RESET}`;
  const msg = `${BOLD}${message}${RESET}`;
  const meta =
    data && Object.keys(data).length > 0
      ? " " +
        Object.entries(data)
          .map(([k, v]) => `${DIM}${k}=${RESET}${v}`)
          .join("  ")
      : "";
  return `${DIM}${time}${RESET}  ${badge}  ${msg}${meta}`;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  if (IS_DEV) {
    const line = formatPretty(level, message, data);
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
    return;
  }

  // Production: JSON สำหรับ log aggregator
  const entry = { ts: new Date().toISOString(), level, msg: message, ...data };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, data?: Record<string, unknown>) => log("info", message, data),
  warn: (message: string, data?: Record<string, unknown>) => log("warn", message, data),
  error: (message: string, data?: Record<string, unknown>) => log("error", message, data),
};
