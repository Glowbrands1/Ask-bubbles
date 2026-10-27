import { withoutAppLines } from "@/lib/ai/app-sentences";
import { editDistance } from "@/lib/forms/employee-match";
import { readLocationMentions } from "@/lib/forms/location-mention";
import { priorActionLine } from "@/lib/forms/prior-actions";
import type { ChatFormProposal } from "@/types";

import { checkReading, plainWords, quoted, type CheckedReading } from "./check";
import { parseFormReading } from "./schema";

/**
 * ============================================================================
 * AI_READS_CODE_CHECKS_ENABLED — THE ROUTES CHECK THE CARD'S READING AGAIN
 * ============================================================================
 *
 * The card carries what the reader returned and the code accepted, each with
 * the manager's words (`checkedReading`). The card comes from the browser, so
 * the create and draft routes never take it on trust: every quote is checked
 * again, with the same checks as the chat turn (`check.ts`), against the
 * manager turns the route itself receives. A quote that is not there, or a
 * value it does not give, is dropped.
 */

type CardReading = NonNullable<ChatFormProposal["checkedReading"]>;
type Turn = { readonly role: string; readonly content: string };

function cardReadingOf(raw: unknown): CardReading | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as CardReading) : null;
}

/** The manager's turns, without the app's own lines. */
function managerTurns(conversation: readonly Turn[]): string[] {
  return conversation
    .filter((turn) => turn.role === "user")
    .map((turn) => withoutAppLines(turn.content))
    .filter((turn) => turn.trim() !== "");
}

/** What still passes against these turns; null when the card carries nothing. */
export function recheckCardReading(raw: unknown, conversation: readonly Turn[], today: string): CheckedReading | null {
  const card = cardReadingOf(raw);
  if (!card) return null;
  const pair = (field?: { value?: unknown; quote?: unknown }) =>
    field && typeof field.value === "string" && typeof field.quote === "string" ? { value: field.value, evidence: field.quote } : null;
  const reading = parseFormReading({
    employee: null,
    location: null,
    jobTitle: null,
    incident: null,
    policyHeading: null,
    incidentDate: pair(card.incidentDate),
    warningLevel: pair(card.warningLevel),
    payroll: pair(card.payrollDeduct),
    payrollAmount: pair(card.payrollAmount?.value ? { ...card.payrollAmount, value: card.payrollAmount.value.replace(/^\$/, "") } : undefined),
    priorSteps: Array.isArray(card.priorSteps)
      ? card.priorSteps.map((row) => ({ kind: row?.value?.step ?? null, date: row?.value?.date ?? null, evidence: row?.quote ?? null }))
      : [],
    otherDates: [],
  });
  if (!reading) return null;
  return checkReading(reading, { managerTurns: managerTurns(conversation), people: [], locations: [], headings: [], today });
}

/** The conversation as the create route receives it, roles and text only. */
export function turnsOf(conversation: unknown): Turn[] {
  if (!Array.isArray(conversation)) return [];
  return conversation.flatMap((turn) => {
    if (!turn || typeof turn !== "object") return [];
    const row = turn as { role?: unknown; content?: unknown };
    return (row.role === "user" || row.role === "assistant") && typeof row.content === "string"
      ? [{ role: row.role, content: row.content }]
      : [];
  });
}

/** The step as the Prior actions list names it, read from the manager's words, then the reader's kind. */
const STEP_LABELS: readonly [RegExp, string][] = [
  [/final\s+written/i, "Final written warning"],
  [/written\s+(?:corrective actions?|cas?\b|c\/a)/i, "Written corrective action"],
  [/verbal\s+(?:corrective actions?|cas?\b|c\/a)/i, "Verbal corrective action"],
  [/\bwritten\b(?!\s+up)/i, "Written warning"],
  [/\bverbal(?:ly)?\b/i, "Verbal warning"],
  [/write[- ]?ups?|written up/i, "Write-up"],
  [/\bcoach(?:ed|ing)?\b/i, "Coaching"],
  [/corrective actions?|\b(?:cas?|c\/a)\b/i, "Corrective action"],
];

function stepLabel(quote: string, kind: string): string | null {
  for (const text of [quote, kind]) {
    const hit = STEP_LABELS.find(([pattern]) => pattern.test(text));
    if (hit) return hit[1];
  }
  return null;
}

/**
 * The prior steps the reader quoted that still pass against the draft's
 * notes (the manager's turns), before the form's own date, as Prior actions
 * lines.
 */
export function readerPriorLines(raw: unknown, notes: string, today: string, formDate?: string | null): string[] {
  const card = cardReadingOf(raw);
  if (!card || !Array.isArray(card.priorSteps)) return [];
  const passed = recheckCardReading({ priorSteps: card.priorSteps }, [{ role: "user", content: notes }], today);
  return (passed?.priorSteps ?? [])
    .filter((step) => !formDate || step.iso < formDate)
    .flatMap((step) => {
      const row = card.priorSteps!.find((candidate) => candidate?.value?.date === step.iso);
      const label = stepLabel(row?.quote ?? "", step.kind);
      return label ? [priorActionLine(label, step.iso)] : [];
    });
}

/** The drafted list with each quoted step it does not already date added. */
export function withReaderPriorLines(drafted: string, lines: readonly string[]): string {
  const rows = (drafted ?? "").split("\n").filter((row) => row.trim() !== "");
  for (const line of lines) {
    const signed = /signed (\S+)$/.exec(line)?.[1];
    if (signed && rows.some((row) => row.includes(signed))) continue;
    rows.push(line);
  }
  return rows.join("\n");
}

/**
 * Whether the card's employee is still the one the reader quoted, when the
 * create route's own reading names someone else: the quote is still in the
 * manager's turns, names the card's employee, and holds the name the code
 * read ("Marlowe" inside "Marlowe, Quinn"), or the code's "person" is a
 * store ("dodge"). Then the code and the reader read one person.
 */
export function readerNamesCardEmployee(raw: unknown, conversation: readonly Turn[], cardName: string, codeName: string): boolean {
  const quote = cardReadingOf(raw)?.employee?.quote;
  if (typeof quote !== "string" || !quoted(quote, managerTurns(conversation))) return false;
  const card = plainWords(cardName).split(" ").filter(Boolean);
  const said = plainWords(quote).split(" ").filter(Boolean);
  const close = (word: string, name: string) => word === name || (name.length >= 4 && word.length >= 4 && editDistance(word, name) <= 1);
  // Every word of the quote's name is a word of the card's name: "Marlowe, Quinn", "quinn".
  const nameWords = said.filter((word) => /^[a-z]+$/.test(word));
  if (nameWords.length === 0 || !nameWords.every((word) => card.some((name) => close(word, name)))) return false;
  if (readLocationMentions(`at ${codeName}`).some((mention) => !mention.confirm && mention.locationIds.length > 0)) return true;
  return plainWords(codeName)
    .split(" ")
    .filter(Boolean)
    .every((word) => said.some((quotedWord) => close(word, quotedWord)));
}
