import { decimalKeepEnabled, typedNameEnabled } from "@/lib/config/chat-quality-flags";
import { COMPANY_JOB_TITLES } from "@/config/company/job-titles";

import { JOIN } from "./bounded-context";
import { describesIncident } from "./corrective-action-intake";

/**
 * ============================================================================
 * "A WRITTEN WARNING FOR CASH HANDLING" — WHAT THE FORM IS FOR
 * ============================================================================
 *
 * The issue a Corrective Action is about, in the manager's own words, read
 * from the request that asked for it: "needs a written warning for cash
 * handling" → "cash handling". Read back on the card beside the employee, so
 * the two can never be confused again — signed-in QA, 8 Oct 2026, found the
 * issue printed as the employee's NAME.
 *
 * Only what follows "for / about / over / regarding" after the warning or the
 * form itself, cut at the next clause; never a person (`employeeName`), and
 * never a guess. Null when the manager did not state one that way — the card
 * then says nothing about it and the draft is written from their account.
 *
 * Pure and browser-safe.
 */

const REQUEST =
  /\b(?:warning|write[- ]?up|corrective\s+action(?:\s+form)?|ca|c\/a|dpoa)\s+(?:for|about|over|regarding|re:?)\s+([^.;!?\n]+)/gi;
/** DECIMAL_KEEP_ENABLED: the same, with "$3.25" read as one number. */
const REQUEST_DECIMAL =
  /\b(?:warning|write[- ]?up|corrective\s+action(?:\s+form)?|ca|c\/a|dpoa)\s+(?:for|about|over|regarding|re:?)\s+((?:[^.;!?\n]|(?<=\d)\.(?=\d))+)/gi;
const SENTENCE = /[^.!?\n]+[.!?]*/g;
/** DECIMAL_KEEP_ENABLED: a point between two digits does not end the sentence. */
const SENTENCE_DECIMAL = /(?:[^.!?\n]|(?<=\d)\.(?=\d))+[.!?]*/g;
const CUT = /\s*(?:,|\s-\s|\s—\s|\band\b(?=\s+(?:a|an|the|also|then|she|he|they|i|we|please|pls)\b)|\bplease\b|\bpls\b|\bthanks?\b|\bthank you\b)/i;
const NOT_AN_ISSUE = /^(?:her|him|them|this|that|it|the\s+employee|my\s+employee|an?\s+employee|today|tomorrow|yesterday)$/i;
/** "violation is that …" names the offense. The request's for-clause often names only the person. */
const VIOLATION = /\bviolation\s+is\s+(?:that\s+)?([^.;!?\n]+)/i;
/** Payroll and prior coaching answer those fields. They are not the offense. */
const NOT_THE_ACCOUNT =
  /\b(?:payroll\s+deduct|previous\s+coaching|prior\s+(?:coaching|actions?)|jba\s+(?:policy\s+)?manual)\b/i;
const PLACE = /\bat\s+[A-Za-z0-9][\w'.-]*(?:\s+[A-Za-z0-9][\w'.-]*){0,3}/gi;
const LEFTOVER_FILLER = /^(?:location|store|the|a|an|for|and)$/i;

function turnsOf(text: string): string[] {
  return (text ?? "")
    .split(JOIN)
    .map((turn) => turn.trim())
    .filter(Boolean);
}

/** The for-clause the request names, flags off and on. Capped at 80, as before. */
function issueFromRequest(text: string, employeeName: string | null): string | null {
  const person = (employeeName ?? "").trim().toLowerCase();
  const personWords = new Set(person.split(/\s+/).filter(Boolean));
  for (const turn of [...turnsOf(text)].reverse()) {
    let found: string | null = null;
    for (const match of turn.matchAll(decimalKeepEnabled() ? REQUEST_DECIMAL : REQUEST)) {
      let raw = match[1]!;
      // "a CA for Jordan Testperson for cash handling", "… for jordan testperson - cash handling",
      // "CA for jordan testperson, cash handling": the person, then the issue.
      if (person) {
        const words = [...personWords].map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
        const after = new RegExp(`^(?:(?:${words})\\s*)+(?:\\s+(?:for|about|over|regarding)\\s+|\\s*[-—–:,]\\s*)(.+)$`, "i").exec(raw.trim());
        if (after) raw = after[1]!;
      }
      const issue = raw.split(CUT)[0]!.trim().replace(/[\s"'”’)]+$/, "");
      const lower = issue.toLowerCase();
      if (issue.length < 3 || issue.length > 80 || NOT_AN_ISSUE.test(issue)) continue;
      // "a CA for Jordan Testperson" names the person, not the issue.
      if (person && (lower === person || lower.startsWith(`${person} `) || lower.split(/\s+/).every((word) => personWords.has(word)))) continue;
      found = issue;
    }
    if (found) return found;
  }
  return null;
}

/**
 * A for-clause that is only a job title, the employee, and "at <place>".
 * "CA for team member Testy Testerson at Dodge" names who and where, not what happened.
 */
function titleAndPlaceOnly(issue: string, employeeName: string | null): boolean {
  let rest = ` ${issue} `;
  let strippedTitle = false;
  let strippedPlace = false;
  for (const entry of COMPANY_JOB_TITLES) {
    const pattern = new RegExp(entry.pattern.source, "gi");
    if (!pattern.test(rest)) continue;
    strippedTitle = true;
    rest = rest.replace(new RegExp(entry.pattern.source, "gi"), " ");
  }
  if (PLACE.test(rest)) {
    strippedPlace = true;
    rest = rest.replace(new RegExp(PLACE.source, "gi"), " ");
  }
  PLACE.lastIndex = 0;
  if (!strippedTitle && !strippedPlace) return false;
  const person = new Set(
    (employeeName ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  );
  const leftover = rest
    .replace(/[^A-Za-z0-9']+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !LEFTOVER_FILLER.test(word));
  if (leftover.length === 0) return true;
  if (person.size > 0) return leftover.every((word) => person.has(word.toLowerCase()));
  return strippedTitle && leftover.length <= 3 && leftover.every((word) => /^[A-Za-z][A-Za-z'.-]*$/.test(word));
}

function clipAccount(raw: string): string | null {
  const issue = raw.trim().replace(/[\s"'”’)]+$/, "").replace(/\.+$/, "");
  if (issue.length < 3 || issue.length > 180 || NOT_AN_ISSUE.test(issue)) return null;
  return issue;
}

/** DECIMAL_KEEP_ENABLED: the comma clauses that answer payroll or prior coaching, left out. */
function withoutPayrollClauses(sentence: string): string {
  if (!NOT_THE_ACCOUNT.test(sentence)) return sentence;
  return sentence
    .split(",")
    .filter((clause) => !NOT_THE_ACCOUNT.test(clause))
    .join(",")
    .trim();
}

/** The latest account of what happened, when the for-clause was only the person and the store. */
function accountIssue(text: string): string | null {
  for (const turn of [...turnsOf(text)].reverse()) {
    const violation = VIOLATION.exec(turn);
    if (violation && !NOT_THE_ACCOUNT.test(violation[1]!)) {
      const issue = clipAccount(violation[1]!);
      if (issue) return issue;
    }
    const decimal = decimalKeepEnabled();
    const sentences = [...turn.matchAll(decimal ? SENTENCE_DECIMAL : SENTENCE)]
      .map((match) => match[0].trim())
      // "…, register shortage 10-20-26, $3.25 payroll deduct": the payroll
      // clause answers its own field, the rest of the sentence is the account.
      .map((sentence) => (decimal ? withoutPayrollClauses(sentence) : sentence))
      .filter((sentence) => sentence.length >= 3 && sentence.length <= 180);
    const hits = sentences
      .map((sentence, index) => ({ sentence, index }))
      .filter(({ sentence }) => !NOT_THE_ACCOUNT.test(sentence) && describesIncident(sentence));
    if (hits.length === 0) continue;
    let start = hits.length - 1;
    while (start > 0 && hits[start]!.index === hits[start - 1]!.index + 1) start -= 1;
    let joined = "";
    for (const hit of hits.slice(start)) {
      const next = joined ? `${joined} ${hit.sentence}` : hit.sentence;
      if (next.length > 180) break;
      joined = next;
    }
    const issue = clipAccount(joined);
    if (issue) return issue;
  }
  return null;
}

export function correctiveActionIssue(text: string, employeeName: string | null): string | null {
  const fromRequest = issueFromRequest(text, employeeName);
  if (!typedNameEnabled()) return fromRequest;
  if (fromRequest && !titleAndPlaceOnly(fromRequest, employeeName)) return fromRequest;
  return accountIssue(text);
}
