export type LogLevel = "info" | "warn" | "error";

export interface StructuredLogContext {
  trace_id: string;
  owner_id: string;
  property_id: string;
  message: string;
  data?: Record<string, unknown>;
}

export function logStructured(
  level: LogLevel,
  context: StructuredLogContext,
): void {
  const payload = {
    level,
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.info(JSON.stringify(payload));
}
