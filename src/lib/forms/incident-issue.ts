import { decimalKeepEnabled, incidentSplitFixEnabled, typedNameEnabled } from "@/lib/config/chat-quality-flags";
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

/*
 * ============================================================================
 * INCIDENT_SPLIT_FIX_ENABLED: THE ACCOUNT IS THE REQUEST'S, IN ITS WHOLE SENTENCES
 * ============================================================================
 *
 * QA, 25 Oct 2026 (Bubbles production, names invented in the tests):
 *   conv_mvoftzhs29se8nb  "… for violating visitors at work policy on 10-10-26.
 *                         <A> spent 40 minutes talking with friend …" — only the
 *                         first sentence was the Issue;
 *   conv_mvofuak12ovvib7  "… corrective action for <C>, she is a team member at
 *                         our Dodge, NE store. On 10-1-26 she opened the store
 *                         late." — Issue "she is a team member at our Dodge";
 *   "… for <name>, she works at our Dodge, NE store as a team member and was
 *   late today." — Issue "she works at our Dodge";
 *   a later pasted policy paragraph, "Policy violated: …" or "not attendance,
 *   late opening" replaced the account.
 *
 * On: the account comes from the latest request turn for the form, in whole
 * sentences ("Dodge, NE" and "$3.25" never end one), without the request
 * words, the person's name, where they work or their title, the payroll and
 * prior-coaching answers, or pasted policy text. Only when that turn tells
 * nothing does a later turn's account count; "change what happened to: …"
 * replaces it. Off, the reading above is unchanged.
 */
const STATE_AFTER_PLACE = /\b([A-Za-z][\w'-]*),\s*(ne|ks|mo|ia|sd|nd|mn|wi|il|tx)\b/gi;
const CREATE_REQUEST =
  /\b(?:create|make|need|needs|draft|write|do|start|prepare|issue|give)\b[^.]*?\b(?:ca|c\/a|dpoa|corrective\s+action|write[- ]?up|warning)\b/i;
const REQUEST_LEAD =
  /^.*?\b(?:corrective\s+action(?:\s+form)?|ca(?:\s+form)?|c\/a|dpoa|write[- ]?up|warning)\s+(?:for|on|against)\s+/i;
const EDIT_ACCOUNT =
  /\b(?:change|replace|update|set)\s+(?:the\s+)?(?:observation(?:\s+of\s+offense)?|what\s+happened|issue|incident)\s+(?:to|with)\s*:?\s*([\s\S]+)$/i;
const POLICY_TEXT =
  /^(?:policy(?:\s+violated)?|issue|section|direct\s+policy|violation\s+of\s+company\s+policies)\s*:|\bthe\s+company\b|\bemployees?\s+(?:must|shall|will\s+be|are|is)\s+(?:required|expected|not\s+allowed)|\bwho\s+failed\s+to\s+open\s+will\b/i;
const LEVEL_ONLY = /^(?:(?:this\s+is\s+)?(?:a\s+)?(?:verbal|written|final)(?:\s+(?:warning|ca|corrective\s+action))?|today'?s?\s+date|no\s+prior.*)$/i;
const HAPPENED = /\b(?:late|tardy|did\s*n[o']?t|didnt|failed|missed|never|no\s+call|left|opened|open|talking|phone|ignor\w*|spent|was\s+not|wasn'?t|forgot|refused|rude|yell\w*|short(?:age)?|took|stole|clock\w*|sleep\w*)\b/i;

/** Clauses that answer another field: payroll, a prior action or the level, a lone date, a bare place. */
const PAYROLL_PART = /\b(?:payroll|deduct\w*)\b/i;
const PRIOR_PART =
  /^(?:(?:given|gave|got|had|has|received)\s+(?:(?:her|him|them)\s+)?(?:a\s+)?)?(?:verbal|written|final)\s+(?:warning|ca|c\/a|corrective\s+action)\b/i;
const LEVEL_TAIL = /(?:^|\s+)(?:(?:this|it)\s+(?:is|was)\s+|it['’]?s\s+)?(?:a\s+)?(?:verbal|written|final)\s+(?:warning|ca|c\/a|corrective\s+action)\s*$/i;
const COACHED_BEFORE = /^(?:i\s+)?(?:verbally\s+)?coached\s+(?:her|him|them)\b/i;
const ONLY_WHERE = /^(?:she|he|they)\s+(?:is|works)\s+(?:at|in)\s+(?:our\s+|the\s+)?\S+(?:\s+\S+){0,2}$/i;
const ONLY_DATE = /^(?:on\s+)?\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?$/;
const BARE_PLACE = /^(?:in|at)\s+(?:our\s+|the\s+)?[A-Za-z][\w'.-]*(?:\s+[A-Za-z][\w'.-]*){0,3}$/i;
const COURTESY_TAIL = /[,\s]+(?:please|pls|thanks?|thank\s+you)\s*$/i;
const DURATION = /\b\d+\s*(?:min|mins|minutes|hours?|hrs?)\b/i;

function answersAnotherField(part: string): boolean {
  if (/^(?:please|pls|thanks?|thank\s+you)$/i.test(part)) return true;
  return PAYROLL_PART.test(part) || PRIOR_PART.test(part) || COACHED_BEFORE.test(part) || ONLY_WHERE.test(part) || ONLY_DATE.test(part) || (BARE_PLACE.test(part) && !HAPPENED.test(part));
}

/** "jordan testperson cash handling": the person's name before the account is not the account. */
function withoutLeadingName(part: string, personWords: ReadonlySet<string>): string {
  const words = part.split(/\s+/);
  let index = 0;
  while (index < words.length - 1 && personWords.has(words[index]!.toLowerCase().replace(/[^a-z'-]/g, ""))) index += 1;
  // A name followed by what they did ("juno spent 40 minutes …") keeps its subject.
  const rest = words.slice(index).join(" ");
  if (index === 0 || HAPPENED.test(rest) || /^(?:was|is|were|are|did|didn'?t|has|had|spent|came|went|took|got|said)\b/i.test(rest)) return part;
  return rest;
}

function whoOrWhere(clause: string, personWords: ReadonlySet<string>): boolean {
  const lower = clause.toLowerCase().trim();
  if (HAPPENED.test(lower)) return false;
  // "Sadie was in the store 45 min" is what happened, not where she works.
  if (DURATION.test(lower)) return false;
  if (/\b(?:primary|home)\s+store\b/.test(lower)) return true;
  const words = lower.split(/\s+/);
  const subject = words[0] === "she" || words[0] === "he" || words[0] === "they" || personWords.has(words[0] ?? "");
  const says = /^(?:\S+\s+){0,2}?(?:is|was|works|worked|'s)\b/.test(lower) || /^as\s+an?\b/.test(lower);
  const titled = COMPANY_JOB_TITLES.some((entry) => new RegExp(entry.pattern.source, "i").test(lower));
  const placed = /\b(?:store|location|at\s+our|in\s+our)\b/.test(lower);
  return (subject || /^as\s+an?\b/.test(lower)) && says && (titled || placed);
}

/** "but not for Rory Vance": another person's clause; the "who …" clause after it is theirs too. */
const NOT_FOR_OTHER = /^(?:but\s+)?not\s+(?:for|about)\s+\S/i;
/** "She is not rude", "She was never late": what she is not, never the offense ("did not clean" is). */
const IS_NOT = /^(?:she|he|they|[a-z]+)\s+(?:is|was|are|were)\s+(?:not|never)\b|^(?:she|he|they)\s+(?:isn'?t|wasn'?t)\b/i;

function withoutOtherPeople(parts: readonly string[]): string[] {
  const kept: string[] = [];
  let theirs = false;
  for (const part of parts) {
    if (NOT_FOR_OTHER.test(part)) {
      theirs = true;
      continue;
    }
    if (theirs && /^who\b/i.test(part)) continue;
    theirs = false;
    kept.push(part);
  }
  return kept;
}

/** "tom lee was late": a clause whose subject is a two-word name that is not the employee's. */
const NAMED_SUBJECT = /^([A-Za-z][a-z'’-]+)\s+([A-Za-z][a-z'’-]+)\s+(?:was|is|were|did|didn'?t|had|has|left|opened|came|got|took|spent)\b/i;

function anotherPersonsClause(part: string, personWords: ReadonlySet<string>): boolean {
  if (/^(?:but\s+)?not\s+[A-Za-z]+\s+[A-Za-z]+\s*$/i.test(part)) return true;
  const named = NAMED_SUBJECT.exec(part);
  if (!named) return false;
  const first = named[1]!.toLowerCase();
  const last = named[2]!.toLowerCase();
  if (/^(?:she|he|they|it|this|that|the|her|his)$/.test(first)) return false;
  return !personWords.has(first) && !personWords.has(last);
}

function accountClauses(sentence: string, personWords: ReadonlySet<string>): string | null {
  const split = sentence.split(
    /\s*,\s*|\s+(?=but\s+not\b)|\s+and\s+(?=(?:she|he|they|was|is|did|has|had|then|no\s+payroll|payroll)\b)|\s+and\s+(?=[A-Za-z][a-z'’-]+\s+[A-Za-z][a-z'’-]+\s+(?:was|is|did|left|opened)\b)/i,
  );
  const parts = withoutOtherPeople(split.map((part) => part.trim()))
    .filter((part) => !IS_NOT.test(part) && !anotherPersonsClause(part, personWords))
    .map((part) => part.trim().replace(/^and\s+/i, "").replace(COURTESY_TAIL, "").replace(LEVEL_TAIL, "").trim())
    .filter(Boolean)
    .map((part) => withoutLeadingName(part, personWords))
    .filter((part) => !answersAnotherField(part))
    .filter((part) => !NOT_THE_ACCOUNT.test(part) && !POLICY_TEXT.test(part) && !LEVEL_ONLY.test(part))
    .filter((part) => !whoOrWhere(part, personWords))
    .filter((part) => !part.split(/\s+/).every((word) => personWords.has(word.toLowerCase().replace(/[^a-z'-]/g, ""))));
  const kept = parts.join(", ").trim();
  return kept.length >= 3 ? kept : null;
}

function turnAccount(turn: string, personWords: ReadonlySet<string>, person: string): string | null {
  const protectedTurn = turn.replace(STATE_AFTER_PLACE, "$1 $2");
  const sentences = [...protectedTurn.matchAll(SENTENCE_DECIMAL)].map((match) => match[0].trim().replace(/[.!?]+$/, ""));
  const kept: string[] = [];
  for (const raw of sentences) {
    let sentence = raw;
    if (CREATE_REQUEST.test(sentence) || REQUEST_LEAD.test(sentence)) {
      const led = sentence.replace(REQUEST_LEAD, "");
      if (led === sentence) continue;
      sentence = led;
      // The person named right after "for", then the account: "<name>, she …", "<name> for violating …".
      if (person) {
        const name = new RegExp(`^(?:(?:${[...personWords].map(escapeWord).join("|")})\\b\\s*)+(?:for|about|over|regarding)?\\s*[-—–:,]?\\s*`, "i");
        sentence = sentence.replace(name, "");
      }
    }
    if (POLICY_TEXT.test(sentence)) continue;
    const account = accountClauses(sentence, personWords);
    if (!account) continue;
    if (!HAPPENED.test(account) && !describesIncident(account) && kept.length === 0 && !/\bviolat\w*\b/i.test(account)) continue;
    kept.push(account);
  }
  let joined = "";
  for (const sentence of kept) {
    const next = joined ? `${joined}. ${sentence}` : sentence;
    if (next.length > 180) break;
    joined = next;
  }
  return joined ? clipAccount(joined) : null;
}

function escapeWord(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitFixedIssue(text: string, employeeName: string | null): string | null {
  const person = (employeeName ?? "").trim().toLowerCase();
  const personWords = new Set(person.split(/\s+/).filter(Boolean));
  const turns = turnsOf(text);
  let start = 0;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (CREATE_REQUEST.test(turns[index]!)) {
      start = index;
      break;
    }
  }
  let account: string | null = null;
  for (const turn of turns.slice(start)) {
    const edit = EDIT_ACCOUNT.exec(turn);
    if (edit) {
      account = clipAccount(edit[1]!.trim().replace(/^["“]|["”]$/g, ""));
      continue;
    }
    if (account) continue;
    account = turnAccount(turn, personWords, person);
  }
  return account;
}

export function correctiveActionIssue(text: string, employeeName: string | null): string | null {
  if (incidentSplitFixEnabled()) return splitFixedIssue(text, employeeName) ?? issueFromRequest(text, employeeName);
  const fromRequest = issueFromRequest(text, employeeName);
  if (!typedNameEnabled()) return fromRequest;
  if (fromRequest && !titleAndPlaceOnly(fromRequest, employeeName)) return fromRequest;
  return accountIssue(text);
}
