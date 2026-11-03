import "server-only";

import type { AskResponse } from "@/lib/ai/types";

import { blocksForVariant, checkboxGroupsForVariant, fieldsForVariant, interpolate, parseFormDocument } from "./document";
import { NOTHING_CHANGED, replyFromDiff } from "./form-diff-reply";
import { diffDrafts, draftFromRows, type DraftField, type FieldChange, type FormDraft } from "./form-reducer";
import { authorizeInstance } from "./instance-scope";
import type { LoadedInstance } from "./instances";

/**
 * ============================================================================
 * THE OPEN FORM AS SAVED, BEFORE AND AFTER A TURN (FORM_REPLY_FROM_DIFF_ENABLED)
 * ============================================================================
 *
 * Step B. The chat route takes a snapshot of the open form before the answer
 * cascade and another after it, and the reply about the form is built from
 * the difference — what is really saved — never from what a path says it did.
 *
 * A snapshot is the form's header (the instance's own columns: employee,
 * position, store, Date, follow-up date) and its value rows, as one draft.
 * A value row with the same key as a header column (the Date line, the
 * Employee Name line) is the one kept: the row is what the form shows.
 *
 * Read with "view" authorization; null for an id that fails, so a forged id
 * yields nothing. Nothing here writes.
 */

export interface FormSnapshot {
  readonly instanceId: string;
  readonly status: string;
  /** Header and rows, keyed by field key. */
  readonly draft: FormDraft;
  /** What each key is called on the form, for the reply. */
  readonly labels: Readonly<Record<string, string>>;
}

/** The instance's own columns, under the keys the matching rows use. */
const HEADER: readonly { key: string; label: string; read: (loaded: LoadedInstance) => string | null }[] = [
  { key: "employee_name", label: "Employee", read: (loaded) => loaded.instance.employeeName },
  { key: "job_title", label: "Position", read: (loaded) => loaded.instance.employeeRole },
  { key: "location", label: "Store", read: (loaded) => loaded.instance.locationName },
  { key: "form_date", label: "Date", read: (loaded) => loaded.instance.formDate },
  { key: "follow_up_date", label: "Follow-up date", read: (loaded) => loaded.instance.followUpDate },
];

/** Labels for every field and checkbox group; an unlabelled group is named by its section heading. */
export function formLabels(loaded: LoadedInstance): Record<string, string> {
  const document = parseFormDocument(loaded.version.document);
  const variantKey = loaded.instance.variantKey;
  const labels: Record<string, string> = {};
  for (const entry of HEADER) labels[entry.key] = entry.label;
  for (const field of fieldsForVariant(document, variantKey)) labels[field.key] = interpolate(field.label, null);
  let heading: string | null = null;
  const headings = new Map<string, string>();
  for (const block of blocksForVariant(document, variantKey)) {
    if (block.kind === "section") heading = block.label;
    if (block.kind === "checkbox_group" && heading) headings.set(block.key, heading);
  }
  for (const group of checkboxGroupsForVariant(document, variantKey)) {
    labels[group.key] = group.label?.trim() || headings.get(group.key) || group.key;
  }
  return labels;
}

/** The loaded form as a snapshot: the header columns, then the rows over them. */
export function snapshotOf(loaded: LoadedInstance): FormSnapshot {
  const draft: Record<string, DraftField> = {};
  for (const entry of HEADER) {
    const value = (entry.read(loaded) ?? "").trim();
    draft[entry.key] = { key: entry.key, value, owner: value === "" ? "empty" : "assistant" };
  }
  Object.assign(draft, draftFromRows(loaded.values));
  return { instanceId: loaded.instance.id, status: loaded.instance.status, draft, labels: formLabels(loaded) };
}

/** The open form as saved now, read under "view" authorization. Null when it cannot be read. */
export async function snapshotForm(instanceId: string, request: Request): Promise<FormSnapshot | null> {
  try {
    const { loaded } = await authorizeInstance(request, instanceId, "view");
    return snapshotOf(loaded);
  } catch {
    return null;
  }
}

/** What differs between two snapshots of the same form, header and rows. */
export function snapshotDiff(before: FormSnapshot, after: FormSnapshot): FieldChange[] {
  if (before.instanceId !== after.instanceId) return [];
  return diffDrafts(before.draft, after.draft);
}

/**
 * ============================================================================
 * A PATH'S CLAIM, CHECKED AGAINST THE SAVED FORM (FORM_REPLY_FROM_DIFF_ENABLED)
 * ============================================================================
 *
 * QA, 3 Nov 2026: the reply a path wrote is kept, guidance and questions
 * included, whenever what it claims is true. Nothing is read from its words:
 * the claim is its `formUpdate`, the truth is the form read again.
 *
 *   - A claim (`formUpdate`) on this form, and every claimed key changed in
 *     the saved form: the answer, exactly as the path wrote it.
 *   - A claim that is not borne out: nothing changed → "I didn't change
 *     anything on the form."; other keys changed → a line for each of those.
 *     `formUpdate` becomes the keys that really changed, or is removed.
 *   - No claim: the answer as it is, even when the form changed.
 */
export function checkedClaim(answer: AskResponse, before: FormSnapshot, after: FormSnapshot): AskResponse {
  const claim = answer.formUpdate;
  if (!claim || claim.instanceId !== before.instanceId || after.instanceId !== before.instanceId) return answer;
  const changed = snapshotDiff(before, after);
  const real = new Set(changed.map((change) => change.key));
  if (claim.updated.length > 0 && claim.updated.every((key) => real.has(key))) return answer;
  const { formUpdate: _false, ...rest } = answer;
  void _false;
  return {
    ...rest,
    content: changed.length === 0 ? NOTHING_CHANGED : replyFromDiff({ changed }, after.labels),
    ...(changed.length > 0 ? { formUpdate: { instanceId: before.instanceId, updated: changed.map((change) => change.key) } } : {}),
  };
}
