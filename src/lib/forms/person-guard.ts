import { NOT_A_NAME as BUSINESS_WORDS } from "@/lib/ai/employee-performance-gate";
import { isReportName } from "@/lib/ai/report-name";
import { COMPANY_METRIC_PHRASES } from "@/config/company/metric-words";
import { companyMetricWordsNotNamesEnabled, metricGuardEnabled, offeredNameAcceptedEnabled, personGuardEnabled } from "@/lib/config/chat-quality-flags";
import { isNotAName } from "@/lib/forms/not-a-name";
import { isAcceptedOffRoster } from "@/lib/forms/off-roster-confirm";
import { installSlotRosterNames, namesAMetric, outsideRequestSlot } from "@/lib/forms/request-slot";

/**
 * ============================================================================
 * ONE ANSWER TO "IS THIS A PERSON?" FOR EVERY READER
 * ============================================================================
 *
 * PERSON_GUARD_ENABLED (QA, 3 Nov 2026; Pau: "This is a repeated problem. I've
 * fixed some of it before but still keep appearing"). At least eight readers
 * decide who a form is for, and each fix taught one or two of them about one
 * more word that is not a person — "Daily Stats", a manager's own name, a
 * shared login, a street address. The 2 Nov scan found three more that every
 * reader in the sibling app still took for people: a policy name ("can you
 * create a CA for must see behaviors"), "Practice" ("Give me a mock coaching
 * form for practice") and a metric in a manager's account of what happened.
 *
 * One rule, read by every reader (`namesSomebody`, the turns a card is drawn
 * from, …):
 *   - SOMEBODY ON THE MANAGER'S ROSTER IS A PERSON. Always — "Grace", "Mark",
 *     "Faith Practice" on the directory are never blocked, whatever a list
 *     below says.
 *   - Otherwise a candidate is not a person when this app's own data says so:
 *     a report name, the not-a-name lists,
 *     the business vocabulary the performance reader already keeps (metrics,
 *     product words) — every word of it — or it stands for a policy, a
 *     practice run or a metric rather than somebody ("behaviors",
 *     "practice", "average").
 * Off, every reader is as it was.
 */

/** Words that make the whole candidate a policy or a standard, wherever they sit in it: "Must See Behaviors", "Standards of Conduct". */
const THING_WORDS = new Set([
  "behavior", "behaviors", "behaviour", "behaviours", "policy", "policies", "standards", "conduct", "procedure", "procedures", "guideline", "guidelines", "expectations",
]);

/**
 * A practice run, not a person: "a mock coaching form for practice". Only as
 * the whole candidate or its first word ("Practice", "Mock Employee") — a
 * surname like "Kaitlyn Sample" or "Marlowe Example" is still somebody.
 */
const PRACTICE_WORDS = new Set(["practice", "mock", "sample", "example"]);

/** Days and months are first names too ("April", "June"): never a reason on their own. */
const CALENDAR = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
]);
const business = (word: string) => BUSINESS_WORDS.has(word) && !CALENDAR.has(word);

/** Words that are only measures: a candidate made of nothing else is a metric. */
const MEASURE_WORDS = new Set(["avg", "average", "averages", "total", "totals", "rate", "ratio", "percent", "pct", "metric", "metrics", "goal", "goals", "units", "count"]);

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%]+/)
    .filter(Boolean);
}

/** COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED: every word of the company's own metric phrases (`config/company/metric-words.ts`). */
const COMPANY_METRIC_WORDS = new Set(COMPANY_METRIC_PHRASES.flatMap((phrase) => wordsOf(phrase)).filter((word) => word !== "%"));

/** COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED: "Comp Sales", "Discount Rate", "IPT" — the company's metric words, measure words and percents only. */
function companyMetric(words: readonly string[]): boolean {
  if (!companyMetricWordsNotNamesEnabled()) return false;
  if (!words.some((word) => COMPANY_METRIC_WORDS.has(word))) return false;
  return words.every((word) => COMPANY_METRIC_WORDS.has(word) || MEASURE_WORDS.has(word) || /^%$|%$/.test(word));
}

/* ---------------------------------------------------------- the roster -- */

type RosterRead = () => readonly string[] | undefined;
let readRoster: RosterRead = () => undefined;

/** The server installs the actor's roster reader (`person-roster-store.ts`). Unset — a test, the browser — no roster. */
export function installPersonRoster(read: RosterRead): void {
  readRoster = read;
}

/** The actor's roster names for this turn, as the route entered them; undefined with none (a test, the browser, the guard off). */
export function personRosterNames(): readonly string[] | undefined {
  return readRoster();
}

// FORM_NAME_FROM_ROSTER_ENABLED: the request slot never rules out somebody's whole roster name (`request-slot.ts`).
installSlotRosterNames(personRosterNames);

/** On the roster: the full name, or a one-word candidate that is someone's first or last name. */
function onRoster(candidate: string): boolean {
  const roster = readRoster();
  if (!roster || roster.length === 0) return false;
  const typed = wordsOf(candidate).join(" ");
  if (!typed) return false;
  return roster.some((name) => {
    const words = wordsOf(name);
    const full = words.join(" ");
    if (full === typed) return true;
    const parts = typed.split(" ");
    if (parts.length === 1) return words.includes(parts[0]!);
    return parts.length >= 2 && words[0] === parts[0] && words[words.length - 1] === parts[parts.length - 1];
  });
}

/**
 * CA_NAME_FROM_CHAT_ENABLED: the roster's own spelling of a whole name, when
 * exactly one person on the actor's roster has it; otherwise null. No roster
 * (a test, the browser, a failed read): null, so nothing is renamed.
 */
export function rosterFullName(candidate: string): string | null {
  const roster = readRoster();
  if (!roster || roster.length === 0) return null;
  const typed = wordsOf(candidate).join(" ");
  if (!typed || typed.split(" ").length < 2) return null;
  // Each entry is one person: two people with the same name are two matches, and neither is chosen.
  const matches = roster.filter((name) => wordsOf(name).join(" ") === typed);
  return matches.length === 1 ? matches[0]! : null;
}

/* ------------------------------------------------------------ the rule -- */

/** True when the guard is on and the candidate is not a person. Off, false for every candidate. */
export function notAPerson(candidate: string | null | undefined): boolean {
  if (!personGuardEnabled() || !candidate?.trim()) return false;
  if (onRoster(candidate)) return false;
  /*
   * OFFERED_NAME_ACCEPTED_ENABLED (port from the sibling app, 12 Nov 2026): the name the manager took with "use <C>"
   * this turn is a person — the app offered it. The request's shape ("CA for <C>, do not terminate yet, …" reads "<C>,"
   * as a list item) never rules it out again.
   */
  if (offeredNameAcceptedEnabled() && isAcceptedOffRoster(candidate)) return false;
  // FORM_NAME_FROM_ROSTER_ENABLED, part 2: the message's shape rules it out (`request-slot.ts`).
  if (outsideRequestSlot(candidate)) return true;
  // METRIC_GUARD_ENABLED: a list item or an offense word of the message ("Club Close") is never the card's person, with FORM_NAME off too.
  if (metricGuardEnabled() && namesAMetric(candidate)) return true;
  const words = wordsOf(candidate);
  if (words.length === 0) return false;
  if (words.some((word) => THING_WORDS.has(word))) return true;
  if (PRACTICE_WORDS.has(words[0]!)) return true;
  // COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED: after the roster, so a person whose surname is a metric word still matches.
  if (companyMetric(words)) return true;
  if (words.every((word) => MEASURE_WORDS.has(word) || business(word) || /%$/.test(word))) return true;
  // "Avg <metric>": a measure word with business words or short metric labels only.
  if (words.some((word) => MEASURE_WORDS.has(word)) && words.every((word) => MEASURE_WORDS.has(word) || business(word) || word.length <= 4)) return true;
  return isReportName(candidate) || isNotAName(candidate);
}

/**
 * THE LAST WORD, WHICHEVER READER PUT THE NAME ON THE CARD. A card whose
 * employee is not a person (and is not the team card) loses that name and
 * asks who the form is for — the one place every reader's card passes, so a
 * reader that still lacks the guard cannot put "Practice" on a form.
 */
export function withPersonOnCard<T extends { content: string; formProposal?: CardLike | null }>(answer: T): T {
  const card = answer.formProposal;
  if (!card?.employeeName || card.subject === "team" || !notAPerson(card.employeeName)) return answer;
  const form = card.templateName ?? "form";
  return {
    ...answer,
    content: `Who is this **${form}** for? "${card.employeeName}" isn't a person on your team — tell me the employee's full name, and I'll put it on the card.`,
    formProposal: { ...card, employeeName: null, employeeRole: null, status: "needs_employee", supportsInlineDraft: false },
  };
}

interface CardLike {
  employeeName: string | null;
  employeeRole?: string | null;
  templateName?: string;
  subject?: string;
  status: string;
  supportsInlineDraft?: boolean;
}
