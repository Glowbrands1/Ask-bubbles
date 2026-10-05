import { reportById } from "./registry";

/**
 * ============================================================================
 * "ASK ABOUT THIS REPORT" — POINTERS, NEVER FIGURES
 * ============================================================================
 *
 * When somebody asks the assistant about the report on their screen, the
 * browser sends WHICH report and which filters — never a number. The server
 * re-reads the figures itself, under the asker's own scope, so a crafted
 * request cannot put a figure into an answer or widen whose figures are read.
 *
 * Every field is bounded and trimmed; an unknown report id parses to null.
 */
export const REPORT_CONTEXT_TOKEN_MAX = 64;
export const REPORT_CONTEXT_LIST_MAX = 300;

export interface ChatReportContext {
  readonly reportId: string;
  readonly period: string | null;
  readonly locations: readonly string[];
  readonly metric: string | null;
  readonly view: string | null;
}

function token(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > REPORT_CONTEXT_TOKEN_MAX) return null;
  return trimmed;
}

function tokenList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const out: string[] = [];
  for (const entry of raw) {
    const parsed = token(entry);
    if (parsed !== null) out.push(parsed);
    if (out.length >= REPORT_CONTEXT_LIST_MAX) break;
  }
  return out;
}

export function parseChatReportContext(value: unknown): ChatReportContext | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const reportId = token(raw.reportId);
  if (!reportId || !reportById(reportId)) return null;
  return {
    reportId,
    period: token(raw.period),
    locations: tokenList(raw.locations),
    metric: token(raw.metric),
    view: token(raw.view),
  };
}

export const REPORT_CONTEXT_PARAMS = {
  reportId: "report",
  period: "period",
  location: "location",
  metric: "metric",
  view: "view",
} as const;

export function chatReportContextFromParams(params: URLSearchParams): ChatReportContext | null {
  return parseChatReportContext({
    reportId: params.get(REPORT_CONTEXT_PARAMS.reportId),
    period: params.get(REPORT_CONTEXT_PARAMS.period),
    locations: params.getAll(REPORT_CONTEXT_PARAMS.location),
    metric: params.get(REPORT_CONTEXT_PARAMS.metric),
    view: params.get(REPORT_CONTEXT_PARAMS.view),
  });
}

export function chatReportContextToParams(context: ChatReportContext): URLSearchParams {
  const params = new URLSearchParams();
  params.set(REPORT_CONTEXT_PARAMS.reportId, context.reportId);
  if (context.period) params.set(REPORT_CONTEXT_PARAMS.period, context.period);
  for (const location of context.locations) params.append(REPORT_CONTEXT_PARAMS.location, location);
  if (context.metric) params.set(REPORT_CONTEXT_PARAMS.metric, context.metric);
  if (context.view) params.set(REPORT_CONTEXT_PARAMS.view, context.view);
  return params;
}
