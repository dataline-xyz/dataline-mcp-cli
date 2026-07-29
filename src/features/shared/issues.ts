import { z } from "zod";

import type { DataApiWarning } from "../../data-api/types.js";
import { compactRecord, firstString, isRecord, records } from "./records.js";

export const warningSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  agent_action_hint: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ToolWarning = z.infer<typeof warningSchema>;
export type ToolError = z.infer<typeof errorSchema>;

export function collectWarnings(upstream: readonly DataApiWarning[], data: unknown): ToolWarning[] {
  const output: ToolWarning[] = upstream.map((warning) => ({ ...warning }));
  if (!isRecord(data)) {
    return output;
  }

  for (const warning of records(data.warnings)) {
    output.push({
      code: firstString(warning.code) ?? "upstream_warning",
      message: firstString(warning.message) ?? "Dataline reported a warning.",
      severity: normalizeSeverity(warning.severity),
      ...optionalDetails(warning.details),
    });
  }
  return dedupeWarnings(output);
}

export function unavailableWarnings(data: unknown, fallbackVenue?: string): ToolWarning[] {
  if (!isRecord(data)) {
    return [];
  }
  return records(data.unavailable_venues).map((item) => {
    const venue = firstString(item.venue, fallbackVenue) ?? "venue";
    const reason = firstString(item.reason) ?? "unavailable";
    return {
      code: "venue_unavailable",
      message: `${venue} unavailable: ${reason}`,
      severity: "warning" as const,
    };
  });
}

export function dedupeWarnings(warnings: readonly ToolWarning[], limit = 5): ToolWarning[] {
  const seen = new Set<string>();
  const output: ToolWarning[] = [];
  for (const warning of warnings) {
    const key = `${warning.code}\u0000${warning.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(warning);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

export function warning(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ToolWarning {
  const cleaned = details ? compactRecord(details) : undefined;
  return {
    code,
    message,
    severity: "warning",
    ...(cleaned && Object.keys(cleaned).length > 0 ? { details: cleaned } : {}),
  };
}

function optionalDetails(value: unknown): { details?: Record<string, unknown> } {
  return isRecord(value) && Object.keys(value).length > 0 ? { details: value } : {};
}

function normalizeSeverity(value: unknown): ToolWarning["severity"] {
  if (value === "info" || value === "critical") {
    return value;
  }
  return "warning";
}
