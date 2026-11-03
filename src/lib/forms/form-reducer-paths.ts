import "server-only";

import type { AskResponse } from "@/lib/ai/types";

import { checkboxGroupsForVariant, fieldsForVariant, parseFormDocument } from "./document";
import { NOTHING_CHANGED } from "./form-diff-reply";
import { applyPatch, sameValue, type CheckboxGroup, type FieldValue, type FormDiff, type FormPatch, type PatchRules } from "./form-reducer";
import { reduceDraftWrite } from "./form-reducer-draft";
import { snapshotOf } from "./form-snapshot";
import { syncCorrectiveActionPlan } from "./ca-action-plan-sync";
import { applyAssistantDraft, loadInstance, saveInstanceValues, type LoadedInstance } from "./instances";
import { NO_PRIOR_ACTION, PRIOR_ACTIONS_KEY } from "./prior-actions";
import type { DraftValues } from "./responsibility";
import { spokenDates } from "./relative-date";
import { copiedContent } from "./same-form-copy";

/**
 * ============================================================================
 * THE OTHER FORM-UPDATE PATHS, THROUGH THE REDUCER (FORM_PATCH_ALL_PATHS_ENABLED)
 * ============================================================================
 *
 * Step B, all paths (QA, 4 Nov 2026). The patch turn and the draft route
 * already merge through `applyPatch`; this takes the chat correction, the
 * Corrective Action's date reader, the redraft's reply and the same-form copy
 * the same way. Loaded only by `await import()` behind
 * `formPatchAllPathsEnabled()`, which is off unless FORM_PATCH_REDUCER_ENABLED
 * is on too.
 *
 * Nothing is read from words here: the readers that call this already read the
 * manager's statement, and the rules come from the template and the saved
 * rows. Every write is one of the existing writers (`saveInstanceValues`,
 * `applyAssistantDraft`, and the draft route's own `reduceDraftWrite`).
 *
 *   CORRECTION  edit mode on the header-aware draft (`snapshotOf(loaded).draft`,
 *               so the Employee and Date header lines are compared too); every
 *               stated key a "replace" with the manager's statement as its
 *               evidence; no manager-stated keys (a correction replaces a
 *               value on purpose); the current employee name is an accepted
 *               offer, so "…Ashgrove" → "…Pike" keeps the first name she did
 *               not repeat. Only `diff.changed` is written; refusals, and keys
 *               that already held the value, are reported as rejected so the
 *               reply never names them. All the same as before → the reply is
 *               "I didn't change anything on the form." with no `formUpdate`.
 *   CLEARS      (QA, Q1) "" and [] — a withdrawn payroll answer and its
 *               amount — pass through untouched: the reducer never blanks, and
 *               these are the reader's own clears. Only a clear of a field that
 *               holds something is written or claimed.
 *   DERIVED     what the caller computes from a stated value (a paragraph that
 *               follows the field, a date moved in the drafted account) passes
 *               through as computed, written only when it differs.
 *   REDRAFT     the draft route already reduces its write; the reply claims
 *               the keys its realized `formDiff` changed, or says nothing did.
 *   COPY        the copied values are a draft write: `reduceDraftWrite` (a
 *               typed field kept, a date only one the manager said), then
 *               `applyAssistantDraft`, then `settle()`. The reply claims the
 *               realized keys, or says nothing changed.
 */

type Values = { readonly values: Readonly<Record<string, string>>; readonly checked: Readonly<Record<string, readonly string[]>> };

export interface PatchedSave {
  /** As `saveInstanceValues`: the keys not saved. Also the keys refused by the reducer and the keys that already held the value. */
  readonly rejected: { key: string; reason: string }[];
  /** What was saved, by key. */
  readonly values: Record<string, string>;
  /** Set only when every stated key already held its value: the reply to give, with no `formUpdate`. */
  readonly nothingChanged?: string;
}

function isClear(value: FieldValue): boolean {
  return typeof value === "string" ? value.trim() === "" : value.length === 0;
}

/** The correction's reducer rules for this form: edit mode, nothing manager-stated, the name on the form an accepted offer. */
export function correctionRules(loaded: LoadedInstance, stated: ReadonlySet<string>, said: string, today: string, listKeys: ReadonlySet<string>): PatchRules {
  const document = parseFormDocument(loaded.version.document);
  const variantKey = loaded.instance.variantKey;
  const checkboxGroups: Record<string, CheckboxGroup> = {};
  for (const group of checkboxGroupsForVariant(document, variantKey)) {
    checkboxGroups[group.key] = { options: group.options.map((option) => option.key), single: group.single === true };
  }
  return {
    mode: "edit",
    writable: stated,
    managerStated: new Set<string>(),
    dateKeys: new Set(fieldsForVariant(document, variantKey).filter((field) => field.input === "date").map((field) => field.key)),
    // The app's readers of a stated date, calendar and relative ("yesterday", "last friday"): the ones the correction read.
    datesIn: (text) => spokenDates(text, today).flatMap((date) => (date.iso ? [date.iso] : [])),
    checkboxGroups,
    listKeys,
    listNone: NO_PRIOR_ACTION,
    sources: {
      manager: said,
      managerTurns: [said],
      offered: loaded.instance.employeeName ?? "",
      accepted: true,
    },
  };
}

/** The stated keys as one patch: each a "replace", with the manager's statement as its evidence. */
export function correctionPatch(stated: Values, said: string): FormPatch {
  const set: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(stated.values)) set[key] = value;
  for (const [key, options] of Object.entries(stated.checked)) set[key] = [...options];
  const keys = Object.keys(set);
  return {
    set,
    clear: [],
    how: Object.fromEntries(keys.map((key) => [key, "replace" as const])),
    evidence: Object.fromEntries(keys.map((key) => [key, said])),
  };
}

/**
 * A chat correction's save, through the reducer. Takes the arguments the
 * caller would have given `saveInstanceValues`, split: `stated` (the reader's
 * values from the manager's statement) and `passThrough` (what the caller
 * derived from them). Returns what `saveInstanceValues` returns, plus
 * `nothingChanged` when every value was already there.
 */
export async function saveCorrectionPatched(input: {
  readonly instanceId: string;
  /** The form as loaded and authorized by the caller, before this turn's write. */
  readonly loaded: LoadedInstance;
  readonly stated: Values;
  readonly passThrough?: Values;
  readonly actorId: string;
  /** The manager's statement the readers read. */
  readonly said: string;
  /** The business day, YYYY-MM-DD. */
  readonly today: string;
  /** List keys united line by line (default: Prior Actions). */
  readonly listKeys?: ReadonlySet<string>;
}): Promise<PatchedSave> {
  const before = snapshotOf(input.loaded).draft;
  const reduced: { values: Record<string, string>; checked: Record<string, string[]> } = { values: {}, checked: {} };
  const passed: { values: Record<string, string>; checked: Record<string, string[]> } = { values: {}, checked: {} };
  for (const [key, value] of Object.entries(input.stated.values)) {
    if (isClear(value)) passed.values[key] = value;
    else reduced.values[key] = value;
  }
  for (const [key, options] of Object.entries(input.stated.checked)) {
    if (isClear(options)) passed.checked[key] = [...options];
    else reduced.checked[key] = [...options];
  }
  for (const [key, value] of Object.entries(input.passThrough?.values ?? {})) passed.values[key] = value;
  for (const [key, options] of Object.entries(input.passThrough?.checked ?? {})) passed.checked[key] = [...options];

  const statedKeys = new Set([...Object.keys(reduced.values), ...Object.keys(reduced.checked)]);
  const rules = correctionRules(input.loaded, statedKeys, input.said, input.today, input.listKeys ?? new Set([PRIOR_ACTIONS_KEY]));
  const { diff } = applyPatch(before, correctionPatch(reduced, input.said), rules);

  const write: DraftValues = { values: {}, checked: {} };
  const groups = rules.checkboxGroups ?? {};
  for (const change of diff.changed) {
    if (change.key in groups) write.checked[change.key] = typeof change.after === "string" ? [change.after] : [...change.after];
    else write.values[change.key] = typeof change.after === "string" ? change.after : change.after.join("\n");
  }
  const unchanged: string[] = [];
  for (const [key, value] of Object.entries(passed.values)) {
    if (sameValue(before[key]?.value, value)) unchanged.push(key);
    else write.values[key] = value;
  }
  for (const [key, options] of Object.entries(passed.checked)) {
    if (sameValue(before[key]?.value, options)) unchanged.push(key);
    else write.checked[key] = options;
  }
  const changedKeys = new Set(diff.changed.map((change) => change.key));
  const refusedKeys = new Set(diff.refused.map((refusal) => refusal.key));
  for (const key of statedKeys) if (!changedKeys.has(key) && !refusedKeys.has(key)) unchanged.push(key);

  const rejected = [
    ...diff.refused.map((refusal) => ({ key: refusal.key, reason: refusal.reason })),
    ...unchanged.map((key) => ({ key, reason: "unchanged" })),
  ];
  const writes = Object.keys(write.values).length + Object.keys(write.checked).length;
  if (writes === 0) {
    const allSame = diff.refused.length === 0 && unchanged.length > 0;
    return { rejected, values: {}, ...(allSame ? { nothingChanged: NOTHING_CHANGED } : {}) };
  }
  const saved = await saveInstanceValues(input.instanceId, write, input.actorId);
  return { rejected: [...rejected, ...saved.rejected], values: saved.values };
}

/**
 * A payroll answer restated with the same Yes or No still carries what was
 * said with it ("change the payroll deduction to $5.00"): the Action Plan
 * Ask Bubbles built is rebuilt from the statement, as the correction does
 * for a changed answer. Returns the keys whose saved value really moved.
 */
export async function planFollowsPayroll(input: {
  readonly instanceId: string;
  readonly actorId: string;
  readonly loaded: LoadedInstance;
  readonly checked: Readonly<Record<string, readonly string[]>>;
  readonly notes: string;
}): Promise<string[]> {
  const keys = await syncCorrectiveActionPlan(input.instanceId, input.actorId, {
    notes: input.notes,
    loaded: input.loaded,
    checked: Object.fromEntries(Object.entries(input.checked).map(([key, options]) => [key, [...options]])),
  });
  if (keys.length === 0) return [];
  const after = await loadInstance(input.instanceId);
  if (!after) return [];
  const was = snapshotOf(input.loaded).draft;
  const now = snapshotOf(after).draft;
  return keys.filter((key) => !sameValue(was[key]?.value, now[key]?.value));
}

/**
 * The redraft's claim from what the draft route really changed: its realized
 * `formDiff` (the route reduces its write when FORM_PATCH_REDUCER_ENABLED is
 * on). Null when the route returned no diff — the old reply stands. When
 * nothing changed, the reply says so, with the policy line when it applies.
 */
export function redraftOutcome(
  result: { readonly formDiff?: Pick<FormDiff, "changed"> | null },
  policyLine: string | null,
): { updated: string[]; reply: AskResponse | null } | null {
  if (!result.formDiff || !Array.isArray(result.formDiff.changed)) return null;
  const updated = [...new Set(result.formDiff.changed.map((change) => change.key))];
  if (updated.length > 0) return { updated, reply: null };
  return {
    updated,
    reply: { content: [NOTHING_CHANGED, ...(policyLine ? ["", policyLine] : [])].join("\n"), citations: [], coverage: "not_applicable" },
  };
}

/**
 * The same-form copy as a draft write: the copied values through
 * `reduceDraftWrite`, the reduced write through `applyAssistantDraft` (with
 * the copy's provenance), then `settle()`. Returns the keys that really
 * changed, as `copyFormContent` returns the keys it wrote, and
 * `nothingChanged` when the copy changed nothing.
 */
export async function copyThroughReducer(input: {
  readonly source: LoadedInstance;
  readonly target: LoadedInstance;
  readonly actorId: string;
  /** The manager's turns, one per line. */
  readonly notes: string;
}): Promise<{ values: Record<string, string>; checked: Record<string, string[]>; nothingChanged?: string }> {
  const copied = copiedContent(input.source, input.target);
  if (Object.keys(copied.values).length === 0 && Object.keys(copied.checked).length === 0) return { values: {}, checked: {} };
  const reduced = await reduceDraftWrite({
    id: input.target.instance.id,
    values: copied.values,
    checked: copied.checked,
    typedExempt: new Set<string>(),
    notes: input.notes,
    actorId: input.actorId,
  });
  if (!reduced) return { values: {}, checked: {} };
  const keys = [...Object.keys(reduced.write.values), ...Object.keys(reduced.write.checked)];
  if (keys.length > 0) {
    await applyAssistantDraft(
      input.target.instance.id,
      reduced.write,
      input.actorId,
      Object.fromEntries(keys.filter((key) => key in copied.provenance).map((key) => [key, copied.provenance[key]!])),
    );
  }
  const realized = await reduced.settle();
  const values: Record<string, string> = {};
  const checked: Record<string, string[]> = {};
  for (const change of realized.changed) {
    if (typeof change.after === "string") values[change.key] = change.after;
    else checked[change.key] = [...change.after];
  }
  if (realized.changed.length === 0) return { values, checked, nothingChanged: NOTHING_CHANGED };
  return { values, checked };
}
