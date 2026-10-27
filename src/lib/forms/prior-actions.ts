import { futurePriorRowDropEnabled, priorActionsParseEnabled, priorRowNotOnIncidentDateEnabled, priorStepSentenceEnabled } from "@/lib/config/chat-quality-flags";

import { statesFirstOccurrence } from "./corrective-action-intake";
import { correctedDates, datesInText, managerDatesForDraft, priorSteps } from "./form-date-answer";
import { incidentDates } from "./incident-dates";
import { priorSentenceFixFor } from "./prior-sentence-scope";
import { OFFICIAL_POLICY_MANUAL } from "./official-policy-manual";

/**
 * ============================================================================
 * "LIST PREVIOUSLY RECEIVED COACHING AND/OR CORRECTIVE ACTION WITH DATE SIGNED"
 * ============================================================================
 *
 * The Corrective Action Form's one line for the employee's history, from
 * revision 5 (HR feedback, 3 Oct 2026). It replaced two single lines —
 * "Previous corrective action for this policy or issue" and "Date of previous
 * corrective action" — which held one step and one date between them.
 *
 * ONE ENTRY PER LINE, each saying what was received and when it was signed:
 *
 *   Coaching — signed 09/02/2026
 *   Verbal warning — signed 09/21/2026
 *
 * THE HISTORY IS THE MANAGER'S, NEVER THE MODEL'S. The whole progression
 * escalates on this line, so a date in it survives only where the manager
 * stated it, and a step the manager dated in their own words is put here by
 * code even if the model left it out — which is the production fix the old
 * date line carried (`priorStepDate`), kept for the list. Pure and
 * browser-safe.
 */

export const PRIOR_ACTIONS_KEY = "prior_actions";
export const PRIOR_ACTIONS_LABEL =
  "List previously received coaching and/or corrective action with date signed";

/** The two revision-4 keys this field replaced. Still read on forms filed against them. */
export const LEGACY_PREVIOUS_ACTION_KEY = "previous_action";
export const LEGACY_PREVIOUS_ACTION_DATE_KEY = "previous_action_date";

/** What the line says when there is no history — a real answer, not a blank. */
export const NO_PRIOR_ACTION = "None — first occurrence";

/** `YYYY-MM-DD` as the business writes a date by hand. */
export function signedDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return match ? `${match[2]}/${match[3]}/${match[1]}` : iso.trim();
}

/** The kinds of step the list records, most specific first. */
const STEPS: readonly [RegExp, string][] = [
  [/\b(?:verbally\s+(?:warned|coached|counsell?ed)|warned\s+verbally)\b/i, "Verbal warning"],
  [/final\s+written\s+(?:corrective actions?|cas?\b|c\/a)/i, "Final written corrective action"],
  [/written\s+(?:corrective actions?|cas?\b|c\/a)/i, "Written corrective action"],
  [/verbal\s+(?:corrective actions?|cas?\b|c\/a)/i, "Verbal corrective action"],
  [/final\s+written\s+warning/i, "Final written warning"],
  [/written\s+warning/i, "Written warning"],
  [/verbal\s+warning/i, "Verbal warning"],
  // "she's had a verbal before", "got a written in august" — the noun left off (QA, 22 Oct 2026, round 3).
  [/\bfinal\s+written\b/i, "Final written warning"],
  [/\bwritten\b(?!\s+up)/i, "Written warning"],
  [/\bverbal(?:ly)?\b/i, "Verbal warning"],
  [/write[- ]?ups?|written up/i, "Write-up"],
  [/corrective actions?/i, "Corrective action"],
  [/\b(?:cas?|c\/a)\b/i, "Corrective action"],
  [/coach(?:ed|ing)?/i, "Coaching"],
  [/disciplin\w*/i, "Disciplinary action"],
  [/warn(?:ing|ings|ed)/i, "Warning"],
  [/(?:\bpolicy\s+)?\backnowledge?ments?\b|\backnowledged\b/i, "Policy acknowledgement"],
];

/** The step a manager's words named, as a line on the list begins. */
function stepLabel(named: string): string {
  return namedStep(named)?.label ?? "Coaching or corrective action";
}

/**
 * The step nearest the date in the manager's words, and where it ends. Where
 * two end at the same place ("verbal warning" and its "warning"), the more
 * specific, listed first, wins.
 */
function namedStep(named: string): { start: number; end: number; label: string } | null {
  let best: { start: number; end: number; label: string } | null = null;
  for (const [pattern, label] of STEPS) {
    const global = new RegExp(pattern.source, "gi");
    for (const match of named.matchAll(global)) {
      const end = match.index + match[0].length;
      if (!best || end > best.end) best = { start: match.index, end, label };
    }
  }
  return best;
}

/**
 * The step a LINE of the list records: the first one it names, since a line
 * opens with its step ("Verbal warning for tardiness after coaching — …" is a
 * verbal warning). Null for a line that names no step.
 */
function lineStep(line: string): string | null {
  let best: { start: number; length: number; label: string } | null = null;
  for (const [pattern, label] of STEPS) {
    const match = pattern.exec(line);
    if (!match) continue;
    const better =
      !best || match.index < best.start || (match.index === best.start && match[0].length > best.length);
    if (better) best = { start: match.index, length: match[0].length, label };
  }
  return best?.label ?? null;
}

/** A verbal or written CA is the verbal or written warning the form issues. */
const SAME_AS: Record<string, string> = {
  "Verbal corrective action": "Verbal warning",
  "Written corrective action": "Written warning",
  "Final written corrective action": "Final written warning",
};

/**
 * Steps of one kind: a "Warning" or "Disciplinary action" names no particular
 * step, and a "Corrective action" may be a verbal or written one.
 */
function sameStep(a: string, b: string): boolean {
  const generic = new Set(["Warning", "Disciplinary action", "Coaching or corrective action"]);
  const kind = (label: string) => SAME_AS[label] ?? label;
  const isCa = (label: string) => /corrective action$/i.test(label);
  return (
    kind(a) === kind(b) ||
    generic.has(a) ||
    generic.has(b) ||
    ((a === "Corrective action" || b === "Corrective action") && isCa(a) && isCa(b))
  );
}

/**
 * What the manager said the step was FOR, in their own words — "got a verbal
 * warning for tardiness on 9/21" → "for tardiness". Only a phrase that opens
 * with for/about/regarding/over is a description; anything else is left out
 * rather than guessed at.
 */
function stepDescription(named: string): string {
  const step = namedStep(named);
  if (!step) return "";
  const rest = named
    .slice(step.end)
    .replace(/\s+(?:on|dated|signed|at|back|in|from)\s*$/i, "")
    .replace(/[\s,]+$/, "")
    .trim();
  return /^(?:for|about|regarding|over)\s+\S/i.test(rest) ? rest : "";
}

export function priorActionLine(step: string, iso: string, description = "", topic = ""): string {
  const what = description ? `${step} ${description}` : step;
  return `${topic ? `${what} — ${topic}` : what} — signed ${signedDate(iso)}`;
}

/**
 * WHAT AN EARLIER STEP WAS ABOUT, as the manager labelled it: "previous
 * coaching was jba policy manual 1-1-26" → "JBA Policy Manual" (District
 * Manager feedback, 21 Oct 2026). Their words, in their order; only a word of
 * the official manual's own name is printed the way the manual spells it, so
 * "jba manual" reads "JBA Manual" on the record. Nothing is added.
 */
const MANUAL_WORDS = new Map(
  OFFICIAL_POLICY_MANUAL.fallbackTitles
    .flatMap((title) => title.split(/\s+/))
    .filter((word) => /^[A-Za-z]+$/.test(word))
    .map((word) => [word.toLowerCase(), word] as const),
);

function stepTopic(topic: string | undefined): string {
  let words = (topic ?? "").trim();
  // "previous coaching: verbal ca 9-1-26": the item names its own step, which the line already opens with.
  const step = namedStep(words);
  if (step) words = `${words.slice(0, step.start)} ${words.slice(step.end)}`.trim();
  return words
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => MANUAL_WORDS.get(word.toLowerCase()) ?? word)
    .join(" ");
}

/**
 * The earlier steps the manager dated in their own words, as lines on the list
 * — what `groundPriorActions` adds when the draft left one out, and what the
 * chat reads back before the form is created.
 */
export function statedPriorActions(notes: string, today: string): string[] {
  return stepsSaid(notes, today).map(managerStepLine);
}

/*
 * PRIOR_STEP_SENTENCE_ENABLED (managers in the sibling app, 26 Oct 2026): "this should be a
 * written and note a verbal ca was given on 9-1-26" and "she was issued a
 * verbal ca on 10.1 for this same thing" listed no Prior actions row. The
 * step reader (`priorSteps`, in the protected `form-date-answer.ts`) reads a
 * labelled list ("previous coaching: verbal ca 9-1-26"), not a step told in
 * a sentence, and its date reader does not read "10.1". With the flag on a
 * sentence that says a step was given, issued, received or signed on a date
 * adds that step; "10.1" is October 1, its year the latest one not after
 * today. Off, `priorSteps` alone.
 */
const STEP_GIVEN =
  /\b(?:was|were|been|got|get|received|had)\s+(?:already\s+|previously\s+|also\s+)?(?:(?:issued|given|signed)\s+)?(?:an?\s+|her\s+|his\s+)?|\b(?:issued|gave|given|signed)\s+(?:her\s+|him\s+|them\s+)?(?:an?\s+)?/gi;
const STEP_THEN_GIVEN = /\b(?:was|were)\s+(?:issued|given|signed)\b/i;
const DOT_DATE = /(?<![$\d.])\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?\b(?![.\d])/g;

function dotDates(sentence: string, today: string): { iso: string; index: number }[] {
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  const out: { iso: string; index: number }[] = [];
  for (const match of sentence.matchAll(DOT_DATE)) {
    const m = Number(match[1]);
    const d = Number(match[2]);
    if (m < 1 || m > 12 || d < 1 || d > 31) continue;
    let y = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : year;
    if (!match[3] && (m > month || (m === month && d > day))) y -= 1;
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (iso > today) continue;
    out.push({ iso, index: match.index });
  }
  return out;
}

function sentenceSteps(notes: string, today: string): { iso: string; named: string }[] {
  const steps: { iso: string; named: string }[] = [];
  for (const sentence of (notes ?? "").split(/(?<=[!?\n])|(?<=\.)(?!\d)/)) {
    const step = namedStep(sentence);
    if (!step) continue;
    const before = sentence.slice(0, step.start);
    const after = sentence.slice(step.end);
    const given = [...before.matchAll(STEP_GIVEN)].some((match) => match.index + match[0].length >= step.start - 1) || STEP_THEN_GIVEN.test(after.slice(0, 20));
    if (!given) continue;
    const dates = [...datesInText(after, today), ...dotDates(after, today)];
    const first = dates.filter((found) => found.iso <= today).sort((a, b) => a.index - b.index)[0];
    if (first) steps.push({ iso: first.iso, named: sentence.slice(step.start, step.end) });
  }
  return steps;
}

/** The steps the manager dated: `priorSteps`, and with PRIOR_STEP_SENTENCE_ENABLED a step told in a sentence. */
function stepsSaid(notes: string, today: string): { iso: string; named: string; topic?: string; about?: string }[] {
  const steps = priorSteps(notes, today);
  if (!priorStepSentenceEnabled()) return steps;
  const have = new Set(steps.map((step) => step.iso));
  return [...steps, ...sentenceSteps(notes, today).filter((step) => !have.has(step.iso) && have.add(step.iso))];
}


/**
 * One step the manager dated, as a line. PRIOR_ACTIONS_PARSE_ENABLED (QA, 25 Oct
 * 2026): the line holds no word the manager did not say — "signed" only when
 * they wrote sign/signed, and a manual they named reads as the manual's title,
 * "JBA Policy Manual", with nothing added after it. "jba manual 1-1-26 for
 * previous coaching" is "Coaching — JBA Policy Manual — 01/01/2026". Off, the
 * line is as before.
 */
function managerStepLine(step: { iso: string; named: string; topic?: string; about?: string }): string {
  const label = stepLabel(step.named);
  const description = stepDescription(step.named) || (step.about ?? "");
  if (!priorActionsParseEnabled()) return priorActionLine(label, step.iso, description, stepTopic(step.topic));
  const what = description ? `${label} ${description}` : label;
  // "verbal ca signed 9-1-26": "signed" marks the date, it is not what the step was about.
  const topic = manualTitled(stepTopic(step.topic))
    .replace(/\bsign(?:ed|ing)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const signed = /\bsign(?:ed|ing)?\b/i.test(`${step.named} ${step.topic ?? ""}`);
  return `${topic ? `${what} — ${topic}` : what} — ${signed ? "signed " : ""}${signedDate(step.iso)}`;
}

/** "jba manual", "policy manual", "JBA Policy Manual": the manual's title, never renamed. */
function manualTitled(topic: string): string {
  return topic.replace(/\b(?:jba\s+)?(?:policy\s+)?manual\b/i, "JBA Policy Manual");
}

/**
 * The drafted list, held to what the manager actually said.
 *
 *   A line carrying a date the manager never gave is removed — an invented
 *   date on a disciplinary history is the worst thing this line can hold.
 *   A dated line whose step is not the step the manager named for that date
 *   ("Final written warning" on the day they said a verbal warning was given)
 *   is replaced by the manager's own step. The history is theirs.
 *   An undated line naming a step the manager never mentioned at all is
 *   removed: that is a prior action nobody reported.
 *   Each step the manager dated in their own words and the draft left out is
 *   added as its own line, with what they said it was for — and so is each
 *   finalized form on file for them (`prior-forms.ts`).
 *   The list reads OLDEST FIRST: dated lines in date order, then the lines
 *   with no date (whose place in the history the manager has not given), in
 *   the order they were written.
 *   Left empty, and told "first time", it reads "None — first occurrence".
 *
 * Lines without a date are otherwise kept: "Coaching on attendance (date not
 * given)" is the manager's to complete, not this function's to delete.
 */
export function groundPriorActions(input: {
  drafted: string;
  notes: string;
  today: string;
  /**
   * The employee's finalized forms in the Forms Register, as lines — see
   * `prior-forms.ts`. A record, so its dates stand as the manager's do, and a
   * step on file that the draft left out is listed.
   */
  onFile?: readonly { formDate: string; line: string; templateKey?: string }[];
}): { value: string; added: string[]; removed: string[] } {
  const managerSteps = stepsSaid(input.notes, input.today);
  const onFile = input.onFile ?? [];
  // The dates the manager gave, with a step's date read as last year's where it would be ahead of today.
  const stated = new Set([
    // PRIOR_SENTENCE_FIX_ENABLED: a yearless "10-16" the manager typed is a date they gave (`datesInText` with it off).
    ...(priorSentenceFixFor(input.notes) ? managerDatesForDraft : datesInText)(input.notes, input.today).map((found) => found.iso),
    ...managerSteps.map((step) => step.iso),
    ...onFile.map((form) => form.formDate),
  ]);
  const stepOn = new Map(managerSteps.map((step) => [step.iso, stepLabel(step.named)]));
  const incidentDays = priorRowNotOnIncidentDateEnabled() ? new Set(incidentDates(input.notes, input.today)) : new Set<string>();
  const stepOrFile = new Set([...managerSteps.map((step) => step.iso), ...onFile.map((form) => form.formDate)]);
  // The kinds of step the manager named without a date ("On the first shift I verbally coached her"): such a row may be theirs.
  const undatedKinds = priorRowNotOnIncidentDateEnabled() ? undatedStepKinds(input.notes, input.today) : new Set<string>();
  const onIncidentDatesOnly = (isos: readonly string[], line: string) =>
    isos.length > 0 &&
    isos.every((iso) => incidentDays.has(iso) && !stepOrFile.has(iso)) &&
    !undatedKinds.has(stepKind(line) ?? "");
  const mentioned = new Set(STEPS.filter(([pattern]) => pattern.test(input.notes)).map(([, label]) => label));
  const removed: string[] = [];

  // A date the manager corrected ("9-2-26 not 9-1-26") is no longer one they gave.
  for (const retracted of correctedDates(input.notes, input.today).keys()) stated.delete(retracted);
  const kept = (input.drafted ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (line === "") return false;
      const dates = datesInText(line, input.today);
      if (dates.some((found) => !stated.has(found.iso))) {
        removed.push(line);
        return false;
      }
      /*
       * FUTURE_PRIOR_ROW_DROP_ENABLED (QA LS-B11, 26 Oct 2026: "previous
       * coaching jba manual 11-1-26", corrected next turn to "jba manual
       * 11-1-25"): the draft kept "Coaching — signed 11/01/2026" beside the
       * corrected row. An earlier step is never after today, so with the flag
       * on such a row is removed. Off, as before.
       */
      if (futurePriorRowDropEnabled() && dates.length > 0 && dates.every((found) => found.iso > input.today)) {
        removed.push(line);
        return false;
      }
      const step = lineStep(line);
      // PRIOR_ROW_NOT_ON_INCIDENT_DATE_ENABLED: a step on the incident's own date that nobody named is invented.
      if (step && dates.length > 0 && onIncidentDatesOnly(dates.map((found) => found.iso), line)) {
        removed.push(line);
        return false;
      }
      if (step && dates.length > 0) {
        // A different step on a day the manager named one is not their history.
        const said = dates.map((found) => stepOn.get(found.iso)).filter((label): label is string => Boolean(label));
        if (said.length > 0 && !said.some((label) => sameStep(label, step))) {
          removed.push(line);
          return false;
        }
      }
      if (step && dates.length === 0 && ![...mentioned].some((label) => sameStep(label, step))) {
        removed.push(line);
        return false;
      }
      return true;
    });

  const present = new Set(kept.flatMap((line) => datesInText(line, input.today).map((found) => found.iso)));
  const added: string[] = [];
  for (const step of managerSteps) {
    if (present.has(step.iso)) continue;
    present.add(step.iso);
    added.push(managerStepLine(step));
  }
  /*
   * What the manager said of a step comes first; the record fills in the rest.
   *
   * A LINE STANDS FOR ONE STEP, NOT FOR A WHOLE DAY (QA F-11, 22 Oct 2026). A
   * Coaching Form and a Verbal CA signed the same day are two steps; matching
   * on the date alone listed only the first. A line already on the list covers
   * a form on file only when it has the form's date AND names the same kind
   * of step, and each line covers one form.
   */
  const covering = [...kept, ...added].map((line) => ({
    line,
    dates: new Set(datesInText(line, input.today).map((found) => found.iso)),
    used: false,
  }));
  for (const form of onFile) {
    const cover = covering.find(
      (entry) => !entry.used && entry.dates.has(form.formDate) && sameStepKind(entry.line, form),
    );
    if (cover) {
      cover.used = true;
      continue;
    }
    added.push(form.line);
    covering.push({ line: form.line, dates: new Set([form.formDate]), used: true });
  }

  const lines = [...kept, ...added];
  // A history and "None" cannot both be true; a dated step wins.
  const history = lines.filter((line) => !/^none\b/i.test(line));
  const final = chronological(history.length > 0 ? history : lines, input.today);

  if (final.length === 0 && statesFirstOccurrence(input.notes)) {
    return { value: NO_PRIOR_ACTION, added: [NO_PRIOR_ACTION], removed };
  }
  return { value: final.join("\n"), added, removed };
}

/** Oldest first by each line's earliest date; undated lines after, in written order. */
function chronological(lines: readonly string[], today: string): string[] {
  const keyed = lines.map((line, position) => {
    const dates = datesInText(line, today).map((found) => found.iso).sort();
    return { line, position, date: dates[0] ?? null };
  });
  return keyed
    .sort((a, b) => {
      if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : a.position - b.position;
      if (a.date) return -1;
      if (b.date) return 1;
      return a.position - b.position;
    })
    .map((entry) => entry.line);
}

/** Whether a line on the list names the same kind of step as a form on file. */
function sameStepKind(line: string, form: { line: string; templateKey?: string }): boolean {
  const coaching = (text: string) => /\bcoach/i.test(text);
  const corrective = (text: string) => /\b(?:corrective|verbal|written|warning|termination|demotion|ca|c\/a|write[- ]?up)\b/i.test(text);
  const formIsCoaching = form.templateKey ? form.templateKey === "coaching" : coaching(form.line) && !corrective(form.line);
  return formIsCoaching ? coaching(line) : corrective(line);
}

/**
 * The revision-4 pair, read as one entry on the new list — so a form revised
 * onto revision 5 keeps the history its original recorded. Null when the
 * original recorded neither.
 */
export function legacyPriorActions(
  previousAction: string | null | undefined,
  previousActionDate: string | null | undefined,
): string | null {
  const action = (previousAction ?? "").trim();
  const date = (previousActionDate ?? "").trim();
  if (action === "" && date === "") return null;
  if (date === "") return action;
  const step = action === "" ? "Previous corrective action" : action;
  return `${step} — signed ${signedDate(date)}`;
}

/*
 * PRIOR_ROW_NOT_ON_INCIDENT_DATE_ENABLED (QA live pass 7, 26 Oct 2026): a row on
 * an incident date is the manager's when they named that kind of step without
 * a date ("On the first shift I verbally coached her on our policy" → the
 * coaching on 10/5, the first shift). It is invented only when every step of
 * that kind they named has its own date ("i coached her on 10-16"), as with
 * "Verbal coaching on lateness — 10/15/2026" built from "verbal" and "10-15".
 */
const STEP_WORDS =
  /\b(?:coach(?:ed|ing)?|talked\s+(?:to|with)|spoke\s+(?:to|with)|counsel(?:ed|ing)?|warn(?:ed|ing)|(?:verbal|written)\s+(?:warning|ca|corrective)|wrote\s+(?:her|him|them)\s+up|write[- ]?up)\b/i;

/* A yearless day the date reader may skip: "10-16", "10/1", "oct 1st", "October 1st". */
const HAS_A_DAY =
  /\b\d{1,2}[-/.]\d{1,2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/i;

function stepKind(text: string): "warning" | "coaching" | null {
  if (/\b(?:warn(?:ed|ing)?|written|write[- ]?up|wrote\s+\w+\s+up|corrective|c\/?a)\b/i.test(text)) return "warning";
  if (/\b(?:coach(?:ed|ing)?|talked|spoke|counsel(?:ed|ing)?)\b/i.test(text)) return "coaching";
  return null;
}

function undatedStepKinds(notes: string, today: string): Set<string> {
  const kinds = new Set<string>();
  for (const sentence of notes.split(/(?<=[.!?])\s+|\n+/)) {
    if (!STEP_WORDS.test(sentence) || datesInText(sentence, today).length > 0 || HAS_A_DAY.test(sentence)) continue;
    const kind = stepKind(sentence.replace(/\b(?:create|make|need|issue|write)\b.*?\b(?:ca|c\/a|corrective\s+action)(?:\s+form)?\b/gi, " "));
    if (kind) kinds.add(kind);
  }
  return kinds;
}
