import type { InstanceValueRow } from "./instances";

/**
 * ============================================================================
 * THE FORM REDUCER — A PATCH MERGED BY CODE (FORM_PATCH_REDUCER_ENABLED)
 * ============================================================================
 *
 * Step B, 3 Nov 2026. A chat edit or a redraft of an open form is a patch
 * (field, value, how, the words it came from), and this module decides what
 * of it reaches the form. Pure: no I/O, types only. Nothing is matched on
 * words: the rules come from the template and the saved rows, and the only
 * text test is "is this evidence a substring of what was said", folding case
 * and whitespace.
 *
 *   1. A key that is not writable is refused.
 *   2. A set to empty does nothing; only `clear` empties a field, and a
 *      manager-typed field is never cleared.
 *   3. Draft: a manager-typed field is kept (except `typedExempt`), an
 *      assistant field is replaced, a key the patch leaves out is left alone.
 *   4. Edit: "add" appends unless the text is already there; "replace" on a
 *      typed field needs the manager's own words; evidence comes from the
 *      manager, or from the assistant's offer the manager accepted; payroll
 *      and amount keys only verbatim and only once; a date only one the
 *      manager stated.
 *   5. Checkbox options belong to their group; a single-choice group takes one.
 *   6. List keys (prior actions) are united on the line format
 *      `priorActionLine` writes, keeping the longer line; the "none" line goes
 *      once a real line exists.
 *   7. A set to the same value is not a change.
 *
 * Nothing reads it yet: the wiring is a later step, behind the flag.
 */

export type FieldValue = string | readonly string[];

/** Who wrote what a field holds now, from the saved row's provenance only. */
export type Owner = "manager" | "assistant" | "empty";

export interface DraftField {
  readonly key: string;
  readonly value: FieldValue;
  readonly owner: Owner;
}

export type FormDraft = Readonly<Record<string, DraftField>>;

export interface FormPatch {
  readonly set: Readonly<Record<string, FieldValue>>;
  readonly clear: readonly string[];
  readonly how?: Readonly<Record<string, "add" | "replace">>;
  readonly evidence?: Readonly<Record<string, string>>;
}

export type RefusalReason =
  | "not_writable"
  | "typed_by_manager"
  | "would_blank"
  | "date_not_stated"
  | "not_in_manager_words"
  | "unknown_option"
  | "already_answered";

export interface Refusal {
  readonly key: string;
  readonly reason: RefusalReason;
}

export interface FieldChange {
  readonly key: string;
  readonly before: FieldValue;
  readonly after: FieldValue;
}

export interface FormDiff {
  readonly changed: readonly FieldChange[];
  readonly refused: readonly Refusal[];
}

export interface CheckboxGroup {
  readonly options: readonly string[];
  readonly single: boolean;
}

export interface PatchRules {
  /** "draft": the draft route's (re)draft. "edit": a chat edit of the open form. */
  readonly mode: "draft" | "edit";
  /** The template's AI fields and groups, minus the derived, policy-grounded and code-built ones. */
  readonly writable: ReadonlySet<string>;
  /** Keys a draft may replace although the manager typed them (a citable policy line over uncited wording). */
  readonly typedExempt?: ReadonlySet<string>;
  /** Payroll deduction and amount keys: only verbatim from the manager, and only while empty. */
  readonly managerStated?: ReadonlySet<string>;
  /** Date keys: the value must be one of `datesIn(evidence)`. */
  readonly dateKeys?: ReadonlySet<string>;
  /** The ISO dates stated in a text (the caller passes the app's date reader). */
  readonly datesIn?: (text: string) => readonly string[];
  /** Checkbox groups by key. */
  readonly checkboxGroups?: Readonly<Record<string, CheckboxGroup>>;
  /** Line lists united on the prior-action line format. */
  readonly listKeys?: ReadonlySet<string>;
  /** The list's "no history" line, dropped once a real line exists. */
  readonly listNone?: string;
  /** What was said, for the evidence checks (edit mode). */
  readonly sources?: {
    /** The manager's turns. */
    readonly manager: string;
    /** The assistant's last reply. */
    readonly offered?: string;
    /** The latest message accepts `offered`. */
    readonly accepted?: boolean;
  };
}

/* ------------------------------------------------------------- text ---- */

function isSpace(char: string): boolean {
  return char === " " || char === "\n" || char === "\t" || char === "\r" || char === "\f" || char === "\v" || char === " ";
}

/** Lowercased, whitespace runs as one space, trimmed. No pattern matching. */
export function fold(text: string): string {
  let out = "";
  let pendingSpace = false;
  for (const char of text.toLowerCase()) {
    if (isSpace(char)) {
      pendingSpace = out !== "";
      continue;
    }
    if (pendingSpace) out += " ";
    pendingSpace = false;
    out += char;
  }
  return out;
}

function contains(haystack: string, needle: string): boolean {
  const want = fold(needle);
  return want !== "" && fold(haystack).includes(want);
}

/* ------------------------------------------------------------ values ---- */

function asList(value: FieldValue): string[] {
  return (typeof value === "string" ? [value] : [...value]).map((item) => item.trim()).filter((item) => item !== "");
}

function isEmpty(value: FieldValue | undefined): boolean {
  if (value === undefined) return true;
  return typeof value === "string" ? value.trim() === "" : asList(value).length === 0;
}

/** The same value: trimmed text, or the same options in any order. Empty text and no options are the same. */
export function sameValue(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  const left = new Set(asList(a));
  const right = new Set(asList(b));
  return left.size === right.size && [...left].every((item) => right.has(item));
}

/* ----------------------------------------------------------- lists ---- */

const STEP_SEPARATOR = " — ";
const SIGNED_SEPARATOR = " — signed ";

function lines(value: FieldValue): string[] {
  return (typeof value === "string" ? value.split("\n") : [...value]).map((line) => line.trim()).filter((line) => line !== "");
}

/** `priorActionLine`'s own format: the step (first " — " segment) and the signed date. */
export function priorLineKey(line: string): string {
  const step = fold(line.split(STEP_SEPARATOR)[0] ?? "");
  const at = line.lastIndexOf(SIGNED_SEPARATOR);
  const signed = at >= 0 ? fold(line.slice(at + SIGNED_SEPARATOR.length)) : "";
  return `${step}|${signed}`;
}

/** The lines of both, de-duplicated on `priorLineKey` (the longer line kept); the "none" line goes once a real one exists. */
export function uniteLines(existing: FieldValue, added: FieldValue, none?: string): string {
  const out: string[] = [];
  for (const line of [...lines(existing), ...lines(added)]) {
    const key = priorLineKey(line);
    const at = out.findIndex((have) => priorLineKey(have) === key);
    if (at < 0) out.push(line);
    else if (line.length > out[at]!.length) out[at] = line;
  }
  const real = none === undefined ? out : out.filter((line) => fold(line) !== fold(none));
  return (real.length > 0 ? real : out).join("\n");
}

/* ----------------------------------------------------------- reducer ---- */

type Written = { value: FieldValue; owner: Owner } | Refusal | null;

function refuse(key: string, reason: RefusalReason): Refusal {
  return { key, reason };
}

function isRefusal(written: Written): written is Refusal {
  return written !== null && "reason" in written;
}

function current(draft: FormDraft, key: string): DraftField {
  return draft[key] ?? { key, value: "", owner: "empty" };
}

/** Where the evidence was said: "manager", "offered" (an accepted offer), or nowhere. */
function evidenceFrom(evidence: string | undefined, rules: PatchRules): "manager" | "offered" | null {
  if (!evidence || evidence.trim() === "") return null;
  const sources = rules.sources;
  if (!sources) return null;
  if (contains(sources.manager, evidence)) return "manager";
  if (sources.accepted && sources.offered !== undefined && contains(sources.offered, evidence)) return "offered";
  return null;
}

function checkboxValue(key: string, field: DraftField, value: FieldValue, how: "add" | "replace", group: CheckboxGroup): Written {
  const options = asList(value);
  if (options.some((option) => !group.options.includes(option))) return refuse(key, "unknown_option");
  if (group.single) {
    if (options.length !== 1) return refuse(key, "unknown_option");
    return { value: options, owner: "assistant" };
  }
  const merged = how === "add" ? [...new Set([...asList(field.value), ...options])] : [...new Set(options)];
  return { value: merged, owner: "assistant" };
}

function setOne(draft: FormDraft, key: string, value: FieldValue, patch: FormPatch, rules: PatchRules): Written {
  if (!rules.writable.has(key)) return refuse(key, "not_writable");
  const field = current(draft, key);
  // Rule 2: a set to empty never empties a field.
  if (isEmpty(value)) return isEmpty(field.value) ? null : refuse(key, "would_blank");

  const group = rules.checkboxGroups?.[key];
  const isList = rules.listKeys?.has(key) ?? false;
  const typed = field.owner === "manager";

  if (rules.mode === "draft") {
    if (typed && !(rules.typedExempt?.has(key) ?? false)) return sameValue(field.value, value) ? null : refuse(key, "typed_by_manager");
    if (group) return checkboxValue(key, field, value, "replace", group);
    if (isList) return { value: uniteLines(field.value, value, rules.listNone), owner: field.owner === "empty" ? "assistant" : field.owner };
    return { value: typeof value === "string" ? value.trim() : asList(value).join("\n"), owner: "assistant" };
  }

  // Edit: every value comes with the words it came from.
  const evidence = patch.evidence?.[key];
  const from = evidenceFrom(evidence, rules);
  if (!from) return refuse(key, "not_in_manager_words");
  const owner: Owner = from === "manager" ? "manager" : "assistant";
  const how = patch.how?.[key] ?? "replace";
  const text = typeof value === "string" ? value.trim() : asList(value).join("\n");

  if (rules.managerStated?.has(key)) {
    if (sameValue(field.value, text)) return null;
    if (!isEmpty(field.value)) return refuse(key, "already_answered");
    if (!contains(rules.sources?.manager ?? "", text)) return refuse(key, "not_in_manager_words");
    return { value: text, owner: "manager" };
  }
  if (rules.dateKeys?.has(key)) {
    const stated = rules.datesIn ? rules.datesIn(evidence!) : [];
    if (!stated.includes(text)) return refuse(key, "date_not_stated");
    if (typed && from !== "manager") return refuse(key, "typed_by_manager");
    return { value: text, owner };
  }
  if (group) {
    if (typed && how === "replace" && from !== "manager") return refuse(key, "typed_by_manager");
    const written = checkboxValue(key, field, value, how, group);
    return isRefusal(written) || written === null ? written : { value: written.value, owner };
  }
  if (isList) return { value: uniteLines(field.value, value, rules.listNone), owner: typed ? "manager" : owner };
  if (how === "add") {
    const have = typeof field.value === "string" ? field.value.trim() : asList(field.value).join("\n");
    if (have === "") return { value: text, owner };
    if (contains(have, text)) return null;
    return { value: `${have}\n${text}`, owner: typed ? "manager" : owner };
  }
  // "replace": text the assistant offered never replaces what the manager typed.
  if (typed && from !== "manager") return refuse(key, "typed_by_manager");
  return { value: text, owner };
}

function clearOne(draft: FormDraft, key: string, patch: FormPatch, rules: PatchRules): Written {
  if (!rules.writable.has(key)) return refuse(key, "not_writable");
  const field = current(draft, key);
  if (field.owner === "manager") return refuse(key, "would_blank");
  if (isEmpty(field.value)) return null;
  if (rules.mode === "edit" && !contains(rules.sources?.manager ?? "", patch.evidence?.[key] ?? "")) {
    return refuse(key, "not_in_manager_words");
  }
  return { value: typeof field.value === "string" ? "" : [], owner: "empty" };
}

/** The fields whose value differs, in the order of `before` then any new keys. */
export function diffDrafts(before: FormDraft, after: FormDraft): FieldChange[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed: FieldChange[] = [];
  for (const key of keys) {
    const was = before[key]?.value ?? "";
    const now = after[key]?.value ?? "";
    if (!sameValue(was, now)) changed.push({ key, before: was, after: now });
  }
  return changed;
}

/** The patch merged into the draft under the rules, and what changed or was refused. */
export function applyPatch(draft: FormDraft, patch: FormPatch, rules: PatchRules): { draft: FormDraft; diff: FormDiff } {
  const next: Record<string, DraftField> = { ...draft };
  const refused: Refusal[] = [];
  const write = (key: string, written: Written) => {
    if (written === null) return;
    if (isRefusal(written)) {
      refused.push(written);
      return;
    }
    if (sameValue(current(next, key).value, written.value)) return;
    next[key] = { key, value: written.value, owner: isEmpty(written.value) ? "empty" : written.owner };
  };
  for (const [key, value] of Object.entries(patch.set)) write(key, setOne(next, key, value, patch, rules));
  for (const key of patch.clear) write(key, clearOne(next, key, patch, rules));
  return { draft: next, diff: { changed: diffDrafts(draft, next), refused } };
}

/** `applyPatch` with the rules bound. */
export function createReducer(rules: PatchRules): (draft: FormDraft, patch: FormPatch) => { draft: FormDraft; diff: FormDiff } {
  return (draft, patch) => applyPatch(draft, patch, rules);
}

/** The saved rows as a draft. A field is the manager's when its row says so, and only while it holds something. */
export function draftFromRows(rows: readonly InstanceValueRow[]): FormDraft {
  const draft: Record<string, DraftField> = {};
  for (const row of rows) {
    const value: FieldValue = row.checked.length > 0 ? [...row.checked] : (row.value ?? "");
    const byManager =
      row.filledBy === "manager" || (row.filledBy === "system" && row.provenance?.source === "manager_statement");
    const owner: Owner = isEmpty(value) ? "empty" : byManager ? "manager" : "assistant";
    draft[row.fieldKey] = { key: row.fieldKey, value, owner };
  }
  return draft;
}
