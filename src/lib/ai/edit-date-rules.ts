import { datesInText, listIncidentDates, priorSteps } from "@/lib/forms/form-date-answer";
import { withYearlessDatesWritten } from "@/lib/forms/late-open";

/**
 * ============================================================================
 * EDITS ARE APPLIED OR ANSWERED; DATES FOLLOW THE INCIDENT
 * ============================================================================
 *
 * FORM_EDIT_DATE_RULES_ENABLED (QA history replay, 25 Oct 2026; the same
 * mechanism and flag as the sibling app, read on this app's remap path).
 *
 * THREE KINDS OF EDIT, KEPT APART.
 *   replace  "change observation of offense to: <text>" — What happened is
 *            exactly <text>.
 *   add      "add that she was also on her phone", "also add …" — the clause
 *            is appended in the manager's words, and the reply says so
 *            (conv_mvnuh50i2hanl53).
 *   anything else that talks to the app — "can you clean up my grammar",
 *            "change the date to 10-23-26" (conv_mvnsowzl20ljr9m), "can you
 *            reference the late opening policy INSTEAD of the attendance
 *            policy" — never becomes What happened.
 *
 * DATES. A prior action's date ("previous coaching jba manual 11-1-25",
 * "verbal (06/25/2026)", "coached on 9-15") is never the form's Date
 * (conv_mvnsqglc2v7zuyk). The Date is the current incident's, or today when the
 * manager typed "today" (conv_mvnu46n823v1unt). A date the turn sets on purpose
 * ("change the date to 10-23-26") wins.
 */

/* ------------------------------------------------------------------ edits -- */

/** "ok,", "please", "can you", "could you please" before the instruction itself. */
const LEAD = /^\s*(?:(?:ok(?:ay)?|yes|great|thanks|and|also|now|so)\b[,.!]?\s*)*(?:(?:please|pls)\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:(?:please|pls)\s+)?/i;

const OBSERVATION_FIELD = String.raw`(?:the\s+)?(?:observation(?:\s+of\s+(?:the\s+)?offen[cs]e)?|what\s+happened|offen[cs]e\s+description|description(?:\s+of\s+(?:the\s+)?offen[cs]e)?|narrative)`;

const REPLACE = [
  new RegExp(
    String.raw`^(?:change|update|set|edit|make|rewrite|reword)\s+${OBSERVATION_FIELD}\s+(?:to(?:\s+(?:say|read))?|so\s+(?:that\s+)?it\s+(?:says|reads)|as|with|into)\s*[:\-–—]?\s*([\s\S]+)$`,
    "i",
  ),
  new RegExp(String.raw`^replace\s+${OBSERVATION_FIELD}\s+with\s*[:\-–—]?\s*([\s\S]+)$`, "i"),
  new RegExp(String.raw`^${OBSERVATION_FIELD}\s+(?:should|must|needs?\s+to)\s+(?:say|read|be)\s*[:\-–—]?\s*([\s\S]+)$`, "i"),
];

const ADD = [
  new RegExp(String.raw`^(?:also\s+)?add\s+to\s+${OBSERVATION_FIELD}\s*(?:that\b)?\s*[:\-–—]?\s*([\s\S]+)$`, "i"),
  /^(?:also\s+)?add\s+(?:in\s+)?that\s+([\s\S]+)$/i,
  /^(?:also\s+)?add\s*[:\-–—]\s*([\s\S]+)$/i,
  /^also\s+add\s+(?!(?:the|a|an)\s+\S+\s+(?:polic(?:y|ies)|section|date|store|location|title)\b)([\s\S]+)$/i,
];

/** A verb that tells the app to change, cite, remove or redo something. */
const INSTRUCTION = /^(?:change|update|edit|fix|correct|set|switch|replace|swap|reference|cite|use|add|remove|delete|take\s+(?:out|off)|drop|include|put\s+(?!together\b)|clean\s+up|rewrite|reword|redo|re-do|move|make\s+(?:the|it|this|that|her|his|my)\b)/i;

const GRAMMAR = /\b(?:grammar|grammatical(?:ly)?|spelling|spell[- ]?check|capitali[sz]\w*|proof-?read\w*|punctuation)\b/i;

/** The state sentences the intent read writes in front of the question. They are not the manager's. */
const STATE_LINE =
  /^(?:(?:The form is the|The employee is|Job title:|It happened (?:at|on)|Warning level:|Payroll deduct applies|No payroll deduction|Policy reference:|Incident:|Payroll amount:)(?:[^.\n]|\.(?=\d))*\.\s*)+$/;

/** The turn without the intent read's state sentences: what the manager typed. */
export function managerWords(turn: string): string {
  return (turn ?? "")
    .split("\n")
    .filter((line) => !STATE_LINE.test(line.trim()))
    .join("\n")
    .trim();
}

export type EditReading =
  | { readonly kind: "replace"; readonly text: string }
  | { readonly kind: "add"; readonly text: string }
  | { readonly kind: "grammar" }
  | { readonly kind: "instruction" }
  | null;

function stripLead(text: string): string {
  return text.replace(LEAD, "").trim();
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/^["“']|["”']$/g, "").trim();
}

/** A whole turn's edit: replace or add read to the end of the turn, from the line that starts it. */
export function readTurnEdit(turn: string): EditReading {
  const lines = (turn ?? "").split("\n").map((line) => line.trim()).filter((line) => line && !STATE_LINE.test(line));
  for (const [index, line] of lines.entries()) {
    const body = [stripLead(line), ...lines.slice(index + 1)].join(" ");
    for (const pattern of REPLACE) {
      const text = pattern.exec(body)?.[1];
      if (text && clean(text)) return { kind: "replace", text: clean(text) };
    }
    for (const pattern of ADD) {
      const text = pattern.exec(body)?.[1];
      if (text && clean(text)) return { kind: "add", text: clean(text) };
    }
  }
  return null;
}

/** One sentence: a grammar request, another instruction to the app, or null when it is account. */
export function readSentenceEdit(sentence: string): EditReading {
  const text = sentence.trim();
  if (!text) return null;
  if (GRAMMAR.test(text) && /\b(?:clean|fix|correct|check|improve|make|changes?|tidy|help|rewrite|reword|capitali[sz]\w*|proof-?read)\b/i.test(text)) {
    return { kind: "grammar" };
  }
  const body = stripLead(text);
  if (INSTRUCTION.test(body)) return { kind: "instruction" };
  /* "can you edit the form I already finalized for X?" is asked, not described. */
  if (/^(?:can|could|would|will)\s+you\b/i.test(text) && /\?\s*$/.test(text)) return { kind: "instruction" };
  return null;
}

function sentencesOf(turn: string): string[] {
  return turn
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ dates -- */

/** Words that open the earlier steps: "previous coaching", "prior CA", "was coached". */
const PRIOR_CUE =
  /\b(?:previous(?:ly)?|prior|past|earlier)\s+(?:coaching|coached|ca\b|c\/a|corrective|warnings?|actions?|write-?ups?|steps?|discipline|history)|\b(?:was|were|been|got|has\s+been|had\s+been)\s+(?:coached|warned|written\s+up)\b|\bhistory\b/i;
/** The step a date belongs to, straight before the date. */
const STEP_BEFORE =
  /\b(?:verbal|written|final|coaching|coached|ca|c\/a|corrective\s+action|warning|write-?up|manual|acknowledg\w*|review|signed|received|given)\b[^.!?\n\d]{0,12}?(?:\bon\s+|\bdated\s+|\bwas\s+)?\(?\s*$/i;
const COACHED_ON = /\b(?:coached|warned|written\s+up)\b[^.!?\n\d]{0,24}?\bon\s*$/i;
/** "jba manual 11-1-25": the policy manual acknowledgement is always an earlier step. */
const MANUAL_BEFORE = /\b(?:jba\s+(?:policy\s+)?manual|policy\s+manual|manual\s+ack\w*)\b[^.!?\n\d]{0,20}$/i;

/** Every date that belongs to an earlier step the manager listed. */
export function priorActionDates(text: string, today: string): Set<string> {
  const written = withYearlessDatesWritten(text ?? "", today);
  const prior = new Set(priorSteps(written, today).map((step) => step.iso));
  for (const turn of written.split("\n")) {
    const cue = PRIOR_CUE.exec(turn);
    for (const found of datesInText(turn, today)) {
      const before = turn.slice(Math.max(0, found.index - 40), found.index);
      if (COACHED_ON.test(before) || MANUAL_BEFORE.test(before)) prior.add(found.iso);
      else if (cue && found.index > cue.index && STEP_BEFORE.test(before)) prior.add(found.iso);
    }
  }
  return prior;
}

const TODAY_WORD = /\btoday\b/i;
const DATE_CHANGE = /\b(?:change|set|update|make|move|put)\b[^.\n]{0,30}?\bdate\b[^.\n]{0,20}?\bto\s+(?:be\s+)?([^\n]+)$|\b(?:form\s+)?date\s+(?:is|should\s+be|=|:)\s+([^\n]+)$/i;

/** The date this turn sets on purpose: "change the date to 10-22", "the date is today". */
export function dateSetInTurn(question: string, today: string): string | null {
  const match = DATE_CHANGE.exec(withYearlessDatesWritten(question ?? "", today));
  const rest = match?.[1] ?? match?.[2];
  if (!rest) return null;
  if (/^\s*today\b/i.test(rest)) return today;
  return datesInText(rest, today)[0]?.iso ?? null;
}

/**
 * The form's Date under the rules. Undefined leaves the card's own date.
 * A date set on purpose wins; a prior step's date is replaced by the single
 * current incident date, or by today when "today" was typed; with no date on
 * the card those fill it.
 */
export function formDateByRules(input: {
  readonly managerTurns: readonly string[];
  readonly question: string;
  readonly today: string;
  readonly current: string | null;
}): string | null | undefined {
  const set = dateSetInTurn(input.question, input.today);
  if (set) return set === input.current ? undefined : set;
  const text = input.managerTurns.join("\n");
  const prior = priorActionDates(text, input.today);
  const written = withYearlessDatesWritten(text, input.today);
  const incidents = [...new Set(listIncidentDates(written, input.today).map((found) => found.iso))].filter((iso) => !prior.has(iso));
  const fallback = incidents.length === 1 ? incidents[0]! : incidents.length === 0 && TODAY_WORD.test(text) ? input.today : null;
  if (input.current && !prior.has(input.current)) return undefined;
  if (input.current) return fallback;
  return fallback ?? undefined;
}

/** "… INSTEAD of the attendance policy": the policy set aside, taken out before the sections are read. */
const SET_ASIDE_POLICY =
  /\b(?:instead\s+of|rather\s+than|in\s+place\s+of|replac(?:e|ing)|remov(?:e|ing)|take\s+(?:off|out)|drop|swap\s+out)\s+(?:the\s+|our\s+|that\s+)?[a-z/' -]{2,40}?\s+polic(?:y|ies)\b/gi;

export function withoutSetAsidePolicies(text: string): string {
  return (text ?? "").replace(SET_ASIDE_POLICY, " ");
}

/** The answer to "clean up my grammar". */
export const GRAMMAR_ANSWER =
  "I can't rewrite your wording for grammar here, so **What happened** keeps your words as you typed them — I won't add or change any facts. You can correct spelling and capitals on the form before you finalize it.";

/** The line that says what an edit in this turn did to What happened, or null. */
export function remapEditLine(question: string): string | null {
  const turn = readTurnEdit(question);
  if (turn?.kind === "replace") return "**What happened** now reads exactly as you wrote it.";
  if (turn?.kind === "add") return `Added to **What happened**, in your words: "${turn.text}"`;
  if (sentencesOf(question).some((sentence) => readSentenceEdit(sentence)?.kind === "grammar")) return GRAMMAR_ANSWER;
  return null;
}

/**
 * What happened under the three edit kinds. `current` is what the remap read;
 * `reread` reads the account again from the manager's turns with every edit
 * and instruction taken out. A replace sets the text; an add is appended as
 * written; a value that came out of an instruction is read again.
 */
export function remapObservation(input: {
  readonly users: readonly string[];
  readonly current: string | null;
  readonly reread: (said: string) => string | null;
}): string | null {
  let literal: string | null = null;
  const added: string[] = [];
  const account: string[] = [];
  const edits: string[] = [];
  for (const turn of input.users) {
    const edit = readTurnEdit(turn);
    if (edit?.kind === "replace") {
      literal = edit.text;
      added.length = 0;
      account.length = 0;
      edits.push(turn);
      continue;
    }
    if (edit?.kind === "add") {
      added.push(edit.text);
      edits.push(turn);
      continue;
    }
    const kept: string[] = [];
    for (const sentence of sentencesOf(turn)) {
      if (readSentenceEdit(sentence) === null) kept.push(sentence);
      else edits.push(sentence);
    }
    if (kept.length > 0) account.push(kept.join(" "));
  }
  const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  let text = input.current;
  if (literal) text = literal;
  else if (text) {
    const value = norm(text);
    const fromEdit = edits.some((edit) => norm(edit).includes(value));
    const inAccount = account.some((turn) => norm(turn).includes(value));
    if (fromEdit && !inAccount) text = input.reread(account.join("\n"));
  }
  for (const clause of added) {
    if (text && norm(text).includes(norm(clause))) continue;
    text = text ? `${text}${/[.!?]$/.test(text) ? "" : "."} ${clause}` : clause;
  }
  return text;
}
