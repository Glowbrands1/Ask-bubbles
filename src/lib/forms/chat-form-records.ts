import "server-only";

import { promptLabel } from "@/lib/ai/prompts";
import { ACTIVE_BRAND } from "@/lib/brand";
import { businessToday } from "@/lib/business-date";
import { formRecordsNoJudgementEnabled, formsOnFileCountsEnabled, formsOnFileOrderMatchPossibleEnabled, priorRecordFinalOnlyEnabled } from "@/lib/config/chat-quality-flags";
import { countFormsOnFile, type FormCounts } from "./forms-on-file-counts";
import { locationById } from "@/lib/locations";
import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import type { AccessScope, Role } from "@/types";

import type { FormsActor } from "./access";
import { foldName } from "./fold-name";
import { FOLLOW_UP_LABEL, followUpState } from "./follow-up";
import { resolveFormsVisibility } from "./forms-visibility";
import { instanceListFilterFor, visibleInstances } from "./instance-scope";
import { listInstances, type InstanceRow } from "./instances";
import { authorizedLocationIds } from "./location-scope";
import { privateAwareLimit } from "./private-creators";

/**
 * ============================================================================
 * "DOES WREN HAVE PREVIOUS COACHINGS?" — ANSWERED FROM THE FORMS REGISTER
 * ============================================================================
 *
 * Asked whether an employee had prior coaching, the assistant said it could not
 * look that up and sent the manager to Forms → Forms Register — the screen
 * holding exactly the answer, read from the same table this app writes. So a
 * question about forms ALREADY ON FILE reads that record and hands the model a
 * FORMS ON FILE block. Ported from the reference platform.
 *
 * THE SAME VISIBILITY AS THE SCREEN, AND NOTHING WIDER. The read goes through
 * `resolveFormsVisibility`, `instanceListFilterFor` and `visibleInstances` —
 * the one rule the Forms Register, its API, the Overview queue and the badge
 * all apply: every store Woven assigns the person (plus a `location` scope's
 * stores), every store for administrators and designated accounts, their own
 * forms elsewhere while their stored scope still covers that store, and exit
 * forms only for roles that may create them. Chat's report scope
 * (`resolveScopeFor`) is deliberately NOT used: it is a different rule.
 *
 * METADATA ONLY. Which form, about whom, at which store, when, and where it
 * stands. Never a field's contents: what a coaching record says belongs in the
 * record, opened by a person, not paraphrased into a chat answer.
 *
 * NAMES ARE MATCHED, NEVER GUESSED. The question's words narrow the query
 * (`employeeNameWords`), and a row counts as NAMED only when every word of its
 * employee name appears in the question. A row matching on a first name alone
 * is listed as a POSSIBLE match, so "is Wren Halvorsen the one you mean?" is
 * the model's to ask rather than this file's to decide.
 */

const NOUN = ACTIVE_BRAND.vocabulary.locationNoun;
const NOUNS = ACTIVE_BRAND.vocabulary.locationNounPlural;

/** What the nav calls the screen these records are read from. */
export const REGISTER_PATH = "Forms → Forms Register";

/* ------------------------------------------------------------------ gate --- */

const FORM_NOUN =
  "(?:coachings?|coaching (?:forms?|records?|notes?|sessions?|files?)|forms?|files?|write[- ]?ups?|corrective(?: actions?)?(?: forms?)?|ca|cas|cafs?|ca forms?|warnings?|documentation|records?|epps?|follow[- ]?ups?|disciplinary|discipline|exit (?:forms?|interviews?))";

/*
 * THE FORM IS ONE THAT ALREADY EXISTS, said in so many words: "previous",
 * "past", "on file", "history", "been written up". These alone may take a turn
 * away from the form-request path — see `asksOnlyAboutFormsOnFile`.
 */
const ON_FILE_PATTERNS: readonly RegExp[] = [
  // "previous coachings", "past CA", "prior write-ups"
  new RegExp(`\\b(?:previous|prior|past|earlier|older|existing|filed|finalized)\\s+${FORM_NOUN}\\b`),
  // "has she been coached", "was he ever written up"
  /\b(?:been|ever|already|previously|before)\s+(?:been\s+)?(?:coached|written up|wrote up|documented|disciplined|warned)\b/,
  /\b(?:coached|written up|documented|disciplined|warned)\s+(?:before|previously|already)\b/,
  // "coaching history", "form history", "disciplinary record"
  /\b(?:coaching|form|forms|write[- ]?up|disciplinary|corrective(?: action)?|performance)\s+(?:history|records?)\b/,
  /\bon file\b/,
  // The screen by either name it carries: the nav's and the page title's.
  /\bforms? register\b/,
  /\bform monitoring\b/,
  new RegExp(`\\bhow many\\s+${FORM_NOUN}\\b`),
];

/*
 * THE WIDER GATE for reading the register: the cues above, plus wording that
 * is about existing forms more often than not — "any open follow-ups", "forms
 * I created", "write-ups for Jordan". "Coaching forms for Avery and Jordan"
 * passes it too, which is why it never decides between a proposal and an
 * answer; it only decides whether an answer gets the register.
 */
const FORM_RECORDS_PATTERNS: readonly RegExp[] = [
  ...ON_FILE_PATTERNS,
  // "any write-ups", "open follow-ups", "recent forms"
  new RegExp(
    `\\b(?:recent|last|any|outstanding|open|pending|draft|drafted|unfinished|overdue)\\s+${FORM_NOUN}\\b`,
  ),
  // "forms I created", "coachings we have done", "forms filed"
  new RegExp(
    `\\b${FORM_NOUN}\\s+(?:(?:i|we|you|they|she|he)\\s+)?(?:have\\s+|has\\s+|had\\s+)?(?:been\\s+)?(?:filed|created|done|completed|submitted|finalized|started|written)\\b`,
  ),
  // "coachings for wren", "write-ups on dana"
  /\b(?:coachings|write[- ]?ups|forms|corrective actions|cas|warnings)\s+(?:for|on|about)\s+\w/,
];

/**
 * Whether this question asks about forms that ALREADY EXIST — as opposed to the
 * templates (the inventory gate) or a new one (the proposal gate). Pure and
 * cheap.
 */
export function isFormRecordsQuestion(question: string): boolean {
  const text = question.toLowerCase().replace(/\s+/g, " ");
  return FORM_RECORDS_PATTERNS.some((pattern) => pattern.test(text));
}

/*
 * MAKING ONE, said in so many words. "Create a CA for Dana, she's been coached
 * before" mentions the history and asks for a form; the form wins. Only
 * explicit making counts — "for Dana" alone does not, because "past CA for
 * Dana" is the very question this file answers, and "draft" only as a verb,
 * because "any draft coachings?" asks about drafts on file.
 */
const ASKS_FOR_A_NEW_FORM =
  /\b(?:create|start|make|generate|prepare|issue|begin|fill (?:out|in)|set up|put together)\b|\bdraft (?:a|an|me|one)\b|\b(?:need|want)\s+(?:a|an|to (?:do|create|start|write|make))\b|\bwrite (?:a|an|her up|him up|them up)\b|\bgive (?:her|him|them) a\b|\bdo a\b/;

/**
 * A question about forms ALREADY on file that does not also ask for a new one.
 *
 * The form-request gate reads "does Dana have a previous CA form?" as naming
 * the Corrective Action Form, and "past corrective action form for Marcus" as
 * asking for one for Marcus — and would answer either with a proposal card for
 * a form nobody asked to create. A question like that is answered from the
 * register instead. A sentence that ALSO says "create" or "write a" keeps the
 * proposal.
 */
const PREVIOUS_RECORD = /\b(?:previous|prior|past)\b/i;
const ASKS_FOR_DRAFTS = /\b(?:draft|drafted)\b/i;

/**
 * A previous, prior, or past coaching question, or a question that asks
 * about drafts, lists drafts apart from the record when the flag is on.
 * The flag off returns false and the labelled list is unchanged.
 */
export function separateDraftsAsNotOnFile(question: string): boolean {
  if (!priorRecordFinalOnlyEnabled()) return false;
  return PREVIOUS_RECORD.test(question) || ASKS_FOR_DRAFTS.test(question);
}

export function splitRecordDrafts<T extends { status: string }>(
  question: string,
  rows: readonly T[],
): { onFile: T[]; notOnFile: T[] } {
  if (!separateDraftsAsNotOnFile(question)) return { onFile: [...rows], notOnFile: [] };
  return {
    onFile: rows.filter((row) => row.status !== "draft"),
    notOnFile: rows.filter((row) => row.status === "draft"),
  };
}

export function asksOnlyAboutFormsOnFile(question: string): boolean {
  const text = question.toLowerCase().replace(/\s+/g, " ");
  if (!ON_FILE_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return !ASKS_FOR_A_NEW_FORM.test(text);
}

/* ----------------------------------------------------------------- names --- */

/*
 * Words that are never part of a person's name in these questions. Kept broad
 * on purpose: a missed stop word costs a wider query that the scoring below
 * then discards, while a person's name in this list could never be matched.
 */
const STOP_WORDS = new Set(
  (
    "a about after again all also am an and any anyone anything are as at be been before being " +
    "both but by can check could did do does doing done during each employee employees ever for " +
    "from had has have having he her here hers him his how i if in into is it its just last let " +
    "like look me mine more most my need no not now of on once only or other our out over own " +
    "please previous previously prior past earlier older existing recent recently same see she " +
    "should show so some still such tell than that the their them then there these they this " +
    "those through to too under until up very was we were what when where which while who whom " +
    "why will with would you your yours already currently today yesterday week weeks month " +
    "months year years ago time times new open opened pending draft drafted unfinished overdue " +
    "finalized filed outstanding coach coached coaching coachings form forms record records " +
    "note notes session sessions write writeup writeups written wrote documentation documented " +
    "corrective action actions warning warnings disciplinary discipline disciplined epp epps " +
    "exit interview interviews follow followup followups history file monitoring many much " +
    "created create completed submitted started team member members staff store stores location " +
    "locations manager managers director assistant associate associates supervisor register " +
    "bubbles ask know find list give get got people person performance plan plans has hasnt " +
    "havent doesnt didnt isnt wasnt dont ca cas caf cafs files ups"
  ).split(" "),
);

/** The words of a question that could be part of somebody's name. */
export function candidateNameWords(text: string): string[] {
  // Port from the sibling app's #1141: names folded (`foldName`), so "Ramírez" is one word, "ramirez", never "ram rez".
  const words = foldName(text)
    .toLowerCase()
    .replace(/'s\b/g, "")
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
  return [...new Set(words)].slice(0, 8);
}

function nameWords(name: string): string[] {
  return foldName(name).toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 2);
}

/**
 * The pieces an accented name used to split into ("ramírez" → "ram", "rez"), for the Forms Register READ only: the read
 * matches name words inside the stored name (`ilike`, letters a–z), so a question typed with the accent still reads a form
 * whose name is stored with it. Matching is on the folded words. Empty when the text has no accent.
 */
function accentedNamePieces(text: string): string[] {
  if (foldName(text) === text.replace(/[‘’ʼ`´]/g, "'")) return [];
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
}

export interface NameMatches {
  /** Every word of the employee's name appears in the question. */
  named: InstanceRow[];
  /** Part of the name appears — a first name alone, usually. */
  possible: InstanceRow[];
}

/** The name's words come in the order the question has them ("wren tallis" in "… wren tallis"). */
function inAskedOrder(parts: readonly string[], words: readonly string[], question?: string): boolean {
  const at = parts.map((part) => words.indexOf(part));
  if (at.every((index, position) => position === 0 || index > at[position - 1]!)) return true;
  // R795F (QA, 12 Nov 2026): "CA for Calder, Remy" is the name written "Last, First" — the asked order, not a reversal.
  return question !== undefined && writtenLastCommaFirst(parts, question);
}

/** The question writes this name as "Last, First" (the surname, a comma, then the given name or names). */
function writtenLastCommaFirst(parts: readonly string[], question: string): boolean {
  if (parts.length < 2) return false;
  const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const last = escape(parts[parts.length - 1]!);
  const given = parts.slice(0, -1).map(escape).join(String.raw`\s+`);
  return new RegExp(String.raw`(?<![a-z])${last}\s*,\s*${given}(?![a-z])`, "i").test(question);
}

/** Splits rows by how fully the question names their employee. Pure. */
export function matchRowsToQuestion(
  rows: readonly InstanceRow[],
  words: readonly string[],
  question?: string,
): NameMatches {
  const asked = new Set(words);
  const named: InstanceRow[] = [];
  const possible: InstanceRow[] = [];
  for (const row of rows) {
    const parts = nameWords(row.employeeName);
    if (parts.length === 0) continue;
    const hits = parts.filter((part) => asked.has(part)).length;
    // FORMS_ON_FILE_ORDER_MATCH_POSSIBLE_ENABLED: "Tallis Wren" for "Wren Tallis" is possibly them, never named.
    if (hits === parts.length && !(formsOnFileOrderMatchPossibleEnabled() && !inAskedOrder(parts, words, question))) named.push(row);
    else if (hits > 0) possible.push(row);
  }
  return { named, possible };
}

/* ------------------------------------------------------- dates and kinds --- */

/*
 * "WHO GOT A CA THIS MONTH?" — EVERY FORM IN THE RANGE, NOT THE NEWEST 20
 * (the owner, 18 Nov 2026, on this app's Leadership Assistant: "why capped at 20"). A question that named
 * nobody read the 20 newest forms of every kind and left the model to pick November's corrective actions out of
 * them; in a busy month the 20 ended before the 1st. A range or a kind of form now narrows the QUERY (form date,
 * form name), as the name words already do, and the list says whether it is every such form or stopped at its cap.
 */

/** A span of form dates, inclusive, as YYYY-MM-DD, and how to say it. */
export interface FormDateRange {
  from: string;
  to: string;
  label: string;
}

/** A kind of form the question asks about, as words of the form's name. */
export interface FormKind {
  label: string;
  templateNameWords: string[];
  /**
   * Port from the sibling app's #1133 (QA's code audit, item 28): words a form's name must NOT have to be this kind. The read
   * matches templateNameWords as part of the name (`ilike`), so "coaching" also reads the Follow-Up Coaching Form;
   * `ofKind` drops it after the read.
   */
  excludeTemplateNameWords?: string[];
}

/** Only the rows of this kind (a Coaching kind never keeps a Follow-Up Coaching Form). No kind: every row. */
export function ofKind<T extends { templateName: string }>(rows: readonly T[], kind: FormKind | null | undefined): T[] {
  const excluded = kind?.excludeTemplateNameWords ?? [];
  return excluded.length === 0 ? [...rows] : rows.filter((row) => !excluded.some((word) => row.templateName.toLowerCase().includes(word)));
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isoOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dayOf(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1));
}

function addDays(iso: string, days: number): string {
  const date = dayOf(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoOf(date);
}

function monthRange(year: number, monthIndex: number): FormDateRange {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const name = MONTHS[monthIndex]!;
  return {
    from: `${year}-${pad(monthIndex + 1)}-01`,
    to: `${year}-${pad(monthIndex + 1)}-${pad(last)}`,
    label: `${name[0]!.toUpperCase()}${name.slice(1)} ${year}`,
  };
}

function monthIndexOf(word: string): number {
  return MONTHS.findIndex((month) => month.startsWith(word.toLowerCase().slice(0, 3)));
}

/** "11/1", "11/1/26", "2026-11-01" as YYYY-MM-DD, the year defaulting to today's. Null when not a date. */
function parseDay(text: string, today: string): string | null {
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (isoMatch) return `${isoMatch[1]}-${pad(Number(isoMatch[2]))}-${pad(Number(isoMatch[3]))}`;
  const us = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(text.trim());
  if (!us) return null;
  const month = Number(us[1]);
  const day = Number(us[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = us[3] ? (us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3])) : Number(today.slice(0, 4));
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * The span of form dates a question asks about ("this month", "last week", "in October", "since 11/1", "the last
 * 30 days"), or null when it names none. Pure; weeks start on Monday; `today` is the business date.
 */
export function formDateRangeFromQuestion(question: string, today: string): FormDateRange | null {
  const text = question.toLowerCase().replace(/\s+/g, " ");
  const year = Number(today.slice(0, 4));
  const monthIndex = Number(today.slice(5, 7)) - 1;

  if (/\btoday\b/.test(text)) return { from: today, to: today, label: "today" };
  if (/\byesterday\b/.test(text)) {
    const day = addDays(today, -1);
    return { from: day, to: day, label: "yesterday" };
  }
  const lastN = /\b(?:last|past|previous)\s+(\d{1,3})\s+(days?|weeks?|months?)\b/.exec(text);
  if (lastN) {
    const count = Number(lastN[1]);
    const unit = lastN[2]!;
    const days = unit.startsWith("day") ? count : unit.startsWith("week") ? count * 7 : count * 30;
    return { from: addDays(today, -(days - 1)), to: today, label: `the last ${count} ${unit}` };
  }
  const weekday = (dayOf(today).getUTCDay() + 6) % 7; // Monday 0
  if (/\b(?:this|current)\s+week\b/.test(text)) return { from: addDays(today, -weekday), to: today, label: "this week" };
  if (/\b(?:last|past|previous)\s+week\b/.test(text)) {
    const monday = addDays(today, -weekday - 7);
    return { from: monday, to: addDays(monday, 6), label: "last week" };
  }
  if (/\b(?:this|current)\s+month\b|\bmonth to date\b|\bmtd\b/.test(text)) {
    return { ...monthRange(year, monthIndex), to: today, label: `this month (${monthRange(year, monthIndex).label})` };
  }
  if (/\b(?:last|past|previous)\s+month\b/.test(text)) {
    const previous = monthIndex === 0 ? monthRange(year - 1, 11) : monthRange(year, monthIndex - 1);
    return { ...previous, label: `last month (${previous.label})` };
  }
  if (/\b(?:this|current)\s+year\b|\bytd\b|\byear to date\b/.test(text)) return { from: `${year}-01-01`, to: today, label: `this year (${year})` };
  if (/\b(?:last|past|previous)\s+year\b/.test(text)) return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, label: `last year (${year - 1})` };

  const since = /\bsince\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})\b/.exec(text);
  if (since) {
    const from = parseDay(since[1]!, today);
    if (from && from <= today) return { from, to: today, label: `since ${from}` };
  }
  const between = /\b(?:from|between)\s+(\S+)\s+(?:to|and|through|until|-)\s+(\S+)/.exec(text);
  if (between) {
    const from = parseDay(between[1]!, today);
    const to = parseDay(between[2]!.replace(/[?.,!]+$/, ""), today);
    if (from && to && from <= to) return { from, to, label: `${from} to ${to}` };
  }
  // "in October", "for nov", "during September 2026", "october's"; "may" only after in/for/during (it is also a verb).
  const named = new RegExp(`\\b(?:in|for|during|from|of)\\s+${MONTH_RE}\\b(?:\\s+(\\d{4}))?|\\b${MONTH_RE}(?:'s)?\\s+(\\d{4})\\b|\\b${MONTH_RE}['’]s\\b`).exec(text);
  if (named) {
    const word = named[1] ?? named[3] ?? named[5]!;
    const index = monthIndexOf(word);
    const givenYear = named[2] ?? named[4];
    if (index >= 0) {
      // A month later in the year than today, with no year given, is last year's.
      const resolvedYear = givenYear ? Number(givenYear) : index > monthIndex ? year - 1 : year;
      const range = monthRange(resolvedYear, index);
      return range.to > today && range.from <= today ? { ...range, to: today } : range;
    }
  }
  return null;
}

/** An explicit range from a tool's date_from / date_to (YYYY-MM-DD or 11/1), or null. */
export function formDateRangeFromInput(from: unknown, to: unknown, today: string): FormDateRange | null {
  const start = typeof from === "string" && from.trim() ? parseDay(from, today) : null;
  const end = typeof to === "string" && to.trim() ? parseDay(to, today) : null;
  if (!start && !end) return null;
  const range = { from: start ?? "1900-01-01", to: end ?? today };
  if (range.from > range.to) return null;
  return { ...range, label: start && end ? `${range.from} to ${range.to}` : start ? `since ${range.from}` : `up to ${range.to}` };
}

const FORM_KINDS: ReadonlyArray<{ pattern: RegExp; kind: FormKind }> = [
  { pattern: /\b(?:cas?|cafs?|corrective(?: actions?)?|write[- ]?ups?|written up|wrote up|warnings?|disciplinary|discipline)\b/, kind: { label: "Corrective Action form", templateNameWords: ["corrective"] } },
  { pattern: /\b(?:follow[- ]?up coachings?)\b/, kind: { label: "Follow-Up Coaching form", templateNameWords: ["follow"] } },
  { pattern: /\b(?:coach(?:ing|ings|ed)?)\b/, kind: { label: "Coaching form", templateNameWords: ["coaching"], excludeTemplateNameWords: ["follow"] } },
  { pattern: /\b(?:exit(?: forms?| interviews?)?|resignations?|resigned|terminations?|terminated|quit)\b/, kind: { label: "Resignation/Exit form", templateNameWords: ["exit", "resignation"] } },
  { pattern: /\b(?:epps?|performance plans?)\b/, kind: { label: "EPP form", templateNameWords: ["epp"] } },
];

/** The kind of form a question or a tool's `form` input names, or null for every kind. Pure; the first kind named wins. */
export function formKindFromText(text: string | null | undefined): FormKind | null {
  const lower = (text ?? "").toLowerCase().replace(/\s+/g, " ");
  if (!lower) return null;
  let best: { at: number; kind: FormKind } | null = null;
  for (const { pattern, kind } of FORM_KINDS) {
    const match = pattern.exec(lower);
    if (match && (best === null || match.index < best.at)) best = { at: match.index, kind };
  }
  return best?.kind ?? null;
}

/**
 * FORMS_ON_FILE_DATE_RANGE_ENABLED: a question about forms already filed in a period or of a kind that the records
 * gate's wording misses ("who got a CA this month?", "how many coachings last week", "show me October's write-ups").
 * A kind of form, and a period or a who / how many / list ask; never a request to make one ("make a CA for last week").
 */
export function isFormRangeQuestion(question: string, today: string): boolean {
  const text = question.toLowerCase().replace(/\s+/g, " ");
  if (!formKindFromText(text)) return false;
  if (/\b(?:make|create|draft|draw|start|write|do|need|prepare|fill|generate|new)\b(?! (?:on file|filed))/.test(text) && !/\b(?:who|how many|which|list|show)\b/.test(text)) return false;
  return formDateRangeFromQuestion(text, today) !== null || /\b(?:who (?:got|gets|received|had|has|was|were)|how many|which (?:employees|people|team members|staff)|list (?:all|every|the)|show (?:me )?(?:all|every|the))\b/.test(text);
}

/* Words that name a date or a kind of form, never a person ("november", "ca"). */
const RANGE_WORDS = new Set([...MONTHS, "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "mtd", "ytd", "days", "day", "between", "through", "got", "gotten", "received", "had", "resignation", "resignations", "resigned", "termination", "terminations", "terminated", "quit", "follow", "who", "whom"]);

/* ---------------------------------------------------------------- render --- */

export const FORM_RECORDS_HEADING = "FORMS ON FILE (FORMS REGISTER)";

const STATUS_LABEL: Record<InstanceRow["status"], string> = {
  draft: "draft — not finalized",
  finalized: "finalized",
  revised: "revised — replaced by a newer version",
};

/*
 * EVERY LABEL IS SOMETHING A PERSON TYPED — an employee name on a form, a
 * title — so it is reduced to a plain label before it enters the prompt, the
 * same as the user and store names the system prompt carries.
 */
/*
 * CROSS_CHAT_REPLY_GUARD_ENABLED: each row says whether the person asking
 * created it. The register lists every form this user may SEE, and a reply
 * called another manager's draft "the written one you created today"
 * (conv_mvmznap42vcw0dl). Without a viewer the line is unchanged.
 */
const CREATED_BY_RULE =
  'Each row says who created it. Say the manager created a form only when its row says "created by: this user"; a form created by another user was not created by them.';

function createdByPart(row: InstanceRow, viewerId: string | null | undefined): string[] {
  if (!viewerId) return [];
  return [row.createdBy === viewerId ? "created by: this user" : "created by: another user"];
}

function describeRow(row: InstanceRow, today: string, viewerId?: string | null): string {
  const state = followUpState(row, today);
  const role = promptLabel(row.employeeRole);
  const parts = [
    `${row.formDate} — ${promptLabel(row.templateName)}`,
    `employee: ${promptLabel(row.employeeName)}${role ? ` (${role})` : ""}`,
    `${NOUN}: ${promptLabel(row.locationName) || "none recorded"}`,
    `status: ${STATUS_LABEL[row.status]}`,
  ];
  if (row.followUpDate) parts.push(`follow-up date: ${row.followUpDate}`);
  if (state === "open" || state === "overdue" || state === "followed_up") {
    parts.push(`follow-up: ${FOLLOW_UP_LABEL[state]}`);
  }
  if (row.archivedAt) parts.push("archived");
  parts.push(...createdByPart(row, viewerId));
  return `- ${parts.join("; ")}`;
}

/** Which stores the list covers, by the roster's names — never an id. */
function scopeSentence(visibility: AccessScope): string {
  if (visibility.level === "global") {
    return `This list covers every ${NOUN}: this user may see all ${NOUNS}' forms.`;
  }
  const names = authorizedLocationIds(visibility)
    .map((id) => locationById(id)?.name)
    .filter((name): name is string => Boolean(name));
  const covered =
    names.length > 0
      ? `the ${NOUNS} whose forms this user may see in the Forms Register (${names.join(", ")}), and forms they created themselves at a ${NOUN} their assignment still covers`
      : `only forms this user created themselves: no ${NOUN} is assigned to them for the Forms Register`;
  return `This list covers ${covered}. A form filed anywhere else is not visible to them and is not listed — so no match here means none on file that they can see, not none anywhere.`;
}

const RECORDS_RULES = `These are records of forms that exist, read from the Forms Register for this user. Never mark them with a source marker. Only the form name, employee, ${NOUN}, dates and status are shown — you have NOT seen what any form says, so never describe or guess its contents, reasons or wording. A draft is not a completed coaching. Tell the manager they can open any of these in ${REGISTER_PATH}.`;

/*
 * FORM_RECORDS_NO_JUDGEMENT_ENABLED (QA's live test, Ask Bubbles, 8 Nov 2026; PAST_FORMS_BEFORE_LIBRARY on): "are there
 * any coaching forms or corrective actions for <A>?" listed the forms, and added a judgement nobody asked for: "a notable
 * number of Corrective Actions in under two weeks for one person", "worth reviewing … before deciding what comes next".
 * A list of someone's forms is the forms, their dates and their status; never an assessment of the person's record.
 */
export const RECORDS_NO_JUDGEMENT_RULE =
  "List each form with its date and status only. Never assess the person's record: do not call the number of forms notable, high, a pattern or a concern, do not compare their dates, and do not suggest reviewing them or what to do next, unless the manager asks for that assessment in this message.";

/** A sentence that judges the person's record or advises on it, rather than listing a form. */
const JUDGEMENT = /\b(?:notable|significant|concerning|a lot of|quite a few|several .{0,30}in (?:under|less than|just)|in (?:under|less than|just) (?:a|one|two|three|\d+) (?:days?|weeks?|months?)|a pattern|patterns? of|worth (?:reviewing|looking|discussing|noting|considering)|before deciding|what comes next|next step|escalat\w*|consider(?:ing)? (?:a|the) (?:next|further)|may (?:want|wish) to review)\b/i;

/**
 * The reply without its sentences of judgement about the person's record (`RECORDS_NO_JUDGEMENT_RULE`): a line that
 * lists a form is never touched; a sentence that judges or advises is dropped. Pure; the caller decides when the flag
 * applies and that the reply is a records answer.
 */
export function withoutRecordJudgement(reply: string): string {
  return (reply ?? "")
    .split("\n")
    .map((line) => {
      if (/^\s*(?:[-*•]|\d+[.)])\s/.test(line)) return line;
      return line
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !JUDGEMENT.test(sentence))
        .join(" ");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** FORMS_ON_FILE_COUNTS_ENABLED (port from Ask Sunny, f081): the code's counts, for the model to copy. */
function countsSection(counted: { counts: FormCounts; listed: number; of: number; complete: boolean }): string {
  const statuses = (entry: Readonly<Record<string, number>>) => Object.entries(entry).map(([status, count]) => `${status} ${count}`).join(", ");
  const lines = counted.counts.by_person.map((person) =>
    `- ${person.employee}: ${person.total} — ${person.by_form.map((form) => `${form.form} ${form.total} (${form.by_date.map((day) => `${day.date ?? "no date"}: ${day.count}, ${statuses(day.statuses)}`).join("; ")})`).join("; ")}`,
  );
  return [
    `COUNTS (code counted every form the read found: ${counted.counts.total}${counted.complete ? "" : ", the first rows of a read that stopped at its limit"}). Copy these numbers exactly. Never count or add up the rows yourself, and never put one person's forms under another person's name. Mark an archived form "(archived)". Archived drafts are left out unless the question asked for archived forms.`,
    ...lines,
    ...(counted.of > counted.listed ? [`${counted.listed} of these ${counted.of} forms are listed above; say how many are not shown.`] : []),
  ].join("\n");
}

export function renderFormRecordsBlock(input: {
  visibility: AccessScope;
  /** The name words searched for, or empty when the question named nobody. */
  words: readonly string[];
  matches: NameMatches | null;
  recent: readonly InstanceRow[];
  /** Drafts kept out of the previous-coaching list. Empty when the flag is off. */
  notOnFile?: readonly InstanceRow[];
  today: string;
  /** CROSS_CHAT_REPLY_GUARD_ENABLED: the asking user's id, to mark who created each row. */
  viewerId?: string | null;
  /**
   * The form dates and kind the list was read for; `recent` is then every such form, up to `limit`. `cutOff`: the
   * database read came back full, so there may be more, however few rows the visibility and kind filters left.
   */
  narrowed?: NarrowedList | null;
  /**
   * FORMS_ON_FILE_COUNTS_ENABLED: the counts of every form the read found (not only the ones listed), and how many were
   * listed of how many, with whether the read was complete. Absent: as before.
   */
  counted?: { counts: FormCounts; listed: number; of: number; complete: boolean } | null;
}): string {
  const viewerId = input.viewerId ?? null;
  const { words, matches, recent, today } = input;
  const narrowed = input.narrowed && (input.narrowed.range || input.narrowed.kind) ? input.narrowed : null;
  const sections: string[] = [
    FORM_RECORDS_HEADING,
    `${RECORDS_RULES} ${scopeSentence(input.visibility)}${viewerId ? ` ${CREATED_BY_RULE}` : ""}${formRecordsNoJudgementEnabled() ? ` ${RECORDS_NO_JUDGEMENT_RULE}` : ""}`,
  ];

  if (matches) {
    if (matches.named.length > 0) {
      sections.push(
        `Forms naming the person in the question (${matches.named.length}), newest first:\n${matches.named.map((row) => describeRow(row, today, viewerId)).join("\n")}`,
      );
    } else {
      sections.push(
        `No form on file names the person in the question (searched for: ${words.join(", ")}). Say so plainly — there is no coaching or other form on file for them at the ${NOUNS} this user can see.`,
      );
    }
    if (matches.possible.length > 0) {
      sections.push(
        `Possible matches — part of the name matches, so they may be somebody else. Ask before treating them as the same person:\n${matches.possible.map((row) => describeRow(row, today, viewerId)).join("\n")}`,
      );
    }
    if (narrowed) sections.push(narrowedSentence(narrowed, matches.named.length + matches.possible.length));
  } else if (narrowed) {
    sections.push(
      recent.length > 0
        ? `The question names nobody. Every ${narrowedWhat(narrowed, false)} this user can see (${recent.length}), newest first:\n${recent.map((row) => describeRow(row, today, viewerId)).join("\n")}`
        : `No ${narrowedWhat(narrowed)} are on file at the ${NOUNS} this user can see. Say so plainly.`,
    );
    sections.push(narrowedSentence(narrowed, recent.length + (input.notOnFile?.length ?? 0)));
  } else if (recent.length > 0) {
    sections.push(
      `The question names nobody. The ${recent.length} most recent forms this user can see, newest first:\n${recent.map((row) => describeRow(row, today, viewerId)).join("\n")}`,
    );
  } else {
    sections.push(`No forms are on file at the ${NOUNS} this user can see.`);
  }

  if (input.notOnFile && input.notOnFile.length > 0) {
    sections.push(
      `Not on file. These drafts are not previous coaching:\n${input.notOnFile.map((row) => describeRow(row, today, viewerId)).join("\n")}`,
    );
  }

  if (input.counted && input.counted.counts.total > 0) sections.push(countsSection(input.counted));
  return sections.join("\n\n");
}

/** A list read by form date or kind, and whether its read hit the cap. */
interface NarrowedList {
  range: FormDateRange | null;
  kind: FormKind | null;
  limit: number;
  cutOff?: boolean;
}

function narrowedWhat(narrowed: { range: FormDateRange | null; kind: FormKind | null }, plural = true): string {
  const noun = `${narrowed.kind?.label ?? "form"}${plural ? "s" : ""}`;
  return narrowed.range ? `${noun} dated ${narrowed.range.label} (${narrowed.range.from} to ${narrowed.range.to})` : noun;
}

/**
 * Whether the narrowed list is every such form, or stopped at its cap. Port from the sibling app's #1133 (item 29): a list is
 * complete only when the database returned fewer rows than it was asked for; counting the rows left after the
 * visibility filter called a cut-off list complete (100 read, 60 visible, "every such form").
 */
function narrowedSentence(narrowed: NarrowedList, count: number): string {
  return narrowed.cutOff === true || count >= narrowed.limit
    ? `This list stops at ${narrowed.limit} forms, so there may be more ${narrowedWhat(narrowed)}. Say so, and that ${REGISTER_PATH} has the full list.`
    : `This is every ${narrowedWhat(narrowed, false)} this user can see, read by form date — not a sample of recent forms. Never say the list is capped or that older ones may be missing.`;
}

export const FORM_RECORDS_UNAVAILABLE_BLOCK = `${FORM_RECORDS_HEADING}

The Forms Register could not be read for this question. Say you could not check the Forms Register just now and that the manager can look in ${REGISTER_PATH} directly. Never guess whether any form exists.`;

/* ---------------------------------------------------------------- loader --- */

/** The authenticated caller, as this lookup needs it. */
export interface FormRecordsActor {
  subject?: string;
  verified?: boolean;
  role: Role | null;
  scope: AccessScope | null;
}

/**
 * The chat caller as the Forms Register reads under them, or null when they
 * may not read it at all. Fails closed: no verified identity, no read. Throws
 * only when the visibility itself cannot be resolved.
 */
export async function chatFormsActor(actor: FormRecordsActor): Promise<FormsActor | null> {
  if (!actor.verified || !actor.subject || !actor.role || !actor.scope) return null;
  if (!hasPermission(DEFAULT_PERMISSION_MATRIX, actor.role, "view_form_monitoring")) return null;
  const visibility = await resolveFormsVisibility({
    subject: actor.subject,
    role: actor.role,
    scope: actor.scope,
  });
  /*
   * THE STORED SCOPE TRAVELS WITH THE VISIBILITY, as it does for every forms
   * route: `visibleInstances` needs it to keep the reader's own forms at a
   * store their assignment still covers (`ownFormStillInScope`).
   */
  return { id: actor.subject, role: actor.role, verified: true, scope: actor.scope, visibility };
}

const MATCH_LIMIT = 50;
const RECENT_LIMIT = 20;
/** A list read by form date or kind: every such form up to this many, then the list says it stopped. */
export const NARROWED_LIMIT = 100;
/** FORMS_ON_FILE_COUNTS_ENABLED (port from Ask Sunny, f081): a counted read covers up to this many rows (PostgREST's page). */
export const COUNTED_READ_LIMIT = 1000;

/**
 * The FORMS ON FILE block for this turn, or null when this caller may not read
 * the Forms Register at all. Never throws: a failed read becomes a block telling
 * the model to say it could not check, rather than an answer that silently
 * implies nothing is on file.
 *
 * @param previousQuestion The manager's turn before this one, searched for a
 *   name when the question names nobody ("does she have any write-ups?").
 */
export async function loadFormRecords(input: {
  actor: FormRecordsActor;
  question: string;
  previousQuestion?: string | null;
  today?: string;
  /** CROSS_CHAT_REPLY_GUARD_ENABLED: mark which rows the asking user created. */
  markCreator?: boolean;
  /**
   * Read the form dates and kind of form from the question ("CAs this month") and narrow the query to them
   * (FORMS_ON_FILE_DATE_RANGE_ENABLED in chat; always for the Leadership Assistant, which passes `range` / `kind`).
   */
  narrowFromQuestion?: boolean;
  /** An explicit span of form dates (a tool's date_from / date_to); wins over the question's. */
  range?: FormDateRange | null;
  /** An explicit kind of form (a tool's `form`); wins over the question's. */
  kind?: FormKind | null;
}): Promise<{ block: string } | null> {
  const { actor } = input;
  // Fails closed: no verified identity, no read. Chat is live-only, so this is
  // the ordinary state of a signed-in manager.
  if (!actor.verified || !actor.subject || !actor.role || !actor.scope) return null;
  if (!hasPermission(DEFAULT_PERMISSION_MATRIX, actor.role, "view_form_monitoring")) return null;

  const today = input.today ?? businessToday();
  const viewerId = input.markCreator ? actor.subject : null;
  try {
    const formsActor = (await chatFormsActor(actor))!;
    const visibility = formsActor.visibility!;
    const filter = instanceListFilterFor(formsActor);

    const narrowing = input.narrowFromQuestion === true || input.range != null || input.kind != null;
    const range = input.range ?? (input.narrowFromQuestion ? formDateRangeFromQuestion(input.question, today) : null);
    const kind = input.kind ?? (input.narrowFromQuestion ? formKindFromText(input.question) : null);
    const narrowed = range || kind ? { range, kind, limit: NARROWED_LIMIT } : null;
    const counting = formsOnFileCountsEnabled();
    /* FORMS_ON_FILE_COUNTS_ENABLED (port from Ask Sunny, f081): an archived draft is left out unless the question asks for archived forms. */
    const keep = (row: InstanceRow) => !counting || /\barchiv/i.test(input.question) || !(row.archivedAt && row.status === "draft");
    const narrowFilter = {
      ...(range ? { formDateFrom: range.from, formDateTo: range.to } : {}),
      ...(kind ? { templateNameWords: kind.templateNameWords } : {}),
    };
    // A month or "who" is never a person's name in a narrowed question ("CAs in november").
    const nameWordsOf = (text: string) => (narrowing ? candidateNameWords(text).filter((word) => !RANGE_WORDS.has(word)) : candidateNameWords(text));

    let nameSource = input.question;
    let words = nameWordsOf(nameSource);
    if (words.length === 0 && input.previousQuestion && !narrowed) {
      nameSource = input.previousQuestion;
      words = nameWordsOf(nameSource);
    }

    if (words.length > 0) {
      // PRIVATE_CREATOR_FORMS: over-read, then trim to the page; off, the page itself.
      const asked = privateAwareLimit(counting ? COUNTED_READ_LIMIT : MATCH_LIMIT);
      // An accented question also reads the old letter pieces, so a name stored with its accent is still read.
      const readWords = [...new Set([...words, ...accentedNamePieces(nameSource).filter((word) => !narrowing || !RANGE_WORDS.has(word))])];
      const read = await listInstances("all", asked, { ...filter, ...narrowFilter, employeeNameWords: readWords });
      // Item 28: a Coaching kind never keeps a Follow-Up Coaching Form (`ofKind`).
      const found = ofKind(visibleInstances(formsActor, read), kind).filter(keep);
      const split = splitRecordDrafts(input.question, found.slice(0, MATCH_LIMIT));
      const matches = matchRowsToQuestion(split.onFile, words, nameSource);
      const drafts = matchRowsToQuestion(split.notOnFile, words, nameSource);
      const notOnFile = [...drafts.named, ...drafts.possible];
      if (matches.named.length > 0 || matches.possible.length > 0 || notOnFile.length > 0) {
        // Item 29: this read stops at MATCH_LIMIT; a full read is never called every such form.
        const matchNarrowed = narrowed ? { ...narrowed, limit: MATCH_LIMIT, cutOff: read.length >= asked } : null;
        /* FORMS_ON_FILE_COUNTS_ENABLED: the named person's forms counted over every one found, never only the listed ones. */
        const all = counting ? matchRowsToQuestion(found, words, nameSource) : null;
        const counted = all
          ? { counts: countFormsOnFile([...all.named, ...all.possible]), listed: matches.named.length + matches.possible.length + notOnFile.length, of: all.named.length + all.possible.length, complete: read.length < asked }
          : null;
        return { block: renderFormRecordsBlock({ visibility, words, matches, recent: [], notOnFile, today, viewerId, narrowed: matchNarrowed, counted }) };
      }
    }

    if (narrowed && !(words.length > 0 && looksLikeItNamesSomebody(nameSource))) {
      // Archived forms count: "who got a CA this month" asks what was filed, not what is on the active shelf.
      // FORMS_ON_FILE_COUNTS_ENABLED (port from Ask Sunny, f081): archived FINALIZED forms still count; archived drafts are left out.
      const asked = privateAwareLimit(counting ? COUNTED_READ_LIMIT : NARROWED_LIMIT);
      const read = await listInstances("all", asked, { ...filter, ...narrowFilter });
      // Item 28: a Coaching kind never keeps a Follow-Up Coaching Form (`ofKind`).
      const found = ofKind(visibleInstances(formsActor, read), kind).filter(keep);
      const listed = counting
        ? [...found].sort((a, b) => (b.formDate ?? "").localeCompare(a.formDate ?? "") || a.employeeName.localeCompare(b.employeeName)).slice(0, NARROWED_LIMIT)
        : found.slice(0, NARROWED_LIMIT);
      const split = splitRecordDrafts(input.question, listed);
      // Item 29: complete only when the database returned fewer rows than it was asked for.
      const cutOff = read.length >= asked;
      const counted = counting ? { counts: countFormsOnFile(found), listed: listed.length, of: found.length, complete: !cutOff } : null;
      return {
        block: renderFormRecordsBlock({ viewerId, visibility, words, matches: null, recent: split.onFile, notOnFile: split.notOnFile, today, narrowed: { ...narrowed, cutOff }, counted }),
      };
    }

    const recentSplit = splitRecordDrafts(
      input.question,
      visibleInstances(formsActor, await listInstances("active", privateAwareLimit(RECENT_LIMIT), filter)).slice(0, RECENT_LIMIT),
    );
    const recent = recentSplit.onFile;
    /*
     * A question that names somebody nobody on file matches is reported as
     * "no form names them" — with the recent list left out, so the model
     * cannot mistake somebody else's coaching for theirs.
     */
    const named = words.length > 0 && looksLikeItNamesSomebody(nameSource);
    return {
      block: renderFormRecordsBlock({
        viewerId,
        visibility,
        words,
        matches: named ? { named: [], possible: [] } : null,
        recent,
        // A named miss already returned that person's drafts above. The recent
        // list's drafts belong here only when the question named nobody.
        notOnFile: named ? undefined : recentSplit.notOnFile,
        today,
        narrowed: named ? narrowed : null,
      }),
    };
  } catch {
    return { block: FORM_RECORDS_UNAVAILABLE_BLOCK };
  }
}

/**
 * Whether the text itself carries a name-like phrase: two adjacent candidate
 * words ("wren halvorsen"), or a candidate word after "for", "on", "about",
 * "does" or "has". Conservative — when unsure it says no, and the model gets
 * the recent list instead of a false "nothing on file".
 */
function looksLikeItNamesSomebody(text: string): boolean {
  const tokens = foldName(text).toLowerCase().replace(/['’]s\b/g, "").split(/[^a-z]+/).filter(Boolean);
  const candidate = (word: string | undefined) =>
    word !== undefined && word.length >= 2 && !STOP_WORDS.has(word);
  for (let i = 0; i < tokens.length; i += 1) {
    if (candidate(tokens[i]) && candidate(tokens[i + 1])) return true;
    if (["for", "on", "about", "does", "has", "did", "was", "is"].includes(tokens[i]!) && candidate(tokens[i + 1])) {
      return true;
    }
  }
  return false;
}
