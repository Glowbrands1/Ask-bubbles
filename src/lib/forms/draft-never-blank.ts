import { getSupabaseAdmin } from "@/lib/supabase/server";

import { describesIncident } from "./corrective-action-intake";
import { managerIncidentClause } from "./incident-issue";
import { EXPECTATION_LABEL, GOING_FORWARD_LABEL, OBSERVED_LABEL } from "./narrative-draft";

/**
 * ============================================================================
 * A CORRECTIVE ACTION OR COACHING DRAFT IS NEVER FILED BLANK
 * ============================================================================
 *
 * Production, 26 Oct 2026: "create a ca for <name> at dodge, ne. she was a no
 * call no show on 10/22" — a correct card, Create draft, and the prefill
 * recorded `drafted` with `{"fields": [], "rejected": []}`. No guard emptied
 * the Observation. The draft route takes the model's `write_form_fields` call
 * as the draft, and a call whose `values` came back empty or omitted, or in a
 * shape the route's own responsibility check drops — JSON-encoded as a string,
 * one object per section, keyed by the field's label — left nothing to write.
 * Those drops are never reported: the write's second check only sees what
 * survived the first, so its `rejected` is empty by construction, and an empty
 * draft was recorded as a success. Intermittent because the model's output is.
 *
 * DRAFT_NEVER_BLANK_ENABLED (default off):
 *
 *   1. `readDraftedCall` reads those shapes as the text and ticks they carry.
 *      Well-formed input passes through unchanged.
 *   2. A model call that threw (429, 529, overloaded), answered with no tool
 *      call, or left no narrative although the notes hold an account is
 *      tried again, up to twice, after 1 s and then 3 s (the route does that).
 *   3. If it is still empty, the narrative is the manager's own incident
 *      clause — the "Issue" the card showed — under "Observed:" alone, which
 *      is the shape the prompt asks for when no expectation can be inferred.
 *      Deterministic: never a word the manager did not type. It goes through
 *      the same guards as model text, and is recorded on a `drafted` event as
 *      `{"fallback": "manager_words"}`.
 *   4. Never a silent `{"fields": []}`: every failed or empty attempt's reason
 *      is recorded on a `drafted` event of its own.
 *
 * Pure apart from `recordDraftOutcome` and `pauseBeforeRetry`.
 */

export interface DraftedCall {
  values?: Record<string, string>;
  checked?: Record<string, string[]>;
}

interface FieldShape {
  readonly key: string;
  readonly label: string;
}

interface GroupShape {
  readonly key: string;
  readonly label?: string;
  readonly options: readonly { readonly key: string; readonly label: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A JSON-encoded object, decoded; anything else — a bracketed placeholder included — as it came. */
function decoded(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text.startsWith("{") || !text.endsWith("}")) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/\{\{\w+\}\}/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SECTION_LABELS: readonly string[] = [OBSERVED_LABEL, EXPECTATION_LABEL, GOING_FORWARD_LABEL];

/** "Observed", "observed:", "going_forward" → the printed label, or null. */
function sectionLabel(key: string): string | null {
  const wanted = comparable(key);
  return SECTION_LABELS.find((label) => comparable(label) === wanted) ?? null;
}

/**
 * A field's text as one string: a string as it is; one object per section as
 * the labelled sections, in the order they came; a list as its lines. Null
 * when it holds no text at all.
 */
function fieldText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const lines = value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
    return lines.length > 0 ? lines.join("\n") : null;
  }
  if (!isRecord(value)) return null;
  const parts: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    const text = fieldText(entry);
    if (text === null || text.trim() === "") continue;
    const label = sectionLabel(key);
    parts.push(label ? `${label}\n${text.trim()}` : text.trim());
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * The model's tool call, read as the text and ticks it carries. Keys the form
 * names by label ("Observation of Offense", "Type of Offense", "Absenteeism")
 * are read as the keys they label; anything that matches nothing is left for
 * the route's responsibility check to refuse, as before.
 */
export function readDraftedCall(
  input: unknown,
  form: { readonly fields: readonly FieldShape[]; readonly groups: readonly GroupShape[] },
): DraftedCall {
  const call = isRecord(input) ? input : {};
  const fieldKey = (key: string) =>
    form.fields.some((field) => field.key === key)
      ? key
      : (form.fields.find((field) => comparable(field.label) === comparable(key))?.key ?? key);
  const group = (key: string) =>
    form.groups.find((entry) => entry.key === key) ??
    form.groups.find((entry) => entry.label && comparable(entry.label) === comparable(key)) ??
    null;

  const result: DraftedCall = {};
  const rawValues = decoded(call.values);
  if (isRecord(rawValues)) {
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawValues)) {
      const text = fieldText(decoded(value));
      if (text !== null) values[fieldKey(key)] = text;
    }
    result.values = values;
  } else if (call.values !== undefined) {
    result.values = {};
  }

  const rawChecked = decoded(call.checked);
  if (isRecord(rawChecked)) {
    const checked: Record<string, string[]> = {};
    for (const [key, selected] of Object.entries(rawChecked)) {
      const target = group(key);
      const list = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
      const options = list
        .filter((option): option is string => typeof option === "string")
        .map(
          (option) =>
            target?.options.find((entry) => entry.key === option)?.key ??
            target?.options.find((entry) => comparable(entry.label) === comparable(option))?.key ??
            option,
        );
      checked[target?.key ?? key] = options;
    }
    result.checked = checked;
  }
  return result;
}

/** True when any of `keys` holds text. */
export function holdsNarrative(values: Record<string, string>, keys: readonly string[]): boolean {
  return keys.some((key) => typeof values[key] === "string" && values[key]!.trim() !== "");
}

/** True when the notes give an account of what happened, so a blank narrative is a failure. */
export function notesHoldAccount(notes: string, employeeName: string | null): boolean {
  return managerIncidentClause(notes, employeeName) !== null || describesIncident(notes);
}

/**
 * The manager's own incident clause as an Observation: "Observed:" alone, the
 * clause with its first letter capitalised and a closing full stop. Null when
 * the notes hold no clause.
 */
export function managerWordsObservation(notes: string, employeeName: string | null): string | null {
  const clause = managerIncidentClause(notes, employeeName)?.trim();
  if (!clause) return null;
  const sentence = `${clause.charAt(0).toUpperCase()}${clause.slice(1)}`;
  return `${OBSERVED_LABEL}\n${/[.!?]$/.test(sentence) ? sentence : `${sentence}.`}`;
}

/** The pauses before the second and third attempt: short, and well inside the route's budget. */
export const DRAFT_RETRY_BACKOFF_MS: readonly number[] = [1000, 3000];

/**
 * THE TIME A DRAFT MAY SPEND BEFORE IT STOPS RETRYING, from the request's
 * start. No new attempt — model call or framework read — begins once this
 * much has gone; what is left is written as it is, or from the manager's
 * words. Comfortably under the route's `maxDuration` (120 s).
 */
export const DRAFT_TIME_BUDGET_MS = 80_000;

/** True while a new attempt may still begin. */
export function withinDraftBudget(startedAt: number, now: number = Date.now()): boolean {
  return now - startedAt <= DRAFT_TIME_BUDGET_MS;
}

export function pauseBeforeRetry(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the call carried any text or tick at all. */
export function callSaidAnything(call: DraftedCall): boolean {
  return (
    Object.values(call.values ?? {}).some((value) => typeof value === "string" && value.trim() !== "") ||
    Object.values(call.checked ?? {}).some((options) => options.length > 0)
  );
}

/**
 * Why a model call that threw wrote nothing: "429 rate_limit_error",
 * "529 overloaded_error", "overloaded_error", or the error's name. Never the
 * message, which can echo the request.
 */
export function modelFailureReason(error: unknown): string {
  const record = isRecord(error) ? error : {};
  const status = typeof record.status === "number" ? record.status : null;
  const body = isRecord(record.error) ? record.error : {};
  const inner = isRecord(body.error) ? body.error : {};
  const type =
    (typeof inner.type === "string" && inner.type) ||
    (typeof body.type === "string" && body.type !== "error" && body.type) ||
    (typeof record.type === "string" && record.type) ||
    null;
  const parts = [status === null ? null : String(status), type].filter((part): part is string => Boolean(part));
  if (parts.length > 0) return `model_error ${parts.join(" ")}`;
  return `model_error ${error instanceof Error ? error.name : "unknown"}`;
}

/**
 * Why a model call that answered wrote nothing, or null when it carried
 * something: no tool call at all (with the stop reason), or a tool call with
 * no text and no tick.
 */
export function emptyCallReason(input: unknown, read: DraftedCall, stopReason: string | null): string | null {
  if (input === undefined) return `no_tool_call stop_reason=${stopReason ?? "none"}`;
  if (callSaidAnything(read)) return null;
  return "empty_tool_call";
}

/**
 * A `drafted` event of its own that says why the draft is what it is — the
 * attempts, each failure's reason, and `{"fallback": "manager_words"}` where
 * the narrative is the manager's words. The write's event is recorded by
 * `applyAssistantDraft`, which this change does not touch.
 *
 * NEVER FAILS THE DRAFT. By the time this runs the draft is written; an
 * event that could not be recorded is logged, and the manager still gets
 * their form.
 */
export async function recordDraftOutcome(
  instanceId: string,
  actor: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("form_instance_events")
      .insert({ instance_id: instanceId, kind: "drafted", actor, detail });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error(
      `[forms/instance/draft] could not record the drafted event for ${instanceId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
