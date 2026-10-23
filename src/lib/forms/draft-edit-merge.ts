/**
 * Edits applied to a draft that already has fields.
 *
 * An empty incoming value does not blank a field that already has text.
 * Offense and the action plan keep what they say, and a non-empty edit is
 * folded into that text. Other fields take a non-empty edit as the new
 * value. Used only when DRAFT_EDIT_MERGE_ENABLED is on.
 */

export const DRAFT_MERGE_TEXT_KEYS = ["policy_violated", "action_plan"] as const;
export const DRAFT_MERGE_CHECKED_KEYS = ["offense_type"] as const;

const PROTECTED_TEXT = new Set<string>(DRAFT_MERGE_TEXT_KEYS);
const PROTECTED_CHECKED = new Set<string>(DRAFT_MERGE_CHECKED_KEYS);

export function showDraftWithEdits(question: string): boolean {
  const text = question ?? "";
  return /\bshow\b/i.test(text) && /\bdraft\b/i.test(text) && /\bedits?\b/i.test(text);
}

export function mergeFieldText(existing: string, incoming: string): string {
  const prior = existing.trim();
  const next = incoming.trim();
  if (!next) return prior;
  if (!prior) return next;
  const priorLower = prior.toLowerCase();
  const nextLower = next.toLowerCase();
  if (nextLower.includes(priorLower)) return next;
  if (priorLower.includes(nextLower)) return prior;
  return `${prior}\n${next}`;
}

export function mergeDraftEdits(input: {
  readonly existingValues: Readonly<Record<string, string>>;
  readonly incomingValues: Readonly<Record<string, string>>;
  readonly existingChecked?: Readonly<Record<string, readonly string[]>>;
  readonly incomingChecked?: Readonly<Record<string, readonly string[]>>;
}): { values: Record<string, string>; checked: Record<string, string[]> } {
  const values: Record<string, string> = { ...input.incomingValues };
  for (const [key, incoming] of Object.entries(input.incomingValues)) {
    const existing = (input.existingValues[key] ?? "").trim();
    const next = incoming.trim();
    if (!next && existing) {
      delete values[key];
      continue;
    }
    if (PROTECTED_TEXT.has(key) && existing && next) values[key] = mergeFieldText(existing, next);
  }

  const checked: Record<string, string[]> = {};
  for (const [key, incoming] of Object.entries(input.incomingChecked ?? {})) {
    const existing = [...(input.existingChecked?.[key] ?? [])];
    if (incoming.length === 0 && existing.length > 0 && PROTECTED_CHECKED.has(key)) continue;
    checked[key] = [...incoming];
  }
  return { values, checked };
}
