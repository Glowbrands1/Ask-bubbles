import { datesInText } from "./form-date-answer";
import { detectTemplateIntent } from "./template-intent";

/**
 * ============================================================================
 * THE WARNING BEING ISSUED NOW, AND THE WARNINGS ALREADY ON FILE
 * ============================================================================
 *
 * Production, 9 Oct 2026:
 *
 *   "create a ca form for paulyne test, she was late again for 30 mins today.
 *    given verbal warning on 9/21"
 *
 * came back with WRITTEN WARNING ticked. The verbal warning on 9/21 was listed
 * correctly as history, and that history — plus "again" — was then read as
 * the reason to escalate this form one rung. Nobody said "written".
 *
 * Two readings were at fault, and neither was the prompt's to fix:
 *
 *   THE INTAKE counted ANY "verbal warning" in the manager's words as an answer
 *   to "is this a verbal or written warning?", so a sentence about a PAST
 *   warning closed the one question that would have caught the problem.
 *
 *   THE DRAFT let the model tick Type of Warning, and a model reasoning over a
 *   progression ladder with a prior verbal warning in front of it climbs the
 *   ladder. That is the reasoning the framework asks for when choosing a rung,
 *   and exactly the decision that is not the model's to make on this box.
 *
 * So the level is now read HERE, deterministically, from the manager's words,
 * and only a level the manager stated for THIS form counts. A warning named
 * with a past date, a past-tense verb and a past date, "previous", "prior",
 * "already", "her last …" is history: it belongs on the prior-actions list
 * (`prior-actions.ts`) and says nothing about what is being issued now.
 *
 * WHAT THIS NEVER DOES is infer a level. Not from "again", not from a prior
 * verbal warning, not from a count of incidents. When the manager has not
 * said, the answer is `null`, the box stays empty, and Ask Bubbles asks.
 *
 * Pure and browser-safe, like the intake readers it sits beside.
 */

export const WARNING_TYPE_KEY = "warning_type";

/** The levels a manager can state, by the option key the form stores. */
export type WarningLevel = "verbal" | "written" | "final_warning";

/** Option keys on Type of Warning that are a warning level, not a final action. */
export const WARNING_LEVEL_KEYS: ReadonlySet<string> = new Set<WarningLevel>([
  "verbal",
  "written",
  "final_warning",
]);

export function isWarningLevel(value: unknown): value is WarningLevel {
  return value === "verbal" || value === "written" || value === "final_warning";
}

/** The one key a stated warning level may write — see `applyStatedFacts`. */
export const WARNING_LEVEL_STATED_KEYS: ReadonlySet<string> = new Set([WARNING_TYPE_KEY]);

/** The level in the form's own wording, for chat replies. */
export function warningLevelLabel(level: WarningLevel): string {
  return level === "verbal" ? "Verbal Warning" : level === "written" ? "Written Warning" : "Final Written Warning";
}

/** How one mention of a warning reads in its sentence. */
export type MentionKind = "current" | "historical" | "unclear";

export interface WarningMention {
  readonly level: WarningLevel;
  readonly kind: MentionKind;
  /** Offset of the mention in the text it was read from. */
  readonly index: number;
}

/* ---------------------------------------------------------------- shapes --- */

/**
 * The most a reading looks at: one turn's worth, the bound the chat route
 * already puts on a question. History turns are not bounded by length on
 * their way in, and nothing here needs more than this to decide.
 */
const MAX_TEXT = 4000;

/** A named warning, longest first so "final written warning" is one mention. */
const NAMED = /\b(final\s+written|final|written|verbal)\s+warn(?:ing|ings)?\b/gi;

/** "no, verbal", "actually verbal", "oops i meant verbal" — a correction's lead-in. */
const LEAD_IN = String.raw`(?:(?:actually|no|nope|sorry|oops|wait|correction|ok|okay|so|rather|i\s+meant|i\s+mean|make\s+that)[\s,.:!-]*)*`;

/**
 * The bare adjective, as the level of THIS form — "make it verbal", "should be
 * written", "just verbal". Only after a phrase that sets a level, and only
 * where nothing else follows that would make it an account ("a verbal
 * heads-up", "a written statement").
 */
const BARE_AFTER_CUE =
  /\b(?:make\s+(?:it|this|that)(?:\s+a)?|keep\s+(?:it|this)(?:\s+(?:at|as))?(?:\s+a)?|should\s+(?:have\s+)?be(?:en)?(?:\s+a)?|needs?\s+to\s+be(?:\s+a)?|it'?s(?:\s+a)?|it\s+is(?:\s+a)?|this\s+is(?:\s+a)?|go(?:ing)?\s+with(?:\s+a)?|just(?:\s+a)?|only(?:\s+a)?|mark\s+(?:it\s+)?as(?:\s+a)?|tick|check|select|meant|mean)\s+(verbal|written)\b(?=\s*(?:$|[.,;!?\n)]|one\b|please\b|instead\b|not\b|this\s+time\b|for\s+(?:this|today|now)\b|rather\b|then\b|thanks?\b))/gi;

/**
 * "change written warning to verbal", "set the warning type to verbal",
 * "change paulyne's warning to verbal for paulyne" — the new level after a
 * change verb, whatever follows it. The level being replaced is dropped by
 * `REPLACED`.
 */
const BARE_CHANGED_TO =
  /\b(?:change|changed|switch|switched|set|move|update|correct)\b[^.;!?\n]{0,40}?\s(?:to|into|as)\s+(?:a\s+)?(verbal|written)\b(?!\s+(?:warning\s+)?or\b)/gi;

/**
 * A whole line that is only the level — "verbal", "5. written", "Verbal
 * warning.", "no, verbal", "verbal not written". Written without adjacent
 * optional whitespace runs, so a long line cannot make it backtrack.
 */
const WHOLE_LINE = new RegExp(
  String.raw`^\s*(?:\d+\s*[.):-]\s*)?${LEAD_IN}(?:(?:type\s+of\s+)?warning(?:\s*(?:level|type))?\s*[:=-]\s*)?(?:(?:it'?s|it\s+is|make\s+it|just|only)\s+)?(?:a\s+)?(final\s+written|verbal|written)(?:\s+warning)?(?:\s+(?:one|please))?(?:[\s,]+not\s+(?:a\s+)?(?:verbal|written)(?:\s+warning)?)?[\s.!]*$`,
  "i",
);

/** "warning level: written", "type of warning - verbal". */
const LABELLED =
  /\b(?:type\s+of\s+warning|warning\s*(?:level|type))\s*(?:is|should\s+be|[:=-])\s*(?:a\s+)?(final\s+written|verbal|written)\b/gi;

/* ------------------------------------------------------------------ cues --- */

/*
 * A LEVEL IS THIS FORM'S ONLY WHERE SOMETHING SAYS SO. A warning named with
 * no cue either way — "she has a written warning from august", a list under
 * "Prior actions:", "verbal warning didn't help" — is not read as this form's
 * level: it is unclear, and the manager is asked. Defaulting the other way is
 * how history became a level in the first place.
 */

/** It already happened, whatever date follows — anywhere in the few words before. */
const HISTORY_CUE =
  /\b(?:previous(?:ly)?|prior|already|has\s+had|have\s+had|had\s+had|had(?!\s+to\b)|history\s+of|on\s+file|in\s+the\s+past)\b/gi;

/**
 * It already happened — but only RIGHT BEFORE the warning. "her last verbal
 * warning" is history; "late last night, verbal warning" is not, and neither
 * is "late earlier today, written warning".
 */
const ADJACENT_HISTORY =
  /\b(?:last|previous|prior|earlier|past|recent|most\s+recent|after|following|despite|since|from|even\s+with|has|had|have|is\s+on|was\s+on|'s\s+on|been\s+on|still\s+on|already\s+on|been\s+(?:getting|given|receiving|issued)|(?:first|last|previous|that|one)\s+was)\s+(?:(?:a|an|the|her|his|their|that|this|another)\s+)?(?:(?:last|previous|prior|recent|earlier|formal|documented)\s+)?$/i;

/** "Prior actions: …", "history - …", "steps so far: …" — a list of what already happened. */
const HISTORY_HEADING =
  /\b(?:(?:prior|previous|past|earlier)\s+(?:actions?|warnings?|discipline|disciplinary(?:\s+actions?)?|corrective\s+actions?|steps|history|write[- ]?ups?)|history|steps\s+so\s+far|so\s+far|on\s+file)\s*(?:[:\-–—]|includes?\b)/i;

/** It happened — this form, or an earlier one; the time beside it decides. */
const PAST_CUE =
  /\b(?:gave|given|got|gotten|received|receiving|issued|was\s+given|were\s+given|been\s+given|wrote)\b/gi;

/**
 * A level being set for THIS form, RIGHT BEFORE the warning — "give her a
 * written warning on 10/2" is this form even though a date follows.
 */
const ADJACENT_CURRENT =
  /\b(?:give|giving|issue|issuing|create|creating|write|writing|make|making|do|doing|document|documenting|prepare|draft|file|filing|start|need|needs|want|wants|(?:this|it|that)(?:\s+one)?\s+(?:is|will\s+be|should\s+be|would\s+be|needs\s+to\s+be)|it'?s|should\s+be|will\s+be|would\s+be|to\s+be|go\s+with|going\s+with|keep|use|current|new|another|second|third|today'?s|put\s+(?:her|him|them)\s+on|get|gets|getting|receive|receives|(?:will|'ll|is|'s|are|'re)\s+(?:be\s+)?(?:getting|receiving|get|receive))\s+(?:(?:her|him|them|it|this)\s+)?(?:(?:a|an|the|as|to|at)\s+)?(?:(?:formal|official|documented|new|second|third|another|final)\s+)?$/i;

/** "change written warning to verbal warning" — the new level, after the change. */
const CHANGED_TO =
  /\b(?:change|changed|switch|switched|set|move|update|correct|make)\b[^.;!?\n]{0,40}?\s(?:to|into|as)\s+(?:(?:a|an)\s+)?$/i;

/** The turn opens with the level: "Verbal warning for Sarah", "actually, written warning". */
const OPENING = new RegExp(String.raw`^\s*${LEAD_IN}(?:please\s+)?(?:(?:a|an|new)\s+)?$`, "i");

/** "give her", "issue him" — the pronoun is the recipient, not a possessive. */
const RECIPIENT = /\b(?:give|giving|issue|issuing|gave|given)\s+(?:her|him|them)\s+$/i;

/** "her verbal warning", "his last written warning" — one already on file. */
const POSSESSIVE = /\b(?:her|his|their)\s+(?:(?:last|previous|prior|recent|earlier|first|1st|most\s+recent)\s+)?$/i;

/** "not a written warning", "instead of written", "untick written". */
const NEGATED =
  /\b(?:not|no|never|don'?t|didn'?t|doesn'?t|isn'?t|wasn'?t|instead\s+of|rather\s+than|un-?tick|un-?check|uncheck|remove|clear|take\s+off|drop)\s+(?:(?:a|an|the|it|this)\s+)?(?:(?:to|as|at)\s+)?(?:a\s+)?$/i;

/** "written warning to verbal" — the level being replaced, not the new one. */
const REPLACED = /^\s*(?:warning\s+)?(?:to|into|→|->)\s+(?:a\s+)?(?:final\s+written|verbal|written)\b/i;

/** "verbal or written", "written or verbal warning" — undecided. */
const ALTERNATIVE_AFTER = /^\s*(?:warning\s+)?(?:or|\/)\s+(?:a\s+)?(?:final\s+written|verbal|written)\b/i;
const ALTERNATIVE_BEFORE = /\b(?:verbal|written)(?:\s+warning)?\s+(?:or|\/)\s+(?:a\s+)?$/i;

/** A time phrase right after the mention that places it before today. */
const EARLIER_AFTER =
  /^[^.;!?\n]{0,30}?\b(?:last\s+(?:week|month|year|time|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|ago|yesterday|previously|before|already|recently|back\s+(?:in|on|then)|on\s+file|on\s+record|earlier\s+this\s+(?:week|month|year)|in\s+the\s+past|the\s+other\s+day|a\s+while\s+back|(?:in|from|since)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\b/i;

/** A time phrase right after the mention that places it today. */
const TODAY_AFTER = /^[^.;!?\n]{0,30}?\b(?:today|this\s+(?:morning|afternoon|evening)|tonight|just\s+now|right\s+now|now)\b/i;

function levelOf(word: string): WarningLevel {
  const w = word.toLowerCase().replace(/\s+/g, " ");
  if (w.startsWith("final")) return "final_warning";
  return w === "verbal" ? "verbal" : "written";
}

/** The sentence a mention sits in: from the last break before it to the next. */
function clauseAround(
  text: string,
  start: number,
  end: number,
): { before: string; after: string; question: boolean; opensTurn: boolean } {
  const head = text.slice(0, start);
  const breakAt = Math.max(...[".", ";", "!", "?", "\n"].map((mark) => head.lastIndexOf(mark)));
  // A date like 9/21 has no break characters; a decimal "2.5" does, and is rare in these notes.
  // Only the last stretch before the mention is ever tested, so a long clause costs nothing.
  const before = head.slice(Math.max(breakAt + 1, start - 160));
  const tail = text.slice(end, end + 160);
  const stop = tail.search(/[.;!?\n]/);
  const after = stop === -1 ? tail : tail.slice(0, stop);
  const question = stop !== -1 && tail[stop] === "?";
  return { before, after, question, opensTurn: breakAt === -1 && start <= 160 };
}

/** The history or past-tense cue nearest the end of `before`, within a few words. */
function nearestCue(before: string): "history" | "past" | null {
  const window = before.slice(-48);
  let best: { end: number; kind: "history" | "past" } | null = null;
  const consider = (pattern: RegExp, kind: "history" | "past") => {
    for (const match of window.matchAll(pattern)) {
      const end = match.index + match[0].length;
      if (!best || end >= best.end) best = { end, kind };
    }
  };
  // On a tie at the same offset, history wins.
  consider(PAST_CUE, "past");
  consider(HISTORY_CUE, "history");
  return (best as { kind: "history" | "past" } | null)?.kind ?? null;
}

/**
 * When the clause places the mention in time: before today, today, on another
 * day ("other" — a date after today, which beside a warning already named is
 * a year the manager left off: "12/20" read in January), or not at all.
 */
function timing(after: string, today: string): "earlier" | "today" | "other" | null {
  const window = after.slice(0, 40);
  const dated = datesInText(window, today)[0];
  if (dated && dated.index <= 30) return dated.iso < today ? "earlier" : dated.iso === today ? "today" : "other";
  if (EARLIER_AFTER.test(after)) return "earlier";
  if (TODAY_AFTER.test(after)) return "today";
  return null;
}

function classify(text: string, start: number, end: number, today: string, cued: boolean): MentionKind | null {
  const { before, after, question, opensTurn } = clauseAround(text, start, end);
  // A question about a level decides nothing: "should this be a written warning?"
  if (question) return "unclear";
  if (NEGATED.test(before)) return null;
  if (REPLACED.test(after)) return null;
  if (ALTERNATIVE_AFTER.test(after) || ALTERNATIVE_BEFORE.test(before)) return "unclear";
  // "Prior actions: verbal warning, written warning" — a list of what already happened.
  if (HISTORY_HEADING.test(before)) return "historical";
  // A bare adjective was only matched after a phrase that sets this form's level.
  if (cued) return "current";

  const when = timing(after, today);
  if (RECIPIENT.test(before)) {
    // "gave her a verbal warning" is a past act; "give her a verbal warning" is this form.
    if (/\b(?:gave|given)\s+\S+\s+$/i.test(before)) {
      return when === "today" ? "current" : when === null ? "unclear" : "historical";
    }
    return "current";
  }
  if (POSSESSIVE.test(before) || ADJACENT_HISTORY.test(before)) return "historical";
  if (ADJACENT_CURRENT.test(before) || CHANGED_TO.test(before)) return "current";
  // Dated on another day, by a date or a time phrase in its own clause: history.
  if (when === "earlier" || when === "other") return "historical";

  const cue = nearestCue(before);
  if (cue === "history") return "historical";
  // A past act today is the one being documented; on no stated day it is asked about.
  if (cue === "past") return when === "today" ? "current" : "unclear";
  // "Verbal warning for Sarah Test" — the turn opens by naming this form's
  // level, as a request: followed by who it is for, today, a pause, or nothing.
  // "Written warning wasn't enough" opens the same way and is an account.
  if (opensTurn && OPENING.test(before) && /^\s*(?:for\b|[-—–,:]|$|today\b|this\s+time\b|please\b)/.test(after)) return "current";
  // Nothing says whether this is the warning being issued now: ask.
  return "unclear";
}

/**
 * Every warning level the text names, in order, with how each one reads.
 *
 * `today` is the business day (`YYYY-MM-DD`): a warning dated before it is
 * history, one dated today is the form being written.
 */
export function warningMentions(text: string, today: string): WarningMention[] {
  const source = (text ?? "").slice(0, MAX_TEXT).replace(/[’‘]/g, "'");
  const found: WarningMention[] = [];
  const seen = new Set<number>();

  const push = (level: WarningLevel, start: number, end: number, cued: boolean, kind?: MentionKind) => {
    if (seen.has(start)) return;
    seen.add(start);
    const read = kind ?? classify(source, start, end, today, cued);
    if (read) found.push({ level, kind: read, index: start });
  };

  for (const match of source.matchAll(LABELLED)) {
    const start = match.index + match[0].length - match[1]!.length;
    push(levelOf(match[1]!), start, match.index + match[0].length, true);
  }

  /*
   * WHOLE-LINE ANSWERS. One is an answer ("5. verbal"); two in one turn are a
   * list, and a list is not a decision ("1. verbal warning\n2. written
   * warning"). Lines under a "Prior actions:" heading are history.
   */
  const wholeLines: { level: WarningLevel; start: number; end: number; underHeading: boolean }[] = [];
  let offset = 0;
  let underHeading = false;
  for (const line of source.split("\n")) {
    const whole = WHOLE_LINE.exec(line);
    if (whole) {
      const start = offset + line.toLowerCase().indexOf(whole[1]!.toLowerCase());
      wholeLines.push({ level: levelOf(whole[1]!), start, end: offset + line.length, underHeading });
    } else if (HISTORY_HEADING.test(line) && /[:\-–—]\s*$/.test(line)) {
      underHeading = true;
    } else if (line.trim() !== "" && !/^\s*(?:[-*•]|\d+\s*[.)])/.test(line)) {
      underHeading = false;
    }
    offset += line.length + 1;
  }
  for (const entry of wholeLines) {
    const kind: MentionKind | undefined = entry.underHeading
      ? "historical"
      : wholeLines.length > 1
        ? "unclear"
        : undefined;
    push(entry.level, entry.start, entry.end, true, kind);
  }

  for (const pattern of [BARE_CHANGED_TO, BARE_AFTER_CUE]) {
    for (const match of source.matchAll(pattern)) {
      const start = match.index + match[0].length - match[1]!.length;
      push(levelOf(match[1]!), start, match.index + match[0].length, true);
    }
  }
  for (const match of source.matchAll(NAMED)) {
    // "verbal warnings" is a pattern of past ones; this form issues one.
    const plural = /warnings$/i.test(match[0]);
    push(levelOf(match[1]!), match.index, match.index + match[0].length, false, plural ? "historical" : undefined);
  }

  return found.sort((a, b) => a.index - b.index);
}

/**
 * The level the manager stated for THIS form, or null when they have not.
 *
 * The LAST current statement wins, so "written warning — actually make it
 * verbal" is verbal. History is never a statement about this form, and an
 * unclear mention ("I gave her a verbal warning", no date) is not one either:
 * the manager is asked rather than guessed for.
 */
export function statedWarningLevel(text: string, today: string): WarningLevel | null {
  const current = warningMentions(text, today).filter((mention) => mention.kind === "current");
  return current.length > 0 ? current[current.length - 1]!.level : null;
}

/** Whether the text names a warning at all that was NOT read as this form's level. */
export function mentionsEarlierWarning(text: string, today: string): boolean {
  return warningMentions(text, today).some((mention) => mention.kind !== "current");
}

/**
 * The level stated across a conversation's manager turns, latest turn last.
 *
 * Each turn is read on its own, so a sentence in one turn cannot lend its
 * cue to a mention in the next. A one-word reply to the verbal-or-written
 * question ("verbal", "written please") is a whole-line answer and reads as
 * this form's level wherever it appears.
 */
export function warningLevelFromTurns(turns: readonly string[], today: string): WarningLevel | null {
  let level: WarningLevel | null = null;
  for (const turn of turns) level = statedWarningLevel(turn, today) ?? level;
  return level;
}

export interface WarningConversationTurn {
  role: string;
  content: string;
  error?: unknown;
}

/**
 * The level the conversation stated for the form being proposed, or null.
 *
 * ONLY THIS FORM'S TURNS, by the rule `payrollDeductFromConversation` uses:
 * the look-back starts after the last manager turn that asked for a DIFFERENT
 * form request, so "written warning" said about somebody else's Corrective
 * Action earlier in the same chat is not carried onto this one. Assistant
 * turns never answer.
 */
export function warningLevelFromConversation(
  turns: readonly WarningConversationTurn[],
  today: string,
): WarningLevel | null {
  const usable = turns.filter(
    (turn) => !turn.error && typeof turn.content === "string" && turn.content.trim() !== "",
  );
  const requests = usable
    .map((turn, index) => ({ turn, index }))
    .filter(({ turn }) => turn.role === "user" && detectTemplateIntent(turn.content).kind !== "none")
    .map(({ index }) => index);
  const start = requests.length >= 2 ? requests[requests.length - 2]! + 1 : 0;
  return warningLevelFromTurns(
    usable
      .slice(start)
      .filter((turn) => turn.role === "user")
      .map((turn) => turn.content),
    today,
  );
}

/**
 * ============================================================================
 * THE TYPE OF WARNING BOX, AS IT MAY BE STORED
 * ============================================================================
 *
 * The model's ticks on the warning levels are discarded, always: a level is
 * the manager's decision, and the manager's words are what set it. What the
 * model may still have ticked on this group — Termination, Demotion — is
 * refused separately by `refuseSensitiveSelections`, before this runs.
 *
 * Returns the checked map with the warning-level options taken out of
 * `groupKey`, and the level the manager stated (if the version offers it) for
 * the caller to write as the manager's statement.
 */
export function withoutModelWarningLevel(
  checked: Record<string, string[]>,
  groupKey: string = WARNING_TYPE_KEY,
): { checked: Record<string, string[]>; dropped: string[] } {
  const selected = checked[groupKey];
  if (!Array.isArray(selected)) return { checked, dropped: [] };
  const kept = selected.filter((option) => !WARNING_LEVEL_KEYS.has(option));
  const dropped = selected.filter((option) => WARNING_LEVEL_KEYS.has(option));
  const next = { ...checked };
  if (kept.length > 0) next[groupKey] = kept;
  else delete next[groupKey];
  return { checked: next, dropped };
}

/** The stored value for a stated level: one ticked box, only one the version offers. */
export function warningLevelChecked(
  level: WarningLevel | null | undefined,
  offered: readonly string[],
  groupKey: string = WARNING_TYPE_KEY,
): Record<string, string[]> {
  return level && offered.includes(level) ? { [groupKey]: [level] } : {};
}

/**
 * ============================================================================
 * "CHANGE WRITTEN WARNING TO VERBAL" — A CORRECTION TO A CREATED FORM
 * ============================================================================
 *
 * The correction flow calls this on every turn once a form with a Type of
 * Warning exists in the conversation, so it is narrow on purpose. A turn
 * corrects the level only when it is SHAPED like a correction — a change
 * verb ("change", "switch", "set", "make it", "should be", "tick"), a
 * correction's lead-in ("actually", "no", "oops"), or the level as the whole
 * reply ("verbal") — AND states a level for this form.
 *
 * Not a correction: a question, history ("she also has a written warning from
 * August"), an undecided "verbal or written", and another person's incident
 * ("jordan was late today, give him a verbal warning") — that last one is a
 * new request, and the ordinary flow proposes a form for it.
 */
const CORRECTION_SHAPED =
  /\b(?:change|changed|switch|switched|set|update|correct|fix|make\s+(?:it|this|that)|should\s+(?:have\s+)?be(?:en)?|needs?\s+to\s+be|un-?tick|un-?check|uncheck|tick|check|mark|select|meant|instead)\b|^\s*(?:actually|no|nope|sorry|oops|wait|correction)\b/i;

export function warningLevelCorrection(text: string, today: string): WarningLevel | null {
  const trimmed = (text ?? "").trim();
  if (trimmed === "" || trimmed.endsWith("?")) return null;
  const wholeAnswer = !trimmed.includes("\n") && (WHOLE_LINE.test(trimmed) || LABELLED.test(trimmed));
  LABELLED.lastIndex = 0;
  if (!wholeAnswer && !CORRECTION_SHAPED.test(trimmed)) return null;
  return statedWarningLevel(trimmed, today);
}

/** The question Ask Bubbles asks when the level has not been stated. */
export const WARNING_LEVEL_QUESTION =
  "Is this new corrective action a **Verbal Warning** or a **Written Warning**?";
