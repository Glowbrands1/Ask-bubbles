import { payrollDeductAmountFieldEnabled, priorActionsParseEnabled } from "@/lib/config/chat-quality-flags";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import { extractFormDate, listIncidentDates, blankYearlessStepDates } from "@/lib/forms/form-date-answer";
import { lateOpenOn, yearlessCuedDates } from "@/lib/forms/late-open";
import { payrollDeductAmount } from "@/lib/forms/payroll-deduct";
import { statedPayrollDeduct } from "@/lib/forms/payroll-deduct-answer";
import { statedWarningLevel, warningLevelFromTurns } from "@/lib/forms/warning-level";
import { extractJobTitle, readEmployeeMentions } from "@/lib/forms/proposal";
import { readLocationMentions, rosterLocationName } from "@/lib/forms/location-mention";
import type { RosterEmployee } from "@/lib/forms/employee-match";

import { fieldsFromManagerText, mergeConfirmed, type ConfirmedFormFields } from "./form-field-state";
import { chooseRememberedCandidate, groundEmployee } from "./roster-grounding";

/**
 * Facts the current turn left out, copied forward from earlier manager turns
 * and from the conversation's stored form state.
 *
 * The proposal readers are not changed. This only adds a sentence they
 * already understand, and only when a flag asks for it. With both flags off
 * the question is returned unchanged.
 */

export interface IntakeTurn {
  readonly role: string;
  readonly content: string;
}

export function augmentIntakeQuestion(input: {
  readonly slots: boolean;
  readonly fields: boolean;
  readonly question: string;
  readonly history: readonly IntakeTurn[];
  readonly today: string;
  readonly roster?: readonly RosterEmployee[];
  readonly stored?: ConfirmedFormFields | null;
}): string {
  if (!input.slots && !input.fields) return input.question;
  const additions: string[] = [];
  if (input.slots) additions.push(...slotLines(input));
  if (input.fields) {
    const earlier = input.history
      .filter((turn) => turn.role === "user")
      .map((turn) => turn.content)
      .join("\n");
    additions.push(...fieldLines(input.question, input.today, earlier));
  }
  if (additions.length === 0) return input.question;
  return `${input.question.trim()}\n${additions.join(" ")}`;
}

function slotLines(input: {
  readonly question: string;
  readonly history: readonly IntakeTurn[];
  readonly today: string;
  readonly roster?: readonly RosterEmployee[];
  readonly stored?: ConfirmedFormFields | null;
}): string[] {
  const earlier = input.history.filter((turn) => turn.role === "user").map((turn) => turn.content);
  const corpus = [...earlier, input.question].join("\n");
  const roster = input.roster ?? [];
  const read = fieldsFromManagerText(corpus, input.today, roster);
  const remembered = input.stored?.pendingChoice.length
    ? chooseRememberedCandidate(input.question, input.stored.pendingChoice)
    : null;
  const merged = mergeConfirmed(input.stored ?? emptyForMerge(), read, false);
  const lines: string[] = [];
  if (
    payrollDeductAmountFieldEnabled() &&
    merged.payrollAmount &&
    merged.payrollDeduct !== "no" &&
    !payrollDeductAmount(input.question)
  ) {
    lines.push(`Payroll deduction of ${merged.payrollAmount}.`);
  }

  const name = remembered?.name || merged.employeeName;
  if (name && readEmployeeMentions(input.question).names.length === 0 && !groundEmployee(input.question, roster)?.name) {
    lines.push(`The employee is ${name}.`);
  }
  const title = remembered?.title || merged.jobTitle || extractJobTitle(corpus);
  if (title && !extractJobTitle(input.question)) lines.push(`Job title: ${title}.`);

  const store =
    (remembered && remembered.locationNames[0]) ||
    merged.store ||
    singleStore([...earlier, input.question]) ||
    fuzzyStore([...earlier, input.question].join("\n"));
  if (store && readLocationMentions(input.question).length === 0) lines.push(`It happened at ${store}.`);
  return lines;
}

function emptyForMerge(): ConfirmedFormFields {
  return {
    employeeName: null,
    employeeId: null,
    jobTitle: null,
    store: null,
    locationId: null,
    incidentDateIso: null,
    useToday: false,
    payrollDeduct: null,
    payrollAmount: null,
    warningLevel: null,
    policySection: null,
    whatHappened: false,
    deadline: null,
    pendingChoice: [],
  };
}

function singleStore(turns: readonly string[]): string | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const mentions = readLocationMentions(turns[index] ?? "").filter((mention) => !mention.confirm && !mention.collision);
    const ids = [...new Set(mentions.flatMap((mention) => mention.locationIds))];
    if (ids.length === 1) return rosterLocationName(ids[0]!) ?? null;
  }
  return null;
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const grams = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) grams.add(padded.slice(index, index + 3));
  return grams;
}

export function trigramSimilarity(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/** A store the mention reader missed, only when one roster name is clearly closer than the next. */
function fuzzyStore(text: string): string | null {
  const phrases = [
    ...text.matchAll(/(?:\bat|\bin)\s+(?:the\s+)?([a-z0-9][a-z0-9'’.-]*(?:\s+[a-z0-9][a-z0-9'’.-]*){0,3})/gi),
  ];
  const raw = phrases.at(-1)?.[1]?.trim();
  if (!raw || raw.length < 4) return null;
  const ranked = COMPANY_LOCATIONS.map((store) => ({
    name: store.name,
    score: Math.max(trigramSimilarity(raw, store.name), trigramSimilarity(raw, store.name.replace(/^[A-Z]{2}\s+/, ""))),
  })).sort((left, right) => right.score - left.score);
  const top = ranked[0];
  const next = ranked[1]?.score ?? 0;
  if (!top || top.score < 0.55 || top.score - next < 0.12) return null;
  return top.name;
}

/**
 * One store the words uniquely resemble, when `readLocationMentions` did not
 * take them. Two stores, or a weak resemblance, is no store.
 */
export function uniqueRosterStore(text: string): string | null {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const hits = new Map<string, number>();
  for (let start = 0; start < tokens.length; start += 1) {
    for (let length = 1; length <= 3 && start + length <= tokens.length; length += 1) {
      const phrase = tokens.slice(start, start + length).join(" ");
      if (phrase.length < 3) continue;
      const ranked = rankStores(phrase);
      if (!ranked) continue;
      hits.set(ranked.name, Math.max(hits.get(ranked.name) ?? 0, ranked.score));
    }
  }
  if (hits.size !== 1) return null;
  return [...hits.keys()][0] ?? null;
}

function rankStores(phrase: string): { name: string; score: number } | null {
  const ranked = COMPANY_LOCATIONS.map((store) => {
    const local = store.name.replace(/^[A-Z]{2}\s+/, "");
    return {
      name: store.name,
      score: Math.max(trigramSimilarity(phrase, store.name), trigramSimilarity(phrase, local)),
    };
  }).sort((left, right) => right.score - left.score);
  const top = ranked[0];
  const next = ranked[1]?.score ?? 0;
  if (!top || top.score < 0.72 || top.score - next < 0.08) return null;
  return top;
}

/**
 * A month-day the date reader skipped, and a dollar amount beside a deduction
 * the amount reader skipped. Rewritten into shapes those readers already accept.
 * A date the reader already returned is left alone.
 */
export function fieldLines(question: string, today: string, earlier = ""): string[] {
  const lines: string[] = [];
  const corpus = earlier.trim() ? `${earlier}\n${question}` : question;
  if (!extractFormDate(question, today)) {
    const known = listIncidentDates(corpus, today);
    const sole = known.length === 1 ? known[0]!.iso : null;
    // "she was coached on 9-15": an earlier step's yearless date is not the incident (PRIOR_ACTIONS_PARSE_ENABLED).
    const yearless = priorActionsParseEnabled() ? blankYearlessStepDates(corpus, today) : corpus;
    const slash = sole ? slashDate(sole) : lastUnyearDated(yearless, today);
    if (slash && !extractFormDate(question, today)) lines.push(`It happened on ${slash}.`);
  }

  if (!payrollDeductAmount(question)) {
    const known = payrollDeductAmount(corpus);
    /*
     * A dollar sign next to the word "payroll" is not, by itself, the
     * manager's amount. The Late Opening sentence states "$25.00 via payroll
     * deduction", and that figure stays off this field.
     */
    const missed = payrollDeductAmountFieldEnabled()
      ? null
      : (missedDeduction(question) ?? missedDeduction(corpus));
    const amount = known ?? missed;
    if (amount) lines.push(`Payroll deduction of ${amount.startsWith("$") ? amount : `$${amount}`}.`);
  }

  if (statedPayrollDeduct(question) === null && earlier.trim()) {
    const known = statedPayrollDeduct(earlier);
    if (known === "yes") lines.push("Payroll deduct applies.");
    else if (known === "no") lines.push("No payroll deduction.");
  }
  if (statedWarningLevel(question) === null && earlier.trim()) {
    const level = warningLevelFromTurns(
      earlier
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      today,
    );
    if (level === "verbal" || level === "written") lines.push(`Warning level: ${level}.`);
  }
  return lines;
}

function slashDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

function lastUnyearDated(text: string, today: string): string | null {
  // "late to open 10-19", "change the date to 10-22": any date cue, and never a future day (LATE_OPEN_DATE_ENABLED).
  if (lateOpenOn()) {
    const iso = yearlessCuedDates(text, today).at(-1)?.iso;
    return iso ? slashDate(iso) : null;
  }
  let last: string | null = null;
  for (const match of text.matchAll(/\b(?:on|dated?)\s+(\d{1,2})-(\d{1,2})(?!\d)/gi)) {
    const formatted = calendarDay(Number(match[1]), Number(match[2]), today);
    if (formatted) last = formatted;
  }
  return last;
}

function calendarDay(month: number, day: number, today: string): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const probe = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(probe.getTime()) || probe.getUTCDate() !== day) return null;
  return `${month}/${day}/${year}`;
}

function missedDeduction(text: string): string | null {
  if (statedPayrollDeduct(text) !== "yes" && !/\bpayroll\b/i.test(text) && !/\bdeduct/i.test(text)) return null;
  const amounts = [...text.matchAll(/\$\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/g)]
    .map((match) => match[0]!.replace(/\s+/g, ""))
    .filter((amount) => Number(amount.replace(/[$,]/g, "")) !== 0);
  if (amounts.length === 0) return null;
  return amounts[amounts.length - 1]!;
}
