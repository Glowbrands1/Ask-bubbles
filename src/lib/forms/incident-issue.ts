import {
  complaintAccountEnabled,
  decimalNotSentenceEndEnabled,
  incidentSplitFixEnabled,
  issueAfterRequestReasonEnabled,
  issueIsTheAccountEnabled,
  levelRequestDateEnabled,
  levelStepNotAccountEnabled,
  policyCorrectionNotAccountEnabled,
  requestParticipleLeadEnabled,
  typedNameEnabled,
} from "@/lib/config/chat-quality-flags";
import { COMPANY_JOB_TITLES } from "@/config/company/job-titles";
import { isPolicyCorrection } from "@/lib/ai/policy-correction-turn";
import { businessToday } from "@/lib/business-date";

import { withoutLevelAndStepClauses } from "./account-clauses";
import { isSalesPolicyReading, observationAccount, readCaPolicy } from "./ca-policy";
import { onlyDeniesAFault } from "./denial-no-account";
import { JOIN } from "./turn-join";
import { describesIncident } from "./corrective-action-intake";
import { withoutPriorStepClauses } from "./form-date-answer";
import { priorSentenceFixFor } from "./prior-sentence-scope";
import { statedWarningLevel } from "./warning-level";

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
/*
 * REQUEST_PARTICIPLE_LEAD_ENABLED (port of the sibling app's flag; its round-5 live check, 8 Nov 2026): "I need a
 * corrective action made for under performance. <A> was below on PPTA, …" made the card's Issue the whole request, "I
 * need a corrective action made for under performance. <A> was below …": "made / done / written up for" after the form
 * was not read as part of the request. With the flag the request reads it, and a request whose for-clause is only a
 * sales reason ("under performance") leaves the account to the sentence that gives it.
 */
const PARTICIPLE = String.raw`(?:made|done|written(?:\s+up)?|put\s+together|drawn\s+up)`;
const FORM = String.raw`(?:warning|write[- ]?up|corrective\s+action(?:\s+form)?|ca|c\/a|dpoa)`;
const REQUEST_PARTICIPLE = new RegExp(String.raw`\b${FORM}\s+(?:${PARTICIPLE}\s+)?(?:for|about|over|regarding|re:?)\s+([^.;!?\n]+)`, "gi");
const REQUEST_PARTICIPLE_KEEPING_DECIMALS = new RegExp(
  String.raw`\b${FORM}\s+(?:${PARTICIPLE}\s+)?(?:for|about|over|regarding|re:?)\s+((?:[^.;!?\n]|(?<=\d)\.(?=\d))+)`,
  "gi",
);
const PARTICIPLE_REQUEST_LEAD = new RegExp(
  String.raw`^\s*(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:(?:i\s+)?(?:need|want)\s+(?:to\s+)?)?(?:(?:create|make|start|open|do|file|write|draft|fill\s+out|put\s+together)\s+(?:me\s+)?)?(?:(?:a|an|another|new)\s+)?(?:(?:verbal|written|final)\s+)?${FORM}\b\s*${PARTICIPLE}\s+for\s+`,
  "i",
);

function salesReasonOnly(words: string): boolean {
  if (words.split(/\s+/).length > 5) return false;
  const reading = readCaPolicy(words);
  return reading.stated === null && isSalesPolicyReading(reading);
}

function requestPattern(): RegExp {
  if (requestParticipleLeadEnabled()) return decimalNotSentenceEndEnabled() ? REQUEST_PARTICIPLE_KEEPING_DECIMALS : REQUEST_PARTICIPLE;
  return decimalNotSentenceEndEnabled() ? REQUEST_KEEPING_DECIMALS : REQUEST;
}

/** REQUEST_PARTICIPLE_LEAD_ENABLED: "I need a corrective action made for under performance." is a request and its sales reason, no account. */
function isRequestReasonOnly(sentence: string): boolean {
  if (!requestParticipleLeadEnabled()) return false;
  const lead = PARTICIPLE_REQUEST_LEAD.exec(sentence);
  if (!lead) return false;
  const rest = sentence.slice(lead[0].length).replace(/[.!?]+$/, "").trim();
  if (!rest || rest.split(/\s+/).length > 5) return false;
  const reading = readCaPolicy(rest);
  return reading.stated === null && isSalesPolicyReading(reading);
}
const CUT = /\s*(?:,|\s-\s|\s—\s|\band\b(?=\s+(?:a|an|the|also|then|she|he|they|i|we|please|pls)\b)|\bplease\b|\bpls\b|\bthanks?\b|\bthank you\b)/i;
const NOT_AN_ISSUE = /^(?:her|him|them|this|that|it|the\s+employee|my\s+employee|an?\s+employee|today|tomorrow|yesterday)$/i;
/** "violation is that …" names the offense. The request's for-clause often names only the person. */
const VIOLATION = /\bviolation\s+is\s+(?:that\s+)?([^.;!?\n]+)/i;
/** Payroll and prior coaching answer those fields. They are not the offense. */
const NOT_THE_ACCOUNT =
  /\b(?:payroll\s+deduct|previous\s+coaching|prior\s+(?:coaching|actions?)|jba\s+(?:policy\s+)?manual)\b/i;
const PLACE = /\bat\s+[A-Za-z0-9][\w'.-]*(?:\s+[A-Za-z0-9][\w'.-]*){0,3}/gi;
const LEFTOVER_FILLER = /^(?:location|store|the|a|an|for|and)$/i;
/*
 * DECIMAL_NOT_SENTENCE_END_ENABLED (QA, 27 Oct 2026): a point between two
 * digits ends no sentence. "she was 10 minutes late on 10.2" read back as
 * "… late on 10", and "3.5 hours late and owes $10.25" as "3. 5 hours late
 * and owes $10".
 */
const REQUEST_KEEPING_DECIMALS =
  /\b(?:warning|write[- ]?up|corrective\s+action(?:\s+form)?|ca|c\/a|dpoa)\s+(?:for|about|over|regarding|re:?)\s+((?:[^.;!?\n]|(?<=\d)\.(?=\d))+)/gi;
const SENTENCE = /[^.!?\n]+[.!?]*/g;
const SENTENCE_KEEPING_DECIMALS = /(?:[^.!?\n]|(?<=\d)\.(?=\d))+[.!?]*/g;

function turnsOf(text: string): string[] {
  return (text ?? "")
    .split(JOIN)
    .map((turn) => turn.trim())
    .filter(Boolean);
}

/*
 * ISSUE_IS_THE_ACCOUNT_ENABLED (QA, flip-3 tester, 6 Nov 2026: "…<name>, verbal, she was late on 10-20-26"):
 * the Issue was the first clause after the person, so a bare warning level ("verbal") or a variant of the
 * person's name ("Tammy Wexley", "Tamsin W") was printed as what happened. With the flag on, those clauses are
 * passed over and the first clause that says something else is the Issue. A level clause is one the warning
 * reader reads with at most three words; a name clause is one of at most three words sharing a word with the
 * person. Off, the first clause, as before.
 */
function firstAccountClause(raw: string, personWords: ReadonlySet<string>): string {
  const clauses = raw.split(CUT).map((clause) => clause.trim()).filter(Boolean);
  if (!issueIsTheAccountEnabled()) return clauses[0] ?? "";
  const short = (clause: string) => clause.split(/\s+/).length <= 3;
  const levelOnly = (clause: string) => short(clause) && statedWarningLevel(clause) !== null;
  const nameOnly = (clause: string) => short(clause) && clause.toLowerCase().split(/[^\p{L}'’-]+/u).some((word) => personWords.has(word));
  return clauses.find((clause) => !levelOnly(clause) && !nameOnly(clause)) ?? clauses[0] ?? "";
}

/** The for-clause the request names, flags off and on. Capped at 80, as before. */
function issueFromRequest(text: string, employeeName: string | null): string | null {
  const person = (employeeName ?? "").trim().toLowerCase();
  const personWords = new Set(person.split(/\s+/).filter(Boolean));
  for (const turn of [...turnsOf(text)].reverse()) {
    let found: string | null = null;
    for (const match of turn.matchAll(requestPattern())) {
      let raw = match[1]!;
      // "a CA for Jordan Testperson for cash handling", "… for jordan testperson - cash handling",
      // "CA for jordan testperson, cash handling": the person, then the issue.
      if (person) {
        const words = [...personWords].map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
        const after = new RegExp(`^(?:(?:${words})\\s*)+(?:\\s+(?:for|about|over|regarding)\\s+|\\s*[-—–:,]\\s*)(.+)$`, "i").exec(raw.trim());
        if (after) raw = after[1]!;
      }
      const issue = firstAccountClause(raw, personWords).trim().replace(/[\s"'”’)]+$/, "");
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

/** The latest account of what happened, when the for-clause was only the person and the store. */
/*
 * LEVEL_REQUEST_DATE_ENABLED (QA, the sibling app's live chat, 30 Oct 2026):
 * "create a written on 10/20 for <name> at <store>, she was late again" was
 * the card's Issue word for word. The clause that asks for the level, dated
 * or not, is the request; what follows its comma is the account.
 */
const LEVEL_REQUEST_LEAD =
  /^\s*(?:please\s+)?(?:create|make|start|open|do|file|write|draft)\s+(?:a\s+|an\s+)?(?:verbal|written|final)(?:\s+warning)?(?:\s+(?:on\s+)?(?<![\d/-])\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?![\d/-]))?\s+for\b[^,]*,\s*/i;

function withoutLevelRequestLead(sentence: string): string {
  const read = complaintAccountEnabled() ? sentence.replace(LEVEL_RUN_ON_LEAD, "") : sentence;
  if (!levelRequestDateEnabled()) return read;
  return read.replace(LEVEL_REQUEST_LEAD, "");
}

/*
 * COMPLAINT_ACCOUNT_ENABLED (QA's audit, 7 Nov 2026, a real manager's chat here on 3 Nov 2026): "verbal warning The
 * date she complained was Oct 31st . The customer said she was giving her an attitude …" was the card's Issue as
 * "verbal warning The date she complained was Oct 31st". The level that opens the turn and runs on into a new sentence
 * is the form's Type of Warning, never the account (`warning-level.ts`); and a sentence that only says on which day
 * it happened dates the account, it is not the account.
 */
const LEVEL_RUN_ON_LEAD = /^\s*(?:[Vv]erbal|[Ww]ritten|[Ff]inal)\s+(?:[Ww]arning|CA|ca|C\/A|c\/a|[Cc]orrective\s+[Aa]ction)\s+(?=(?:The|She|He|They|It|Her|His|Their|This|That|When)\b)/;
const DATE_ONLY_LINE =
  /^(?:the\s+)?(?:date|day)\b[^.!?]{0,40}?\b(?:was|is)\s+(?:on\s+)?(?:\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{2,4})?)\s*[.!]*$/i;

function onlyDatesTheAccount(sentence: string): boolean {
  return complaintAccountEnabled() && DATE_ONLY_LINE.test(sentence.trim());
}

/*
 * ISSUE_AFTER_REQUEST_REASON_ENABLED (QA's round-5 Bubbles check, 8 Nov 2026): "I need a corrective action (made)
 * for under performance. <A> was below on …". The request's for-clause is only its reason, a sales one the policy
 * reader reads as no stated offense; it is no Issue while an account follows, and the request sentence itself is no
 * account. A participle between the form and "for" ("made / done / written up for") is still the request.
 */
const REASON_REQUEST =
  /^(?:[\p{L}'’]+\s+){0,6}?(?:warning|write[- ]?up|corrective\s+action(?:\s+form)?|ca|c\/a|dpoa)\s+(?:(?:made|done|created|drawn\s+up|written(?:\s+up)?|filled\s+out|put\s+together|prepared|started|completed)\s+)?(?:for|about|over|regarding)\s+([^.;!?\n]+)[.!?]*$/iu;

/** ISSUE_AFTER_REQUEST_REASON_ENABLED: a few words that read only as a sales reason ("under performance"). */
function onlySalesReason(phrase: string): boolean {
  const words = phrase.trim().replace(/[.!?]+$/, "");
  if (!words || words.split(/\s+/).length > 5) return false;
  const reading = readCaPolicy(words);
  return reading.stated === null && isSalesPolicyReading(reading);
}

/** ISSUE_AFTER_REQUEST_REASON_ENABLED: the sentence is a request whose for-clause is only a sales reason. */
function reasonOnlyRequest(sentence: string): boolean {
  const match = REASON_REQUEST.exec(sentence.trim());
  return match !== null && onlySalesReason(match[1]!);
}

/*
 * ISSUE_AFTER_REQUEST_REASON_ENABLED (QA's round-5 Bubbles check, 8 Nov 2026, nov6-under-performance-explained-tester):
 * "it should be under performance not standard of conduct" became the Issue. A turn that only corrects the policy
 * or the level is no account.
 */
const CORRECTED_NAME = String.raw`(?:a\s+|an\s+|the\s+)?(?:standards?\s+of\s+conduct|code\s+of\s+conduct|attendance|tardiness|absenteeism|dress\s+code|under[- ]?performance|sales(?:\s+performance)?|violation\s+of\s+company\s+polic(?:y|ies)|(?:verbal|written|final)(?:\s+(?:warning|ca|c\/a|corrective\s+action|write[- ]?up))?)(?:\s+polic(?:y|ies))?`;
const CORRECTION_LEAD = String.raw`(?:(?:it|this|that)(?:\s+one)?(?:['’]s|\s+is|\s+should\s+(?:be|say)|\s+needs\s+to\s+be|\s+(?:should\s+)?(?:falls?|goes?|go|fall)\s+under)|should\s+be|make\s+(?:it|this)|change\s+(?:it|this|the\s+policy)\s+to|switch\s+(?:it\s+)?to|use|go\s+with|put\s+it\s+under)\s+`;
const NOT_NAME = String.raw`(?:[,;]?\s*(?:and\s+)?(?:not|instead\s+of|rather\s+than)\s+${CORRECTED_NAME})`;
const CORRECTION_ONLY = new RegExp(
  String.raw`^(?:(?:actually|sorry|no|nope|oops|ok|okay|oh|wait)[,.!\s]+)*(?:${CORRECTION_LEAD}${CORRECTED_NAME}${NOT_NAME}?|not\s+${CORRECTED_NAME}[,;.]?\s+(?:${CORRECTION_LEAD})?${CORRECTED_NAME})(?:\s+instead)?\s*[.!]*$`,
  "iu",
);

/** ISSUE_AFTER_REQUEST_REASON_ENABLED: the sentence only corrects the policy or the level. */
function onlyCorrectsPolicyOrLevel(sentence: string): boolean {
  return issueAfterRequestReasonEnabled() && CORRECTION_ONLY.test(sentence.trim());
}

function accountIssue(text: string): string | null {
  for (const turn of [...turnsOf(text)].reverse()) {
    const violation = VIOLATION.exec(turn);
    if (violation && !NOT_THE_ACCOUNT.test(violation[1]!)) {
      const issue = clipAccount(violation[1]!);
      if (issue) return issue;
    }
    const sentences = [...turn.matchAll(decimalNotSentenceEndEnabled() ? SENTENCE_KEEPING_DECIMALS : SENTENCE)]
      .map((match) => withoutLevelRequestLead(match[0].trim()))
      .filter((sentence) => sentence.length >= 3 && sentence.length <= 180);
    const found = sentences
      .map((sentence, index) => ({ sentence, index }))
      .filter(({ sentence }) => !NOT_THE_ACCOUNT.test(sentence) && !onlyDatesTheAccount(sentence) && describesIncident(sentence))
      .filter(({ sentence }) => !(issueAfterRequestReasonEnabled() && reasonOnlyRequest(sentence)))
      .filter(({ sentence }) => !onlyCorrectsPolicyOrLevel(sentence));
    // REQUEST_PARTICIPLE_LEAD_ENABLED: with the account in another sentence, the request's sales reason is left out.
    const reasonOnly = found.filter(({ sentence }) => isRequestReasonOnly(sentence));
    const hits = reasonOnly.length > 0 && reasonOnly.length < found.length ? found.filter((hit) => !reasonOnly.includes(hit)) : found;
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

/** POLICY_CORRECTION_NOT_ACCOUNT_ENABLED: the text without its sentences that only correct the policy (`ai/policy-correction-turn.ts`). */
function withoutPolicyCorrections(text: string): string {
  if (!policyCorrectionNotAccountEnabled()) return text;
  return text
    .split("\n")
    .map((line) => line.split(/(?<=[.!?])\s+/).filter((sentence) => !isPolicyCorrection(sentence)).join(" "))
    .join("\n");
}

/*
 * ============================================================================
 * INCIDENT_SPLIT_FIX_ENABLED: THE ACCOUNT IS THE REQUEST'S, IN ITS WHOLE SENTENCES
 * ============================================================================
 *
 * QA, 25 Oct 2026; rebuilt on main after QA's October triage of #189, 10 Nov 2026
 * (production, names invented in the tests):
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
 * sentences ("Dodge, NE" never ends one; "$3.25" none either with
 * DECIMAL_NOT_SENTENCE_END_ENABLED), without the request
 * words, the person's name, where they work or their title, the payroll and
 * prior-coaching answers, or pasted policy text. Only when that turn tells
 * nothing does a later turn's account count; "change what happened to: …"
 * replaces it. Off, the reading above is unchanged.
 */
const STATE_AFTER_PLACE = /\b([A-Za-z][\w'-]*),\s*(ne|ks|mo|ia|sd|nd|mn|wi|il|tx)\b/gi;
const CREATE_REQUEST =
  /\b(?:create|make|need|needs|draft|write|do|start|prepare|issue|give)\b[^.]*?\b(?:ca|c\/a|dpoa|corrective\s+action|write[- ]?up|warning)\b/i;
const REQUEST_LEAD =
  /^.*?\b(?:corrective\s+action(?:\s+form)?|ca(?:\s+form)?|c\/a|dpoa|write[- ]?up|warning)\s+(?:(?:made|done|written(?:\s+up)?|put\s+together|drawn\s+up)\s+)?(?:for|on|against)\s+/i;
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
/** "On the first shift I verbally coached her on our policy": the manager's own coaching is a prior step, never the account. */
const MANAGER_COACHED = /\b(?:i|we)\s+(?:\w+\s+)?coached\s+(?:her|him|them)\b/i;
const ONLY_WHERE = /^(?:she|he|they)\s+(?:is|works)\s+(?:at|in)\s+(?:our\s+|the\s+)?\S+(?:\s+\S+){0,2}$/i;
const ONLY_DATE = /^(?:on\s+)?\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?$/;
const BARE_PLACE = /^(?:in|at)\s+(?:our\s+|the\s+)?[A-Za-z][\w'.-]*(?:\s+[A-Za-z][\w'.-]*){0,3}$/i;
const COURTESY_TAIL = /[,\s]+(?:please|pls|thanks?|thank\s+you)\s*$/i;
const DURATION = /\b\d+\s*(?:min|mins|minutes|hours?|hrs?)\b/i;

/**
 * The lines the intake adds for the fields it read ("It happened on 10/5/2026.", "Warning level: verbal.",
 * "No payroll deduction.", `ai/intake-augment.ts`, `ai/form-state.ts`) and a bare "not her": never the account.
 */
const FIELD_LINE =
  /^(?:it\s+happened\s+(?:on|at)\s+.+|job\s+title:.*|warning\s+level:.*|the\s+employee\s+is\s+.+|payroll\s+deduct(?:ion)?\b.*|no\s+payroll\s+deduction|policy\s+reference:.*|(?:but\s+)?not\s+(?:her|him|them))$/i;

function answersAnotherField(part: string): boolean {
  if (FIELD_LINE.test(part.trim())) return true;
  if (/^(?:please|pls|thanks?|thank\s+you)$/i.test(part)) return true;
  if (MANAGER_COACHED.test(part) && !HAPPENED.test(part)) return true;
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

/** "Tammy Wexley", "Tamsin W": a short clause sharing a word with the person, and saying nothing that happened, is their name as typed. */
function nameVariantOnly(part: string, personWords: ReadonlySet<string>): boolean {
  const words = part.toLowerCase().split(/[^\p{L}'’-]+/u).filter(Boolean);
  if (/^[A-Za-z]\.?$/.test(part.trim())) return true;
  return words.length > 0 && words.length <= 3 && !HAPPENED.test(part) && words.some((word) => personWords.has(word));
}

function accountClauses(sentence: string, personWords: ReadonlySet<string>): string | null {
  const split = sentence.split(
    /\s*,\s*|\s+(?=but\s+not\b)|\s+and\s+(?=(?:she|he|they|was|is|did|has|had|then|no\s+payroll|payroll)\b)|\s+and\s+(?=[A-Za-z][a-z'’-]+\s+[A-Za-z][a-z'’-]+\s+(?:was|is|did|left|opened)\b)/i,
  );
  const parts = withoutOtherPeople(split.map((part) => part.trim()))
    .filter((part) => !IS_NOT.test(part) && !anotherPersonsClause(part, personWords) && !nameVariantOnly(part, personWords))
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
  const sentences = [...protectedTurn.matchAll(decimalNotSentenceEndEnabled() ? SENTENCE_KEEPING_DECIMALS : SENTENCE)].map((match) => match[0].trim().replace(/[.!?]+$/, ""));
  const kept: { account: string; reason: boolean }[] = [];
  for (const raw of sentences) {
    // "create a written on 10/20 for <A>, she was late again": the level request, dated or not, is the request.
    const levelLed = (complaintAccountEnabled() ? raw.replace(LEVEL_RUN_ON_LEAD, "") : raw).replace(LEVEL_REQUEST_LEAD, "");
    let sentence = levelLed;
    let reason = false;
    if (onlyDatesTheAccount(sentence) || CORRECTION_ONLY.test(sentence)) continue;
    if (levelLed === raw && (CREATE_REQUEST.test(sentence) || REQUEST_LEAD.test(sentence))) {
      const led = sentence.replace(REQUEST_LEAD, "");
      if (led === sentence) continue;
      sentence = led;
      // The person named right after "for", then the account: "<name>, she …", "<name> for violating …".
      if (person) {
        const name = new RegExp(`^(?:(?:${[...personWords].map(escapeWord).join("|")})\\b\\s*)+(?:for|about|over|regarding)?\\s*[-—–:,]?\\s*`, "i");
        sentence = sentence.replace(name, "");
      }
      // ISSUE_AFTER_REQUEST_REASON_ENABLED: a for-clause that is only a sales reason gives way to an account after it.
      reason = issueAfterRequestReasonEnabled() && onlySalesReason(sentence);
    }
    if (POLICY_TEXT.test(sentence)) continue;
    const account = accountClauses(sentence, personWords);
    if (!account) continue;
    if (!HAPPENED.test(account) && !describesIncident(account) && kept.length === 0 && !/\bviolat\w*\b/i.test(account)) continue;
    kept.push({ account, reason });
  }
  const told = kept.some((entry) => !entry.reason) ? kept.filter((entry) => !entry.reason) : kept;
  let joined = "";
  for (const { account: sentence } of told) {
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
    // "actually make it a written warning" corrects the level; it is no new request.
    if (CREATE_REQUEST.test(turns[index]!) && !CORRECTION_ONLY.test(turns[index]!.trim())) {
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

export function correctiveActionIssue(rawSaid: string, employeeName: string | null): string | null {
  // POLICY_CORRECTION_NOT_ACCOUNT_ENABLED: "it should be under performance not standard of conduct" is no Issue.
  const said = withoutPolicyCorrections(rawSaid);
  /*
   * PRIOR_SENTENCE_FIX_ENABLED (ported from the sibling app, 26 Oct 2026): on a
   * Corrective Action a held coaching or warning with its date ("coached her
   * 10-16", "i coached her on 10-16 about being late") is a Prior actions row,
   * never the Issue; the incident clause beside it is kept.
   */
  const read = priorSentenceFixFor(said) ? withoutPriorStepClauses(said, businessToday(), said).text : said;
  // LEVEL_STEP_NOT_ACCOUNT_ENABLED: "this should be a written and note a verbal ca was given on 9-1-26" is no Issue.
  const text = levelStepNotAccountEnabled()
    ? read
        .split("\n")
        .map((line) => line.split(/(?<=[.!?])\s+/).map(withoutLevelAndStepClauses).filter(Boolean).join(" "))
        .join("\n")
    : read;
  const fromRequest = issueFromRequest(text, employeeName);
  /*
   * INCIDENT_SPLIT_FIX_ENABLED: the request's account in whole sentences. When it gives none, only the request's own
   * for-clause can be the Issue (never one that only names the person and the store); the whole-sentence reader it
   * replaces would take "… but not for <B>, who spent 40 minutes on the phone" back.
   */
  if (incidentSplitFixEnabled()) {
    const split = splitFixedIssue(text, employeeName);
    if (split) return accountOnly(split, employeeName);
    return fromRequest && !titleAndPlaceOnly(fromRequest, employeeName) ? accountOnly(fromRequest, employeeName) : null;
  }
  const reasonFirst = reasonThenAccount(fromRequest, text, employeeName);
  if (reasonFirst) return reasonFirst;
  // REQUEST_PARTICIPLE_LEAD_ENABLED: a for-clause that is only a sales reason ("under performance") gives way to the account.
  if (requestParticipleLeadEnabled() && fromRequest && salesReasonOnly(fromRequest)) {
    const account = accountIssue(text);
    if (account) return accountOnly(account, employeeName);
  }
  if (!typedNameEnabled()) return accountOnly(fromRequest, employeeName);
  if (fromRequest && !titleAndPlaceOnly(fromRequest, employeeName)) return accountOnly(fromRequest, employeeName);
  return accountOnly(accountIssue(text), employeeName);
}

/**
 * ISSUE_AFTER_REQUEST_REASON_ENABLED: the request's for-clause is only a sales reason and the manager gave an
 * account as well: the account is the Issue. Null otherwise (the callers read the Issue as before).
 */
function reasonThenAccount(fromRequest: string | null, text: string, employeeName: string | null): string | null {
  if (!issueAfterRequestReasonEnabled() || !fromRequest || !onlySalesReason(fromRequest)) return null;
  // Only a request whose for-clause is the reason ("a corrective action for under performance"): "CA for <A>, her
  // sales are low" is an account in the request sentence, and stays the Issue as before (QA's round-5 regression).
  if (![...text.matchAll(SENTENCE)].some((match) => reasonOnlyRequest(withoutLevelRequestLead(match[0].trim())))) return null;
  return accountOnly(accountIssue(text), employeeName);
}

/**
 * SALES_OBSERVATION_ACCOUNT_ENABLED (with SALES_SHORTFALL_OBJECT_ENABLED): the Issue is the account, never the
 * request's own words ("written CA for <name> on performance"); null when nothing else is left. Off, unchanged.
 */
function accountOnly(issue: string | null, employeeName: string | null): string | null {
  if (issue === null) return null;
  // DENIAL_NO_ACCOUNT_ENABLED: "…, not late" only denies a fault; it is no Issue (`forms/denial-no-account.ts`).
  if (onlyDeniesAFault(issue, employeeName)) return null;
  const account = observationAccount(issue, employeeName);
  /*
   * THE REASON ALONE STAYS THE ISSUE (QA's Bubbles round-5 gate, 8 Nov 2026): with SALES_OBSERVATION_ACCOUNT, "I need
   * a corrective action for <A> for under performance" lost its Issue: the reason is request matter when an account
   * may follow, but here nothing else was said, so it is the Issue, as with the flag off.
   */
  if (account === "" && REASON_ALONE.test(issue.trim())) return issue.trim();
  return account === "" ? null : account;
}

/** A request's sales reason and nothing else: "under performance", "performance for october". */
const REASON_ALONE = /^(?:(?:her|his|their|poor|low)\s+)?(?:under[- ]?)?performance(?:\s+(?:for|in|during)\s+(?:the\s+month\s+of\s+)?[a-z]+)?[.!]?$/i;

/**
 * The incident clause the card shows as "Issue", read the way the card reads
 * it with a typed name — the request's for-clause unless it only names the
 * person and the store, else the manager's latest account of what happened —
 * whatever TYPED_NAME_ENABLED says. Null when they gave no account. Used by
 * DRAFT_NEVER_BLANK_ENABLED to write an Observation from the manager's own
 * words; `correctiveActionIssue` is unchanged.
 */
export function managerIncidentClause(rawText: string, employeeName: string | null): string | null {
  const text = withoutPolicyCorrections(rawText);
  const fromRequest = issueFromRequest(text, employeeName);
  const reasonFirst = reasonThenAccount(fromRequest, text, employeeName);
  if (reasonFirst) return reasonFirst;
  if (fromRequest && !titleAndPlaceOnly(fromRequest, employeeName)) return accountOnly(fromRequest, employeeName);
  return accountOnly(accountIssue(text), employeeName);
}

/**
 * The request's own for-clause ("a written warning for cash handling" →
 * "cash handling"), unless it only names the person and the store. Null
 * otherwise. Used by DRAFT_NEVER_BLANK_ENABLED when the manager's account
 * gives no sentence of its own.
 */
export function requestIssueClause(text: string, employeeName: string | null): string | null {
  // ISSUE_AFTER_REQUEST_REASON_ENABLED does not apply here, on purpose: DRAFT_NEVER_BLANK reads this only when the
  // manager's account gives no sentence of its own, so a sales reason ("under performance") is then all there is.
  const fromRequest = issueFromRequest(text, employeeName);
  return fromRequest && !titleAndPlaceOnly(fromRequest, employeeName) ? fromRequest : null;
}
