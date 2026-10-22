import { explicitFormDate, heldCoachingDates, listFormDates, listIncidentDates } from "./form-date-answer";

/**
 * ============================================================================
 * SEVERAL INCIDENT DATES ARE A QUESTION, NOT "WHICHEVER CAME FIRST"
 * ============================================================================
 *
 * Admin feedback, 16 Oct 2026: "She was late on 10/5 and 10/15" dated the
 * Corrective Action 10/5 — the FIRST date in the message, which for a repeated
 * behaviour is the earlier incident, not the one the document is written about.
 * `extractFormDate` takes the first date that is not a follow-up or an earlier
 * step, which is right when there is one and arbitrary when there are two.
 *
 * Three different dates can be on a conversation, and they are not the same
 * thing:
 *
 *   INCIDENT DATES   when it happened — every one belongs in the description.
 *   EARLIER STEPS    "verbally coached on 9/1" — history, never the form's date
 *                    (already excluded by `form-date-answer.ts`).
 *   THE FORM'S DATE  the form's Date line. One date, chosen on purpose: the
 *                    manager's choice, or — until they choose — the day the
 *                    form is created (today), never a guess among incidents.
 *
 * With ONE incident date the form is dated by it, as before. With several, the
 * manager is asked once which date goes on the form; the incidents stay in the
 * written description either way. Pure.
 */

export const DATE_QUESTION_TAG = "Which date goes on the form?";

type Turn = { readonly role: string; readonly content: string };

/**
 * The distinct incident dates in the manager's words, oldest first, none in
 * the future. A date the manager gave the FORM ("dated 10/20") is not one of
 * them — it answers the question this module would otherwise ask.
 */
export function incidentDates(text: string, today: string): string[] {
  const explicit = explicitFormDate(text, today);
  return [...new Set(listIncidentDates(text, today).map((found) => found.iso))]
    .filter((iso) => iso <= today && iso !== explicit)
    .sort();
}

function shown(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function dateQuestion(dates: readonly string[]): string {
  const latest = dates[dates.length - 1]!;
  return `You mentioned more than one date (${dates.map((iso) => `**${shown(iso)}**`).join(", ")}). ${DATE_QUESTION_TAG} Say "most recent" (${shown(latest)}), pick one, or say "today" for the day you create it. Every date stays in the description of what happened — this only sets the form's Date, and until you choose it is dated today.`;
}

export function askedForDate(content: string): boolean {
  return typeof content === "string" && content.includes(DATE_QUESTION_TAG);
}

export function dateAlreadyAsked(history: readonly Turn[]): boolean {
  return history.some((turn) => turn.role === "assistant" && askedForDate(turn.content));
}

/** What a reply to the date question chose: a calendar date, or "today". */
export type DateChoice = { kind: "date"; iso: string } | { kind: "today" };

export function readDateChoice(reply: string, dates: readonly string[], today: string): DateChoice | null {
  const text = (reply ?? "").toLowerCase();
  if (/\?\s*$/.test(text.trim())) return null;
  /*
   * A DATE OF THE INCIDENT, not any date: "she was coached 1-1-26 on the jba
   * manual", typed after the question, is history and answered nothing (QA, 22
   * Oct 2026, round 3 — the form was dated 1/1).
   */
  const typed = listFormDates(reply, today).filter((found) => found.iso <= today);
  if (typed.length > 0) return { kind: "date", iso: typed[typed.length - 1]!.iso };
  if (/\b(?:most recent|latest|newest|last (?:one|date)|second)\b/.test(text)) {
    return { kind: "date", iso: dates[dates.length - 1]! };
  }
  if (/\b(?:first|earliest|oldest)\b/.test(text)) return { kind: "date", iso: dates[0]! };
  if (/\b(?:today|the day (?:i|we) (?:create|file|write)|creation)\b/.test(text)) return { kind: "today" };
  return null;
}

/*
 * ============================================================================
 * "WAIT, THE MEETING WAS 10/19" CORRECTS THE DATE, IT DOES NOT ADD ONE
 * ============================================================================
 *
 * QA, 22 Oct 2026, round 3: "need a CA for tess varga for missing the 10/20/26
 * meeting", then "wait, the meeting was 10/19/26", was asked which of the two
 * dates goes on the form. A turn that corrects the date — said as a correction,
 * with one incident date in it — replaces the earlier one. The latest such
 * turn wins; a turn that merely mentions another date is still asked about.
 */
const CORRECTS_DATE =
  /\b(?:wait|actually|sorry|oops|correction|i\s+meant|i\s+mean|not\s+(?:on\s+)?\d|instead|scratch\s+that|my\s+bad|(?:it|that|the\s+(?:meeting|incident|date|shift|deadline|day))\s+(?:was|is)\s+(?:actually\s+|really\s+)?(?:on\s+)?(?=\d|\w+\s+\d)|happened\s+on|change\s+the\s+date)\b/i;

/* "actually she also missed 10/21" adds an incident; it does not move the first one. */
const ANOTHER_DATE = /\b(?:also|again|too|another|as\s+well|second|both)\b/i;

const NOT_THIS_DATE = /\b(?:not|instead\s+of|rather\s+than|wasn'?t|isn'?t)\s+(?:on\s+|the\s+)?$/i;

export function correctedIncidentDate(turns: readonly string[], today: string): string | null {
  for (let index = turns.length - 1; index > 0; index -= 1) {
    const turn = turns[index]!;
    if (!CORRECTS_DATE.test(turn) || ANOTHER_DATE.test(turn) || /\?\s*$/.test(turn.trim())) continue;
    // "it was 10/16 not 10/15" — the date it was NOT is not a candidate.
    const dates = [
      ...new Set(
        listFormDates(turn, today)
          .filter((found) => !NOT_THIS_DATE.test(turn.slice(Math.max(0, found.index - 16), found.index)))
          .map((found) => found.iso),
      ),
    ].filter((iso) => iso <= today);
    if (dates.length === 1) return dates[0]!;
  }
  return null;
}

/** The manager's answer to an earlier date question, over the whole conversation. */
export function dateAnsweredIn(conversation: readonly Turn[], dates: readonly string[], today: string): DateChoice | null {
  let choice: DateChoice | null = null;
  for (let index = 1; index < conversation.length; index += 1) {
    const turn = conversation[index]!;
    const before = conversation[index - 1]!;
    if (turn.role !== "user" || before.role !== "assistant" || !askedForDate(before.content)) continue;
    choice = readDateChoice(turn.content, dates, today) ?? choice;
  }
  return choice;
}

/** Whether the last turn is a bare answer to a pending date question. */
export function answersDateQuestion(history: readonly Turn[], question: string, dates: readonly string[], today: string): boolean {
  const lastAssistant = [...history].reverse().find((turn) => turn.role === "assistant");
  return !!lastAssistant && askedForDate(lastAssistant.content) && readDateChoice(question, dates.length ? dates : [today], today) !== null;
}

/*
 * ============================================================================
 * WHICH DATE THE FORM CARRIES, BY WHAT EACH DATE MEANS
 * ============================================================================
 *
 * QA, 22 Oct 2026. In order:
 *
 *   1. A date the manager gave the FORM ("dated 10/20") is its Date.
 *   2. On a Coaching Form, the coaching the manager says they HELD ("I coached
 *      her on 10/16") is its Date — when nothing she did is dated after it.
 *      Two such coachings are a question, among them.
 *   3. Several incident dates are a question ("Which date goes on the form?");
 *      until it is answered the form carries no date, so it is dated the day
 *      it is created — never whichever incident was typed first.
 *   4. Otherwise nothing is decided here: one incident date dates the form,
 *      as it always has, and none leaves it to the day it is created.
 *
 * Earlier steps (coaching or warnings already given) are never the form's
 * date — `form-date-answer.ts` keeps them out of every list used here.
 */
const DATED_TEMPLATES: ReadonlySet<string> = new Set(["coaching", "follow-up-coaching", "dpoa", "policy-review"]);
const COACHING_TEMPLATES: ReadonlySet<string> = new Set(["coaching", "follow-up-coaching"]);

export interface FormDateDecision {
  /** Set when this module decides the date; `null` means "the day it is created". Absent: leave it as read. */
  readonly formDate?: string | null;
  /** The dates the manager is choosing among, while the question is open. */
  readonly candidates?: string[];
  /** The question to ask, once. */
  readonly question?: string;
}

export function decideFormDate(input: {
  readonly text: string;
  readonly templateKey: string;
  readonly history: readonly Turn[];
  readonly conversation: readonly Turn[];
  readonly today: string;
}): FormDateDecision {
  if (!DATED_TEMPLATES.has(input.templateKey)) return {};
  const explicit = explicitFormDate(input.text, input.today);
  if (explicit) return { formDate: explicit };

  let dates = incidentDates(input.text, input.today);
  if (COACHING_TEMPLATES.has(input.templateKey)) {
    const latestIncident = dates[dates.length - 1] ?? "";
    const held = heldCoachingDates(input.text, input.today).filter((iso) => iso >= latestIncident);
    if (held.length === 1) return { formDate: held[0]! };
    if (held.length > 1) dates = held;
  }
  if (dates.length <= 1) return {};

  /* "wait, the meeting was 10/19/26" replaces the earlier date — see `correctedIncidentDate`. */
  const corrected = correctedIncidentDate(
    input.conversation.filter((turn) => turn.role === "user").map((turn) => turn.content),
    input.today,
  );
  if (corrected && dates.includes(corrected)) return { formDate: corrected };

  const choice = dateAnsweredIn(input.conversation, dates, input.today);
  if (choice) return { formDate: choice.kind === "date" ? choice.iso : null };
  return {
    formDate: null,
    candidates: dates,
    ...(dateAlreadyAsked(input.history) ? {} : { question: dateQuestion(dates) }),
  };
}
