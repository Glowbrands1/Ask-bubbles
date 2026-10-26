import { CA_POLICY_LABEL, readCaPolicy, STANDARDS_OF_CONDUCT, type CaPolicyName } from "@/lib/forms/ca-policy";
import {
  findManualSection,
  headingKey,
  manualSectionHeadings,
  type ManualChunk,
  type ManualSection,
} from "@/lib/forms/official-policy-manual";
import { readLocationMentions, rosterLocationName } from "@/lib/forms/location-mention";
import { remapIncidentFixEnabled } from "@/lib/config/chat-quality-flags";
import { extractJobTitle, statedJobTitle } from "@/lib/forms/proposal";
import { excerptTextForDisplay } from "@/lib/knowledge/excerpt-brand-filter";
import { US_STATE_CODE } from "@/lib/forms/state-code-place";
import type { KnowledgeCategory, SourceCitation } from "@/types";

import { accountManualSections } from "./account-manual-sections";
import { incidentTurn } from "./incident-clauses";
import { formatManualCitation } from "./policy-citation-fields";

/**
 * REMAP_INCIDENT_FIX_ENABLED: the remap path's What happened, prior actions
 * and policy (24 Oct 2026, prod with FORM_FULL_REMAP on).
 *
 * "create a corrective action form for Test Employee" is the request, not the
 * incident and not the action plan. "previous coaching: jba policy manual
 * 1-1-26, verbal ca 9-1-26" is the prior-action list, not the incident. A
 * policy is "as you said" only when the manager named it. The manual section
 * the account resolves is cited with its printed page, as the intent path
 * does. This app says store, not salon.
 */

export interface RemapManual {
  readonly documentId: string;
  readonly documentTitle: string;
  readonly documentCategory?: string | null;
  readonly chunks: readonly ManualChunk[];
}

const FORM_WORDS = String.raw`(?:corrective\s+actions?|ca|c\/a|write-?ups?|dpoa|coaching\s+form|policy\s+review|follow-?up\s+coaching)(?:\s+forms?)?`;
// REMAP_INCIDENT_FIX_ENABLED: "create a coaching document for …" asks for the
// form too (QA, 25 Oct 2026, conv_mvnt95q52gmu047). Off, the words above.
const FIXED_FORM_WORDS = String.raw`(?:corrective\s+actions?|ca|c\/a|write-?ups?|dpoa|coaching\s+(?:form|document|doc|paperwork)|policy\s+review|follow-?up\s+coaching)(?:\s+forms?)?`;
const LEVEL_WORDS = String.raw`(?:(?:a|an|the)\s+)?(?:new\s+)?(?:(?:verbal|written|final)\s+(?:warning\s+)?)?`;

/** "create a verbal CA for", "write a CA for", "CA for" — only at the start of a clause. */
const requestLeadFor = (formWords: string) =>
  new RegExp(
    String.raw`^\s*(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:(?:i\s+)?(?:need|want)\s+(?:to\s+)?)?(?:(?:create|make|start|open|do|file|write|draft|fill\s+out|put\s+together)\s+(?:me\s+)?)?${LEVEL_WORDS}${formWords}\b\s*(?:for\s+)?`,
    "i",
  );
const MAIN_REQUEST_LEAD = requestLeadFor(FORM_WORDS);
const FIXED_REQUEST_LEAD = requestLeadFor(FIXED_FORM_WORDS);

/** The request lead for the flag state: REMAP_INCIDENT_FIX_ENABLED adds "coaching document". */
function requestLead(): RegExp {
  return remapIncidentFixEnabled() ? FIXED_REQUEST_LEAD : MAIN_REQUEST_LEAD;
}

function formWords(): string {
  return remapIncidentFixEnabled() ? FIXED_FORM_WORDS : FORM_WORDS;
}

/** A whole date: 10-15-26, 10/11, 1/1/2026. Never part of one ("10-1" of "10-15-26"). */
const DATE = String.raw`(?<![\d/-])\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?![\d/-])`;

const STORE_CLAUSE = /^\s*(?:the\s+)?(?:store|location)(?:\s+(?:location|name|number))?\s*(?:is|=|:)\s+/i;

/** "cite animals in the workplace policy" asks about a policy. It is not what happened. */
const POLICY_ASK =
  /^\s*(?:please\s+)?(?:cite|quote|show(?:\s+me)?|look\s+up|pull\s+up|what(?:'s|\s+is|\s+does)|tell\s+me|give\s+me)\b.*\bpolic(?:y|ies)\b/i;

const PAYROLL_STATEMENT =
  /^\s*(?:(?:yes|no)\b[\s,]*)?payroll(?:\s+|-)deduct(?:ion|ed)?\s+(?:does|do|did|is|isn'?t|will|won'?t|applies|apply|not|doesn'?t|should|shall)\b/i;

/**
 * The prior-action list a manager labels "previous coaching: …". The label and
 * its items sit on one line: "jba manual 1-1-26 for previous coaching" then a
 * turn of just "verbal" is no list, so "verbal" is never a prior action (QA,
 * 25 Oct 2026). Only spaces and tabs separate the label from the items.
 */
const PRIOR_LIST =
  /\b(?:previous|prior|past)[^\S\n]+(?:coaching|corrective[^\S\n]+actions?|cas?|c\/as?|actions?|steps?|warnings?|discipline)(?:[^\S\n]+(?:is|was|were|are|includes?|included))?[^\S\n]*[:=-]?[^\S\n]*([^\n]+?)(?=\.(?:\s|$)|\n|$)/gi;

export function withoutPriorList(text: string): string {
  return text.replace(PRIOR_LIST, " ").replace(/\bprior\s*=\s*[^\n.]+/gi, " ");
}

/**
 * "previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26" is two prior
 * actions. The manual shorthand reads as the manual's title, "JBA Policy
 * Manual"; "acknowledgement" is added to it only when the manager typed an
 * acknowledgement word (QA, 25 Oct 2026: no word the manager did not say).
 */
export function priorListActions(text: string): string[] {
  const items: string[] = [];
  for (const match of text.matchAll(PRIOR_LIST)) {
    for (const part of match[1]!.split(/\s*(?:,|;|&|\band\b)\s*/i)) {
      const item = priorItem(part);
      if (item) items.push(item);
    }
  }
  return items;
}

function priorItem(raw: string): string | null {
  let item = raw.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "").replace(/^(?:a|an|the)\s+/i, "");
  if (!item || /^(?:none|no|n\/?a)$/i.test(item)) return null;
  if (/\bmanual\b/i.test(item)) {
    item = item.replace(
      /\b(?:the\s+)?(?:jba\s+)?(?:policy\s+)?manual(?:\s+(ack(?:nowledge?ments?)?|acknowledged|signed|signature|sign[- ]off))?\b/i,
      (_whole, said: string | undefined) => (said ? `JBA Policy Manual ${said}` : "JBA Policy Manual"),
    );
  }
  return item.replace(/\bc\/a\b/gi, "C/A").replace(/\bca\b/gi, "CA");
}

/** Prior actions in the order stated, each once. */
export function mergePriorActions(first: string | null, more: readonly string[]): string | null {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of [...(first ? first.split("\n") : []), ...more]) {
    const clean = line.replace(/\s+/g, " ").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    lines.push(clean);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * What happened, from the manager's turns. The request, the employee, the
 * store, the slot answers and the prior-action list are not the incident.
 * A date inside the phrase stays ("missing the 10-15-26 woven deadline"); the
 * incident's own date at the start or end goes ("… on 10-20-26").
 */
export function requestIncident(input: {
  readonly text: string;
  readonly employeeName: string | null;
  readonly slotClause: (clause: string) => boolean;
  /** MANAGER_WORDS_ONLY_ENABLED: see `managerSentence`. */
  readonly managerOnly?: boolean;
}): string | null {
  let found: string | null = null;
  // One turn at a time. An edit or a command ("change the date to 10-22",
  // "name is …", "show draft", "cite standards of conduct …") changes its own
  // field and never What happened; the newest turn that describes an
  // incident is the incident.
  for (const turn of input.text.split("\n")) {
    const offense = turnIncident(turn, input.employeeName, input.slotClause, input.managerOnly ?? false);
    if (offense) found = offense;
  }
  return found;
}

/**
 * MANAGER_WORDS_ONLY_ENABLED (QA, 25 Oct 2026): when neither this reader nor
 * the model's summary gives What happened, the newest sentence about her in
 * the manager's own words, without the request, the name or the store: "She
 * opened the store late at Grand Island" is "She opened the store late". The
 * offense reader leaves a sentence about her to the model's summary, and a
 * summary that copies the sentence is refused as the question itself.
 */
export function sentenceAboutThem(input: {
  readonly text: string;
  readonly employeeName: string | null;
  readonly slotClause: (clause: string) => boolean;
}): string | null {
  let found: string | null = null;
  for (const turn of input.text.split("\n")) {
    const told = turnIncident(turn, input.employeeName, input.slotClause, true, true);
    if (told) found = told;
  }
  return found;
}

function turnIncident(
  turn: string,
  employeeName: string | null,
  slotClause: (clause: string) => boolean,
  managerOnly = false,
  aboutThemOnly = false,
): string | null {
  if (isEditTurn(turn)) return null;
  let found: string | null = null;
  let aboutThem: string | null = null;
  const story: string[] = [];
  // REMAP_INCIDENT_FIX_ENABLED: the payroll reason, prior steps and who/where
  // clauses below. Off, those clauses are read as main reads them (QA-3,
  // 26 Oct 2026: REMAP_DRAFT_SOURCES reads this with the fix off).
  const fix = remapIncidentFixEnabled();
  // INCIDENT_CLAUSE_SPLIT_ENABLED: without the employee facts and policy text, "dodge, ne" kept whole.
  for (const raw of withoutPriorList(incidentTurn(turn, employeeName, { subjectless: true })).split(/[.!?;]+(?=\s|$)/)) {
    const sentence = raw.trim();
    if (!sentence || isEditTurn(sentence) || TALKS_TO_THE_APP.test(sentence) || ASKS_FOR_HELP.test(sentence)) continue;
    const requested = requestLead().test(sentence) || LEVEL_REQUEST.test(sentence);
    let kept = false;
    for (const clause of sentence.split(",")) {
      const text = clause.trim();
      if (!text || slotClause(text) || STORE_CLAUSE.test(text) || POLICY_ASK.test(text)) continue;
      if (!fix && PAYROLL_STATEMENT.test(text)) continue;
      if (PAYROLL_STATEMENT.test(text)) {
        // "$25 will be payroll deducted for late open on 10-21-26": the payroll
        // answer, and after "for" what it is for (conv_mvnt9m172krh73y).
        const reason = /\bfor\s+(?!the\s+(?:amount|total)\b)(.{4,})$/i.exec(text)?.[1];
        const offense = reason ? clauseOffense(reason, employeeName) : null;
        if (offense) found = offense;
        continue;
      }
      // A prior step ("jba manual 1-1-26 for previous coaching", "she was coached
      // on 9-15 for being late") is a prior action, never the incident (QA, 25 Oct
      // 2026, conv_mvnt9by62zckttk, conv_mvnt9uu12rle7pt).
      if (fix && isPriorStep(text)) continue;
      // "create a CA form for test employee at kearney", "team member Test
      // Employee at bellevue": who and where, never the incident (QA, 25 Oct 2026).
      if (fix && onlyWhoOrWhere(text.replace(requestLead(), " ").replace(LEVEL_REQUEST, " ").trim(), employeeName)) continue;
      kept = true;
      const offense = clauseOffense(text, employeeName);
      if (offense) found = offense;
    }
    if (kept && !requested && sentence.split(/\s+/).length >= 3) story.push(sentence);
    if (managerOnly && kept) {
      const told = managerSentence(sentence, employeeName, slotClause);
      if (/^(?:she|he|they)\s+\S+\s+\S/i.test(told)) aboutThem = told;
    }
  }
  // An account of two or more sentences is kept in the manager's words, so
  // both dates and the coaching they already gave stay on the form
  // (conv_mvmzlpox2z7u4c3). One sentence is read down to the offense.
  if (managerOnly) {
    // MANAGER_WORDS_ONLY_ENABLED (QA, 25 Oct 2026): those words without the
    // clauses that only request the form, name the employee or give their
    // place: "She opened the store late at Grand Island. She did not call
    // anyone" is "She opened the store late. She did not call anyone".
    const told = story.map((sentence) => managerSentence(sentence, employeeName, slotClause)).filter(Boolean);
    if (aboutThemOnly) return told.length >= 2 ? null : aboutThem;
    if (told.length >= 2) return told.join(". ");
    return found;
  }
  if (story.length >= 2) return story.join(". ");
  return found;
}

/**
 * MANAGER_WORDS_ONLY_ENABLED (QA, 25 Oct 2026; the same rule as the sibling
 * app): a sentence of the account without the clauses that only request the
 * form, name the employee or give their place (the store, or a job title at a
 * store). Everything else stays word for word. Empty when nothing is left.
 */
function managerSentence(sentence: string, employeeName: string | null, slotClause: (clause: string) => boolean): string {
  const kept: string[] = [];
  let requested = false;
  for (const clause of sentence.split(",")) {
    let text = clause.trim();
    if (!text || slotClause(text) || STORE_CLAUSE.test(text) || PAYROLL_STATEMENT.test(text) || POLICY_ASK.test(text)) continue;
    if (requestLead().test(text) || LEVEL_REQUEST.test(text)) {
      requested = true;
      text = text.replace(requestLead(), " ").replace(LEVEL_REQUEST, " ").replace(/\s+/g, " ").trim();
      if (!text || /^(?:so|to|with|from|because|now)\b/i.test(text)) continue;
      if (onlyNamesThem(text, employeeName) || /^[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2}$/.test(text)) continue;
    }
    if (onlyWhoOrWhere(text, employeeName)) continue;
    text = withoutStore(text);
    // The "for" the dropped request left: "… for opening store late".
    if (requested) text = text.replace(/^(?:for|about|regarding)\s+/i, "");
    if (text) kept.push(text);
  }
  return kept.join(", ");
}

/**
 * A step before this incident: a labelled prior ("previous coaching", "prior
 * verbal"), a coaching she was given ("she was coached on 9-15"), or a policy
 * manual with a date ("jba manual 1-1-26"). A coaching the manager says they
 * held ("I verbally coached her …") is part of their account.
 */
function isPriorStep(clause: string): boolean {
  return (
    /\b(?:previous|prior|past|earlier)\s+(?:coaching|corrective|cas?\b|c\/as?\b|actions?|steps?|warnings?|discipline|verbal|written)/i.test(clause) ||
    /\b(?:was|were|got|been|had\s+been)\s+(?:verbally\s+)?coached\b/i.test(clause) ||
    /\bmanual\b.*(?<![\d/-])\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?![\d/-])/i.test(clause)
  );
}

/** "soap maker at kearney", "Test Employee at Kearney", "the Grand Island store": who and where. */
function onlyWhoOrWhere(clause: string, employeeName: string | null): boolean {
  const text = clause.trim().replace(/[.!?]+$/, "");
  if (!text) return false;
  if (onlyNamesThem(text, employeeName) || isStoreOnly(text)) return true;
  const unplaced = withoutStore(text);
  if (unplaced === text) return false;
  // A store was named: what is left is only the person or their job title.
  const rest = employeeName ? unplaced.replace(new RegExp(escape(employeeName), "ig"), " ").trim() : unplaced;
  if (!rest) return true;
  const words = rest.replace(/^(?:a|an|the|our)\s+/i, "").split(/\s+/);
  if (words.length > 4 || /\b(?:was|is|did|had|has|not)\b/i.test(rest)) return false;
  return Boolean(statedJobTitle(rest) ?? extractJobTitle(rest)) || TITLE_HEAD.test(rest);
}

/** "soap maker", "assistant manager": the last word is a job. */
const TITLE_HEAD = /\b(?:managers?|directors?|makers?|consultants?|supervisors?|leads?|trainers?|coordinators?|specialists?|associates?)$/i;

function onlyNamesThem(text: string, employeeName: string | null): boolean {
  if (!employeeName) return false;
  const rest = text
    .replace(new RegExp(escape(employeeName), "ig"), " ")
    .replace(/\b(?:for|employee|team\s+member)\b/gi, " ")
    .trim();
  return rest === "" && text.trim() !== "";
}

const STORE_FILLER = new Set(["the", "store", "location", "shop", "our"]);

/** Every word is the store's own name ("kearney", "the Grand Island store"). */
function isStoreOnly(text: string): boolean {
  const ids = [...new Set(readLocationMentions(`at ${text}`).flatMap((mention) => mention.locationIds))];
  if (ids.length === 0) return false;
  const storeWords = new Set(
    ids.flatMap((id) => (rosterLocationName(id) ?? "").toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean),
  );
  const words = text.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  return words.length > 0 && words.every((word) => storeWords.has(word) || STORE_FILLER.has(word));
}

/** MANAGER_WORDS_ONLY_ENABLED: a summary that still says "at Grand Island" gives their place. */
export function namesTheirStore(text: string | null | undefined): boolean {
  return Boolean(text) && withoutStore(text!) !== text!.trim();
}

/** "at Grand Island", "at kearney": the store, taken out of the clause. */
function withoutStore(clause: string): string {
  const words = clause.trim().split(/\s+/);
  for (let index = 0; index < words.length - 1; index += 1) {
    if (!/^(?:at|in)$/i.test(words[index]!)) continue;
    for (let length = Math.min(6, words.length - index - 1); length >= 1; length -= 1) {
      const phrase = words.slice(index + 1, index + 1 + length).join(" ");
      const bare = phrase.replace(/[.!?]+$/, "");
      if (!isStoreOnly(bare)) continue;
      const tail = phrase.slice(bare.length);
      const rest = [...words.slice(0, index), ...words.slice(index + 1 + length)].join(" ");
      return withoutStore(`${rest}${tail}`.trim());
    }
  }
  return clause.trim();
}

/** "do verbal for team member …": a level and "for" is a request too. */
const LEVEL_REQUEST =
  /^\s*(?:please\s+)?(?:create|make|start|open|do|file|write|draft)\s+(?:a\s+|an\s+)?(?:verbal|written|final)(?:\s+warning)?\s+for\b/i;

/** "I need to coach an employee": the manager asking for help, not the account. */
const ASKS_FOR_HELP = /^(?:i\s+)?(?:need|want|have|would\s+like)\s+to\s+(?:coach|write\s+up|discipline|document|create|make|do)\b/i;

/** A sentence to the app, not about the employee: "it still would not generate the coaching form". */
const TALKS_TO_THE_APP =
  /\b(?:you|your|bubbles|generate|generated|this\s+conversation|the\s+information|information\s+given)\b/i;

/** An edit or a command: it sets a field, shows the draft, or names the policy. It is not an account. */
const EDIT_TURN = [
  /^(?:please\s+)?(?:change|update|edit|fix|correct|set|switch|replace)\b/i,
  /^(?:(?:her|his|their|the)\s+)?(?:employee(?:'s)?\s+)?(?:full\s+)?name\s+(?:is|should\s+be|=|:)/i,
  /^(?:the\s+)?(?:job\s+title|title|position|role|store|location|date|warning(?:\s+level)?|level)\s+(?:is|should\s+be|=|:)/i,
  /^(?:please\s+)?(?:show|view|see|open|display|preview|send|give\s+me)\b.*\b(?:draft|form|card|edits?)\b/i,
  /^(?:please\s+)?cite\b/i,
  /^(?:this|it|that)\s+(?:is|was)\s+(?:a\s+)?(?:violation|under|against)\b/i,
  /^(?:she|he|they)\s+works?\s+(?:at|in)\b/i,
  /^(?:she|he|they)\s+(?:is|are)\s+(?:at|in|a|an|the)\b/i,
  /^it\s+happened\s+(?:on|at)\s+[^,.;]+[.!]?$/i,
];

export function isEditTurn(turn: string): boolean {
  const text = turn.trim();
  return text !== "" && EDIT_TURN.some((pattern) => pattern.test(text));
}

/**
 * The turn that starts the form now being written. A later create request
 * with its own incident is a new form: What happened, the policy and the
 * action plan are read from that turn on. 0 when there is no such later
 * request.
 */
export function currentRequestStart(input: {
  readonly turns: readonly string[];
  readonly employeeName: string | null;
  readonly slotClause: (clause: string) => boolean;
}): number {
  let requests = 0;
  let start = 0;
  for (const [index, raw] of input.turns.entries()) {
    const turn = raw.replace(STATE_LEAD, "");
    if (!(remapIncidentFixEnabled() ? FIXED_REQUEST_TURN : MAIN_REQUEST_TURN).test(turn.trim())) continue;
    requests += 1;
    if (requests > 1 && requestTellsIncident(turn, input.employeeName, input.slotClause)) start = index;
  }
  return start;
}

/**
 * A later request's own incident. REMAP_INCIDENT_FIX_ENABLED also counts a
 * sentence about them in the manager's words: "create a CA form for Test
 * Employee at kearney, she skipped the disinfect" is a new form, now that
 * "at kearney" is read as where and not as the incident (QA-3, 26 Oct 2026).
 * Off, the offense reader alone, as main.
 */
function requestTellsIncident(turn: string, employeeName: string | null, slotClause: (clause: string) => boolean): boolean {
  if (turnIncident(turn, employeeName, slotClause)) return true;
  if (!remapIncidentFixEnabled()) return false;
  return Boolean(turnIncident(turn, employeeName, slotClause, true) ?? turnIncident(turn, employeeName, slotClause, true, true));
}

/** The state sentences the intent read puts in front of a question ("The employee is …."). */
const STATE_LEAD =
  /^\s*(?:(?:The form is the|The employee is|Job title:|It happened at|It happened on|Warning level:|Payroll amount:|Policy reference:|Incident:|The account continues)[^\n]*?\.(?=\s|$)\s*|(?:Payroll deduct applies|No payroll deduction)\.\s*)+/i;

const requestTurnFor = (formWords: string) =>
  new RegExp(
    String.raw`^\s*(?:please\s+)?(?:(?:create|make|start|open|do|file|write|draft)\s+(?:me\s+)?)?${LEVEL_WORDS}${formWords}\b`,
    "i",
  );
const MAIN_REQUEST_TURN = requestTurnFor(FORM_WORDS);
const FIXED_REQUEST_TURN = requestTurnFor(FIXED_FORM_WORDS);

/** The action plan the manager gave in their own words ("action plan: …"), or null. */
export function statedActionPlan(text: string): string | null {
  let found: string | null = null;
  for (const match of text.matchAll(/\b(?:action\s+plan|the\s+plan)\s*(?:is|will\s+be|:|=|-)\s*([^\n]+?)(?=\.(?:\s|$)|\n|$)/gi)) {
    const plan = match[1]!.trim();
    if (plan) found = plan;
  }
  return found;
}

/**
 * A bare "yes" or "no" answers a yes/no question only when the reply before
 * it asked exactly one question. After a list of questions it answers none.
 */
export function withoutAmbiguousAnswers<T extends { readonly role: string; readonly content: string }>(turns: readonly T[]): T[] {
  return turns.filter((turn, index) => !isAmbiguousAnswer(turns, index));
}

export function isAmbiguousAnswer(turns: readonly { readonly role: string; readonly content: string }[], index: number): boolean {
  const turn = turns[index];
  if (!turn || turn.role !== "user" || !/^(?:yes|no|yeah|yep|yup|nope|y|n)[.!]?$/i.test(turn.content.trim())) return false;
  const asked = [...turns.slice(0, index)].reverse().find((item) => item.role === "assistant");
  if (!asked) return true;
  return openQuestions(asked.content) !== 1;
}

function openQuestions(content: string): number {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\?(?:\*\*)?\s*$/.test(line) || /\?\*\*/.test(line)).length;
}

/** "as you said" only when a word of the value is in a manager turn. */
export function saidInWords(value: string, said: string): boolean {
  const words = value
    .split(/[^A-Za-z']+/)
    .filter((word) => word.length >= 3 && !STATE_CODES.test(word) && !/^(?:the|and|store|salon|location)$/i.test(word));
  if (words.length === 0) return false;
  return words.some((word) => new RegExp(String.raw`\b${escape(word)}\b`, "i").test(said));
}

/** "Test Employee at Grand Island used her cell phone": the capitalized place after "at", read alone. */
export function placeSpans(text: string): string[] {
  return [...text.matchAll(/\bat\s+([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3})/g)].map((match) => `at ${match[1]}`);
}

function clauseOffense(clause: string, employeeName: string | null): string | null {
  let text = clause.replace(requestLead(), " ").replace(LEVEL_REQUEST, " ");
  // "violation is that on 10-16-26 Testy was not measuring and weighing product"
  text = text.replace(/^\s*(?:the\s+)?(?:violation|incident|issue|offen[cs]e|what\s+happened|reason)\s+(?:is|was)(?:\s+that)?\s*[:-]?\s*/i, "");
  // "She was on her cell phone for 30+ minutes at the front desk"
  text = text.replace(/^\s*(?:she|he|they)\s+(?:was|were|has\s+been|have\s+been)\s+/i, "");
  // "Test Employee" anywhere, and "Test" as the subject: "Test was late for shift".
  if (employeeName) {
    text = text.replace(new RegExp(escape(employeeName), "ig"), " ");
    const first = employeeName.trim().split(/\s+/)[0] ?? "";
    if (first.length >= 2) {
      text = text.replace(new RegExp(String.raw`^(\s*(?:on\s+${DATE}\s*,?\s*)?)${escape(first)}\b(?=\s+[a-z])`, "i"), "$1");
    }
  }
  text = text.replace(/\bat\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3}/g, " ");
  text = text.replace(/\buse\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3}\s+as the (?:location|store)\b/gi, " ");
  text = text.replace(/\bcoached on\s+\S+/gi, " ");
  text = text.replace(/\bno payroll\b/gi, " ");
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(new RegExp(String.raw`^(?:on\s+)?${DATE}\s*,?\s*`, "i"), "");
  text = text.replace(new RegExp(String.raw`\s*,?\s*(?:on|at|dated)?\s*${DATE}$`, "i"), "");
  text = text.replace(/^(?:for|about|regarding|re:?)\s+/i, "");
  // "regarding On 10-16-26 Test Employee did not …": the date the lead-in left.
  if (remapIncidentFixEnabled()) text = text.replace(new RegExp(String.raw`^(?:on\s+)?${DATE}\s*,?\s*`, "i"), "");
  // Another spelling of the person as the subject: "Test Employee spent 40 minutes …".
  text = text.replace(/^[A-Z][a-z'-]+\s+[A-Z][a-z'-]+\s+(?=[a-z])/, "");
  text = text.replace(/^(?:was|is|has been)\s+/i, "");
  text = text.replace(/^(?:a|an)\s+(?=\S+\s+\S)/i, "");
  text = text.replace(/^[,\s]+|[,\s.]+$/g, "").replace(/\s+(?:on|at)$/i, "");
  if (!text || text.length > 120) return null;
  if (/^(?:for|a|an|the|form|location|store|draft)$/i.test(text)) return null;
  // "create a coaching document for Test Employee": a repeat request names the
  // person, it is no new incident (QA, 25 Oct 2026, conv_mvnt95q52gmu047).
  if (remapIncidentFixEnabled() && (requestLead().test(clause) || LEVEL_REQUEST.test(clause)) && /^[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2}$/.test(text)) return null;
  // "jba manual 11-1-25" answers the prior-coaching question.
  if (/^(?:the\s+)?(?:jba\s+)?(?:policy\s+)?manual(?:\s+ack\w*)?$/i.test(text)) return null;
  if (/\b(?:she|he|they|i|we)\b/i.test(text)) return null;
  const title = statedJobTitle(text) ?? extractJobTitle(text);
  if (title && title.toLowerCase() === text.toLowerCase()) return null;
  if (/^team members?$/i.test(text)) return null;
  const onDuration = /\bfor\b/i.test(text) ? null : /^on\s+(.+?)\s+(\d+\+?\s*(?:min|mins|minutes|hrs|hours))\b/i.exec(text);
  if (onDuration) {
    const thing = onDuration[1]!.replace(/\s+/g, " ").trim();
    const spaced = onDuration[2]!.replace(/\s+/g, "").replace(/(\d\+?)(?=[a-z])/i, "$1 ");
    return /\buse\b/i.test(thing) ? `${thing} ${spaced}` : `${thing} use ${spaced}`;
  }
  // "out of dress code" keeps "out of": "dress code" alone says the opposite.
  const counted = /^(out of\s+.+?)\s+(\d+)\s+([a-z]+)$/i.exec(text);
  if (counted) return `${counted[1]}, ${counted[2]} ${counted[3]}`;
  return text;
}

/**
 * "create a for for missing the …": the request with its form name lifted
 * out (Ask Bubbles conv_mvnmf1ik2lqkfld, 25 Oct 2026). A request verb and a
 * dangling "for" is never the incident.
 */
const STRIPPED_REQUEST =
  /^(?:please\s+)?(?:create|make|start|open|file|write|draft|do|fill\s+out)\s+(?:me\s+)?(?:(?:a|an|the)\s+)?(?:(?:new|verbal|written|final)\s+)*for\b/i;

/** A summary that is only the request ("create a corrective action form for"), or what is left of it. */
export function isRequestLeftover(summary: string | null | undefined, employeeName: string | null): boolean {
  if (!summary) return false;
  const text = summary.replace(/\s+/g, " ").trim();
  if (!text) return true;
  // The form words as words: "ca" inside "call" or "vacation" is not a form.
  if (
    /^(?:please\s+)?(?:create|make|start|open|file|write|draft|do)\b/i.test(text) &&
    new RegExp(String.raw`\b${formWords()}\b`, "i").test(text)
  ) {
    return true;
  }
  if (STRIPPED_REQUEST.test(text)) return true;
  return clauseOffense(text, employeeName) === null && requestLead().test(text);
}

/**
 * A date cut out of a longer one the manager typed: "5-26" of "10-15-26"
 * (conv_mvnmf1ik2lqkfld). A date the manager typed whole, or one the turns
 * in hand do not show, is not cut.
 */
export function hasCutDate(value: string | null | undefined, said: string): boolean {
  if (!value) return false;
  for (const match of value.matchAll(new RegExp(DATE, "g"))) {
    const date = escape(match[0]);
    const whole = new RegExp(String.raw`(?<![\d/-])${date}(?![\d/-])`).test(said);
    const inside = new RegExp(String.raw`[\d/-]${date}|${date}[\d/-]`).test(said);
    if (inside && !whole) return true;
  }
  return false;
}

const NAMED_POLICY: Record<CaPolicyName, RegExp> = {
  standards_of_conduct: /\bstandards?\s+of\s+conduct\b/i,
  attendance: /\b(?:attendance|tardiness|absenteeism)\b/i,
  under_performance: /\bunder[\s-]*performance\b/i,
  dress_code: /\bdress\s+code\b/i,
  company_policies: /\bcompany\s+polic(?:y|ies)\b/i,
};

/** The policy the manager named in their own words, or null. A policy the reader inferred is not "as you said". */
export function namedPolicy(text: string): string | null {
  const stated = readCaPolicy(text).stated;
  if (!stated) return null;
  return NAMED_POLICY[stated].test(text) ? CA_POLICY_LABEL[stated] : null;
}

/**
 * The manual sections this account cites. The account's own readers first,
 * then the Standards of Conduct the account points at, then the one heading
 * the extraction chose from the manual's own list — only once there is an
 * incident to cite it for. A heading the manual does not carry is not cited.
 */
export function remapManualSections(input: {
  readonly said: string;
  readonly chunks: readonly ManualChunk[];
  /** What happened as read. It is part of the account ("out of dress code" without its date). */
  readonly incident: string | null;
  readonly modelHeading: string | null;
}): ManualSection[] {
  if (input.chunks.length === 0) return [];
  const notes = withoutPriorList(input.said);
  const kept = (sections: readonly ManualSection[]) =>
    sections.filter((section) => section.heading.trim() && headingKey(section.heading) !== "warning");
  const fromAccount = kept(accountManualSections(notes, input.chunks));
  if (fromAccount.length > 0) return fromAccount;
  const fromIncident = input.incident ? kept(accountManualSections(input.incident, input.chunks)) : [];
  if (fromIncident.length > 0) return fromIncident;
  if (readCaPolicy(notes).suggestion === STANDARDS_OF_CONDUCT) {
    const conduct = findManualSection(input.chunks, [CA_POLICY_LABEL.standards_of_conduct]);
    if (conduct) return kept([conduct]);
  }
  if (!input.incident || !input.modelHeading) return [];
  const listed = manualSectionHeadings(input.chunks).find(
    (heading) => headingKey(heading) === headingKey(input.modelHeading!),
  );
  const section = listed ? findManualSection(input.chunks, [listed]) : null;
  return section ? kept([section]) : [];
}

/** The heading list the extraction chooses a policy from. */
export function remapManualHeadings(chunks: readonly ManualChunk[]): string[] {
  return manualSectionHeadings(chunks).filter((heading) => headingKey(heading) !== "warning");
}

/** The card's Policy row. "as you said" only for the policy the manager named. */
export function remapPolicyLine(named: string | null, sections: readonly ManualSection[]): string | null {
  if (sections.length === 0) return named ? `**Policy:** ${named}, as you said` : null;
  const cited = sections.map((section) => formatManualCitation(section.heading, section.page > 0 ? section.page : null));
  const saidIt = named !== null && sections.some((section) => headingKey(section.heading) === headingKey(named));
  if (named && !saidIt) return `**Policy:** ${named}, as you said — ${cited.join("; ")}`;
  return `**Policy:** ${cited.join("; ")}${saidIt ? ", as you said" : ""}`;
}

const CATEGORIES = new Set<string>([
  "policies_compliance",
  "operations",
  "training",
  "leadership_coaching",
  "sales_client_experience",
  "reports_analytics",
  "bonuses_compensation",
  "safety",
  "equipment_procedures",
  "other",
]);

/** One source per cited section with a printed page, from the manual's own chunk. */
export function remapCitations(manual: RemapManual, sections: readonly ManualSection[]): SourceCitation[] {
  const category = (
    manual.documentCategory && CATEGORIES.has(manual.documentCategory) ? manual.documentCategory : "policies_compliance"
  ) as KnowledgeCategory;
  const citations: SourceCitation[] = [];
  for (const section of sections) {
    if (section.page <= 0) continue;
    const chunk = manual.chunks.find((item) => item.chunkIndex === section.chunkIndex);
    citations.push({
      documentId: manual.documentId,
      documentTitle: manual.documentTitle,
      locator: `Page ${section.page}`,
      category,
      excerpt: `${section.heading}. ${excerptTextForDisplay(chunk?.content ?? "", manual.documentTitle)}`.slice(0, 500),
      relevance: 1,
    });
  }
  return citations;
}

// Every US state's code; one list, shared with the create route's re-read.
const STATE_CODES = US_STATE_CODE;

/** "empire, sd" and "Kearney, NE": a state after a place is not Store Director (SD). */
export function withoutStateCodes(text: string): string {
  return text.replace(/,\s*([A-Za-z]{2})\b/g, (whole, code: string) => (STATE_CODES.test(code) ? " " : whole));
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
