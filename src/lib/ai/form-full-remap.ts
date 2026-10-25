import "server-only";

import { CLAUDE_HAIKU_MODEL } from "@/lib/config/models";
import {
  formFullRemapEnabled,
  managerWordsOnlyEnabled,
  notANameGuardEnabled,
  warningLevelManagerOnlyEnabled,
} from "@/lib/config/chat-quality-flags";
import { CA_POLICY_LABEL, readCaPolicy, describedAttendanceKeys, LATE_OPENING_OFFENSE } from "@/lib/forms/ca-policy";
import { matchEmployeeName, wovenCloseNote, type RosterEmployee } from "@/lib/forms/employee-match";
import { listIncidentDates } from "@/lib/forms/form-date-answer";
import { isNotAName, maskNotANameText, saidInReply } from "@/lib/forms/not-a-name";
import { lateOpenOn, mostRecent } from "@/lib/forms/late-open";
import { supportsInlineDraft } from "@/lib/forms/inline-draft";
import { TEMPLATE_SEEDS } from "@/lib/forms/library";
import { readLocationMentions, rosterLocationName } from "@/lib/forms/location-mention";
import { payrollDeductAmount, payrollDeductFromConversation } from "@/lib/forms/payroll-deduct";
import { PAYROLL_DEDUCT_AMOUNT_QUESTION } from "@/lib/forms/payroll-deduct-amount";
import { extractEmployeeNames, extractJobTitle, statedJobTitle } from "@/lib/forms/proposal";
import { spokenDates } from "@/lib/forms/relative-date";
import { detectTemplateIntent } from "@/lib/forms/template-intent";
import { warningLevelFromTurns, managerStatedWarningLevel } from "@/lib/forms/warning-level";
import type { ChatFormProposal } from "@/types";

import { withoutAppLines } from "./app-sentences";
import { callClaudeToolDetailed } from "./call-claude";
import { chatTraceDraft } from "./chat-trace-store";
import { readsAsPolicyPaste, readsAsStatedTitle, spelledAssistant } from "./title-words";
import type { AskResponse } from "./types";

/**
 * One structured read of the whole conversation, mapped onto the form.
 *
 * The model proposes slots. A slot is kept only when the manager's own
 * turns support it. A later turn replaces an earlier one. A blank required
 * field is one short question, and a question already asked is not asked
 * again. An edit continues the same form. A name Woven does not list stays
 * as typed. One close roster name is "Woven has …" under the card.
 *
 * The flag off does not call the model. Sunny's form tool is the same
 * shape (one call, then readers). This app says store, not salon.
 */

const TEMPLATES = ["dpoa", "coaching", "follow-up-coaching", "policy-review"] as const;
type TemplateKey = (typeof TEMPLATES)[number];

const TOOL_NAME = "extract_form_fields";
const MAX_TOKENS = 900;

const POLICY_QUOTE = /\$25\.00\s+via\s+payroll\s+deduction/i;

const QUESTIONS: Record<string, string> = {
  employeeName: "Who is this for?",
  jobTitle: "What is their job title?",
  store: "Which store?",
  incidentDateIso: "Which date should go on the form?",
  observation: "What happened?",
  warningLevel: "Verbal or written?",
  payrollDeduct: "Is payroll deduct applicable?",
  payrollAmount: PAYROLL_DEDUCT_AMOUNT_QUESTION,
  templateKey: "Which form is this?",
};

const SYSTEM = `You read a store manager's whole conversation and call extract_form_fields once.

Fill a field only from what the manager said. Leave it null when they did not say it.
A later message overwrites an earlier one. Do not restart the form.
Copy the employee name exactly as typed. Do not replace it with a roster spelling.
incidentDateIso is YYYY-MM-DD only when they stated a calendar date. "today" is useToday, not a guessed date.
warningLevel is verbal or written only when they said that level. "write up" and "written up" are the form, not a level.
payrollDeduct is yes or no only when they said so. A shortage is not a deduction. payrollAmount is a dollar amount they stated for the deduction, or null. Never copy "$25.00 via payroll deduction" from a policy.
observation and actionPlan are short summaries of what they described. Do not paste their message. Do not add facts, a policy, or the words "as you said". The action plan does not include a dollar amount.
Do not invent a job title, store, policy, or date.`;

export interface FormRemapSlots {
  readonly templateKey: TemplateKey | null;
  readonly employeeName: string | null;
  readonly jobTitle: string | null;
  readonly store: string | null;
  readonly locationId: string | null;
  readonly incidentDateIso: string | null;
  readonly incidentTime: string | null;
  readonly warningLevel: "verbal" | "written" | null;
  readonly payrollDeduct: "yes" | "no" | null;
  readonly payrollAmount: string | null;
  readonly policySection: string | null;
  readonly observation: string | null;
  readonly priorActions: string | null;
  readonly actionPlan: string | null;
  readonly closeMatchNote: string | null;
}

export interface FormRemapCallerResult {
  readonly raw: unknown;
  readonly model: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export type FormRemapCaller = (input: {
  readonly model: string;
  readonly system: string;
  readonly user: string;
}) => Promise<FormRemapCallerResult>;

type Turn = { readonly role: string; readonly content: string };

export function groundFormSlots(input: {
  readonly raw: unknown;
  readonly history: readonly Turn[];
  readonly question: string;
  readonly today: string;
  readonly people: readonly RosterEmployee[];
  readonly continueTemplateKey?: string | null;
  /** Slots already kept for this conversation. A null read must not erase them. */
  readonly saved?: Partial<FormRemapSlots> | null;
}): { slots: FormRemapSlots; response: AskResponse } {
  const managerOnly = managerWordsOnlyEnabled();
  const allTurns = turnsWithQuestion(input.history, input.question);
  const conversation = managerOnly ? managerTurns(allTurns) : allTurns;
  const users = conversation.filter((turn) => turn.role === "user").map((turn) => turn.content);
  const saved = withoutUntypedName(
    input.saved ?? null,
    users,
    conversation.filter((turn) => turn.role === "assistant").map((turn) => turn.content),
  );
  const said = users.join("\n");
  const raw = parseRaw(input.raw);
  const templateKey =
    templateFromUser(said) ??
    (isTemplate(input.continueTemplateKey) ? input.continueTemplateKey : null) ??
    (isTemplate(raw.templateKey) ? raw.templateKey : null);
  const employeeName = groundedName(raw.employeeName, users);
  const jobTitle = managerOnly ? managerTitle(users, raw.employeeName) : groundedTitle(users);
  const store = groundedStore(said);
  const incidentDateIso = groundedDate(said, input.today);
  /*
   * WARNING_LEVEL_MANAGER_ONLY_ENABLED (ported from the sibling app, 24 Oct 2026):
   * the latest level the manager states, with a bare "Yes" counted only after
   * one yes/no question about that exact level; see `managerStatedWarningLevel`.
   */
  const managerWarning = warningLevelManagerOnlyEnabled()
    ? managerStatedWarningLevel(
        conversation.map((turn) => ({ role: turn.role, content: withoutWriteUps(turn.content) })),
        input.today,
      )
    : null;
  const warningLevel = managerWarning ?? explicitWarning(users, input.today);
  const payrollDeduct = payrollDeductFromConversation(conversation);
  const payrollAmount = payrollDeduct === "yes" ? managerPayrollAmount(said) : null;
  const policySection = groundedPolicy(said);
  const observation = statedIncident(said, employeeName, managerOnly) ?? acceptSummary(raw.observation, said);
  const priorActions = statedPrior(said);
  const incidentTime = statedTime(said);
  const actionPlan = acceptSummary(stripMoney(raw.actionPlan ?? ""), said);
  const closeMatchNote = employeeName ? closeNote(employeeName, input.people) : null;

  const read: FormRemapSlots = {
    templateKey,
    employeeName,
    jobTitle,
    store: store?.name ?? null,
    locationId: store?.id ?? null,
    incidentDateIso,
    incidentTime,
    warningLevel: warningLevel === "verbal" || warningLevel === "written" ? warningLevel : null,
    payrollDeduct,
    payrollAmount,
    policySection,
    observation,
    priorActions,
    actionPlan,
    closeMatchNote,
  };
  /*
   * RE-READ EVERY TURN (WARNING_LEVEL_MANAGER_ONLY_ENABLED; ported from Ask
   * Sunny, QA 24 Oct 2026): the level is what the manager's turns state now,
   * and a saved one is kept only when the history may have been cut — so a
   * level the manager never stated cannot ride on from an earlier extraction.
   */
  // Every turn counts toward the cap, also one that held only the app's lines (MANAGER_WORDS_ONLY_ENABLED).
  const savedSlots =
    warningLevelManagerOnlyEnabled() && saved && allTurns.length < HISTORY_CAP
      ? { ...saved, warningLevel: null }
      : saved;
  const slots = finishSlots(mergeSlots(read, savedSlots), said);

  const assistants = [...input.history, { role: "user", content: input.question }]
    .filter((turn) => turn.role === "assistant")
    .map((turn) => turn.content);
  const questions = questionsFor(slots, assistants);
  const content = renderReply(slots, questions);
  const response: AskResponse = {
    content,
    citations: [],
    ...(slots.templateKey ? { formProposal: proposalFor(slots) } : {}),
  };
  return { slots, response };
}

/**
 * A form turn is one the library already calls a form, or field notes
 * ("verbal", "no payroll", "prior ="). A question about the policy is not.
 */
export function remapShouldRun(input: {
  readonly question: string;
  readonly history: readonly { role: string; content: string }[];
  readonly formsTurn: boolean;
}): boolean {
  if (asksAboutCorrectiveAction(input.question)) return false;
  if (input.formsTurn) return true;
  if (asksAQuestion(input.question)) return false;
  const text = [input.question, ...input.history.filter((turn) => turn.role === "user").map((turn) => turn.content)].join("\n");
  return /\b(?:verbal|written|warning|corrective|write-?ups?|payroll|prior\s*=)\b/i.test(text);
}

function asksAQuestion(question: string): boolean {
  return /\?\s*$/.test(question.trim()) && /\b(?:what|how|when|where|who|why|can|does|do|is)\b/i.test(question);
}

/**
 * "what does a verbal CA mean?" names the form and asks about it. The spoken
 * intent made it a forms turn, and the remap answered with a Corrective
 * Action Form whose "What happened" was the question (QA F4, 24 Oct 2026).
 * The template reader already says nothing is to be started, so the turn
 * goes to the form proposal, which hands it to the knowledge base.
 */
function asksAboutCorrectiveAction(question: string): boolean {
  if (!asksAQuestion(question)) return false;
  const intent = detectTemplateIntent(question);
  return intent.kind === "corrective_action" && !intent.requestedCreation;
}

export async function remapFormTurn(
  input: {
    readonly history: readonly Turn[];
    readonly question: string;
    readonly today: string;
    readonly people: readonly RosterEmployee[];
    readonly continueTemplateKey?: string | null;
    readonly saved?: Partial<FormRemapSlots> | null;
  },
  call: FormRemapCaller = defaultCall,
): Promise<AskResponse | null> {
  if (!formFullRemapEnabled()) return null;
  const started = Date.now();
  let result: FormRemapCallerResult;
  try {
    result = await call({
      model: CLAUDE_HAIKU_MODEL,
      system: SYSTEM,
      user: managerWordsOnlyEnabled()
        ? conversationText(managerTurns(input.history), withoutAppLines(input.question), input.today)
        : conversationText(input.history, input.question, input.today),
    });
  } catch {
    return null;
  }
  const grounded = groundFormSlots({ ...input, raw: result.raw, saved: input.saved ?? null });
  noteExtraction({
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs: Date.now() - started,
    slots: grounded.slots,
  });
  return grounded.response;
}

function noteExtraction(input: {
  readonly model: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly latencyMs: number;
  readonly slots: FormRemapSlots;
}): void {
  const draft = chatTraceDraft();
  if (!draft) return;
  const slots = { ...input.slots };
  draft.formExtraction = {
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    slots,
  };
  if (!draft.modelCall) {
    draft.modelCall = {
      model: input.model,
      maxTokens: MAX_TOKENS,
      stopReason: "tool_use",
      latencyMs: input.latencyMs,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      thinkingTokens: null,
      cacheCreationInputTokens: null,
      cacheReadInputTokens: null,
      firstTokenMs: null,
      errorSubtype: null,
      errorClass: null,
      errorStatus: null,
      retryable: false,
      retried: false,
    };
  }
}

async function defaultCall(input: { model: string; system: string; user: string }): Promise<FormRemapCallerResult> {
  const detailed = await callClaudeToolDetailed({
    model: input.model,
    system: input.system,
    maxTokens: MAX_TOKENS,
    tool: { name: TOOL_NAME, description: "Form fields the manager has stated.", input_schema: TOOL_SCHEMA },
    messages: [{ role: "user", content: input.user }],
  });
  return { raw: detailed.input, model: input.model, inputTokens: detailed.inputTokens, outputTokens: detailed.outputTokens };
}

function conversationText(history: readonly Turn[], question: string, today: string): string {
  const turns = [...history, { role: "user", content: question }]
    .filter((turn) => turn.content.trim() !== "")
    .map((turn) => `${turn.role === "assistant" ? "Bubbles" : "Manager"}: ${turn.content.trim().slice(0, 2000)}`);
  return `Today is ${today}.\n\n${turns.join("\n\n")}`;
}

/**
 * The current question is already the last user turn when the client or the
 * history table appended it before this read. Counting it twice stacked the
 * prior-action line on that turn. The next turn read the line once, and the
 * duplicate collapsed.
 */
function turnsWithQuestion(history: readonly Turn[], question: string): Turn[] {
  const turns = [...history, { role: "user", content: question }].filter((turn) => turn.content.trim() !== "");
  const last = turns.at(-1);
  const before = turns.at(-2);
  if (last && before && last.role === "user" && before.role === "user" && last.content === before.content) {
    turns.pop();
  }
  return turns;
}

interface RawSlots {
  readonly templateKey: string | null;
  readonly employeeName: string | null;
  readonly observation: string | null;
  readonly actionPlan: string | null;
}

function parseRaw(input: unknown): RawSlots {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    templateKey: str(record.templateKey),
    employeeName: str(record.employeeName),
    observation: str(record.observation),
    actionPlan: str(record.actionPlan),
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isTemplate(value: string | null | undefined): value is TemplateKey {
  return typeof value === "string" && (TEMPLATES as readonly string[]).includes(value);
}

function templateFromUser(text: string): TemplateKey | null {
  // A named form wins, last one typed. "Create a Coaching Form" stays that
  // form even if the note also says "verbal". "coached on the 2nd" is a prior
  // step, not a request for the Coaching Form.
  const named: { index: number; key: TemplateKey }[] = [];
  const add = (re: RegExp, key: TemplateKey) => {
    for (const match of text.matchAll(re)) named.push({ index: match.index ?? 0, key });
  };
  add(/\bfollow[- ]up coaching\b/gi, "follow-up-coaching");
  add(/\bpolicy review\b/gi, "policy-review");
  add(/\bcorrective actions?\b|\bwrite-?ups?\b|\bwritten up\b|\bca\b|\bc\/a\b|\bdpoa\b/gi, "dpoa");
  add(/\bcoaching form\b/gi, "coaching");
  if (named.length > 0) {
    named.sort((a, b) => a.index - b.index);
    return named.at(-1)!.key;
  }
  // No form was named. A discipline word is the Corrective Action Form.
  if (/\b(?:verbal|written|warnings?|final\s+warnings?|terminations?|demotions?)\b/i.test(text)) return "dpoa";
  if (/\bcoaching\b/i.test(text)) return "coaching";
  return null;
}

/**
 * NOT_A_NAME_GUARD_ENABLED: a kept employee that came from a reply is not
 * kept again (the sibling app's QA L23: a name read from a manual heading in a reply
 * outlived the name the manager typed). Only on evidence: not a name at all,
 * or an assistant turn in the window says it (other than as a card's subject)
 * and none of the manager's turns do. With
 * no evidence (a name typed before the 20-turn window) it stays. Off, the
 * kept slots are unchanged.
 */
function withoutUntypedName(
  saved: Partial<FormRemapSlots> | null,
  turns: readonly string[],
  replies: readonly string[],
): Partial<FormRemapSlots> | null {
  const name = saved?.employeeName ?? null;
  if (!saved || !name || !notANameGuardEnabled()) return saved;
  const needle = name.trim().toLowerCase().replace(/\s+/g, " ");
  const said = (text: string) => text.toLowerCase().replace(/\s+/g, " ").includes(needle);
  const typed = turns.some((turn) => said(maskNotANameText(turn)));
  const fromReply = !typed && saidInReply(replies, name);
  if (!isNotAName(name) && !fromReply) return saved;
  return { ...saved, employeeName: null, closeMatchNote: null };
}

function groundedName(proposed: string | null, turns: readonly string[]): string | null {
  // NOT_A_NAME_GUARD_ENABLED: the model's name is looked for outside a
  // bulleted or priced offer list, so an offer it copied is not found.
  const spoken = notANameGuardEnabled() ? turns.map((turn) => maskNotANameText(turn)) : turns;
  const said = spoken.join("\n");
  const latest = spoken.at(-1) ?? "";
  // NOT_A_NAME_GUARD_ENABLED: "blank", a product, a store's city or a verb
  // phrase is not the employee, even when the manager typed those words.
  if (proposed && isNotAName(proposed)) proposed = null;
  if (proposed) {
    const inLatest = exactSlice(latest, proposed);
    if (inLatest) return inLatest;
    const inSaid = exactSlice(said, proposed);
    if (inSaid) return inSaid;
  }
  let found: string | null = null;
  for (const turn of turns) {
    const person = personPhrase(notANameGuardEnabled() ? maskNotANameText(turn) : turn);
    if (person && !isNotAName(person)) found = person;
  }
  return found;
}

/** "for Test Employee" and "Test Employee at Grand Island". Not "Use Kearney as the location". */
function personPhrase(turn: string): string | null {
  if (/\bas the location\b/i.test(turn)) return null;
  const named = /\bfor\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)/.exec(turn);
  if (named) return named[1]!;
  const leading = /^([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)+)\s+at\b/.exec(turn.trim());
  if (leading) return leading[1]!;
  const names = extractEmployeeNames(turn);
  if (names.length === 1) return exactSlice(turn, names[0]!) ?? names[0]!;
  return null;
}

function exactSlice(haystack: string, needle: string): string | null {
  const at = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return null;
  return haystack.slice(at, at + needle.length);
}

/**
 * The manager's turns without the lines the app wrote onto the question
 * ("Job title: CA. It happened at Kearney, NE."). A turn that was only those
 * lines is gone.
 */
function managerTurns(turns: readonly Turn[]): Turn[] {
  return turns
    .map((turn) => (turn.role === "user" ? { role: turn.role, content: withoutAppLines(turn.content) } : turn))
    .filter((turn) => turn.content.trim() !== "");
}

/**
 * The title from the manager's turns: not a pasted policy ("District Managers
 * will be responsible …"), "ass't" spelled out, and a labelled phrase only
 * when it reads as a title ("test was late opening store" is a clause).
 */
function managerTitle(turns: readonly string[], employeeName: string | null): string | null {
  const read = turns.filter((turn) => !readsAsPolicyPaste(turn)).map(spelledAssistant);
  const title = groundedTitle(read);
  if (!title || extractJobTitle(title)) return title;
  const said = read.join("\n");
  return readsAsStatedTitle({ probe: title, text: said, employeeName, knownTitle: extractJobTitle }) ? title : null;
}

function groundedTitle(turns: readonly string[]): string | null {
  let title: string | null = null;
  for (const turn of turns) {
    if (/^(?:verbal|written|yes|no|yeah|nope)[.!\s]*$/i.test(turn.trim())) continue;
    const found = statedJobTitle(turn) ?? extractJobTitle(turn);
    if (!found || /^(?:verbal|written)$/i.test(found)) continue;
    title = found;
  }
  return title;
}

function groundedStore(text: string): { id: string; name: string } | null {
  const change = [...text.matchAll(/\bchange store to\s+([A-Za-z][A-Za-z .'-]{1,40})/gi)].at(-1);
  const focus = change ? `at ${change[1]!.trim()}` : text;
  const mentions = readLocationMentions(focus).filter((mention) => !mention.confirm && mention.locationIds.length === 1);
  const last = mentions.at(-1);
  if (!last) return null;
  const id = last.locationIds[0]!;
  const name = rosterLocationName(id);
  return name ? { id, name } : null;
}

function groundedDate(text: string, today: string): string | null {
  // LATE_OPEN_DATE_ENABLED: the newest date the manager typed, dashed or not.
  const newest = lateOpenOn() ? newestDate(text, today) : null;
  if (newest) return newest;
  const found = listIncidentDates(text, today).filter((item) => !dateIsPrior(text, item.index));
  const calendar = [...new Set(found.map((item) => item.iso))];
  // One incident date, or the later one when they correct it. A prior step's
  // date ("manual ack 9/01") is not this form's date and must not wipe it.
  if (calendar.length >= 1) return calendar.at(-1)!;
  // "10-20" with no year is 20 October when it is not a duration ("10-20 min").
  const dashed = dashedMonthDay(text, today);
  if (dashed) return dashed;
  if (/\b(?:use\s+)?today'?s\s+date\b/i.test(text)) return today;
  // spokenDates also returns every calendar date. Those were already decided
  // above, including a prior-step date that must stay off the form. This
  // fallback is only a relative day ("yesterday", "last Friday").
  const spoken = [
    ...new Set(
      spokenDates(text, today)
        .filter((item) => {
          if (!item.iso || item.iso === today || dateIsPrior(text, item.index)) return false;
          return !calendarPhrase(item.phrase);
        })
        .map((item) => item.iso as string),
    ),
  ];
  return spoken.length === 1 ? spoken[0]! : null;
}

/** "9/01" and "October 20". Not "yesterday" or "2 days ago". */
function calendarPhrase(phrase: string): boolean {
  return /\d{4}-\d{2}-\d{2}|\d{1,2}[/. -]\d{1,2}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i.test(
    phrase,
  );
}

/** A date that belongs to an earlier step, not the form being written. */
function dateIsPrior(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 80), index);
  const clause = before.slice(Math.max(before.search(/[^.;\n]*$/), 0));
  return /\b(?:prior|previous|coached\s+on|manual\s+ack|already|got|received)\b/i.test(clause);
}

/** "write up" and "written up" are the form, not a level. */
function withoutWriteUps(text: string): string {
  return text.replace(/\bwrit(?:e|ing|ten)\s+ups?\b/gi, " ");
}

/** `LIMITS.historyTurns` in `lib/api/validation.ts`: a longer history may have been cut. */
const HISTORY_CAP = 20;

function explicitWarning(turns: readonly string[], today: string): "verbal" | "written" | null {
  const cleaned = turns.map(withoutWriteUps);
  const fromReader = warningLevelFromTurns(cleaned, today);
  if (fromReader === "verbal" || fromReader === "written") return fromReader;
  let level: "verbal" | "written" | null = null;
  for (const turn of cleaned) {
    for (const sentence of turn.split(/[.\n;]+/)) {
      for (const clause of sentence.split(",")) {
        if (!/^\s*(?:a\s+)?(verbal|written)\s+warnings?\s*$/i.test(clause) && !/^\s*(verbal|written)\s*$/i.test(clause)) {
          continue;
        }
        level = /written/i.test(clause) ? "written" : "verbal";
      }
    }
  }
  return level;
}

/**
 * THE NEWEST DATE WINS (QA, 24 Oct 2026; LATE_OPEN_DATE_ENABLED). "change the
 * date to 10-22" after "was late to open the store 10-19-26" kept 19 October:
 * a dated calendar date always beat a yearless one, wherever it was typed.
 * Now the later of the two in the manager's words dates the form, and a
 * yearless "10-22" is the most recent 22 October, never a future one.
 */
function newestDate(text: string, today: string): string | null {
  const calendar = listIncidentDates(text, today)
    .filter((item) => !dateIsPrior(text, item.index))
    .map((item) => ({ iso: item.iso, index: item.index }));
  const dashed = dashedMonthDays(text, today).map((item) => ({
    iso: mostRecent(item.month, item.day, today) ?? item.iso,
    index: item.index,
  }));
  const all = [...calendar, ...dashed].sort((a, b) => a.index - b.index);
  return all.at(-1)?.iso ?? null;
}

/** Every "10-20" that is a month and day, with where it sits. Same rules as `dashedMonthDay`. */
function dashedMonthDays(text: string, today: string): { iso: string; index: number; month: number; day: number }[] {
  const year = Number(/^(\d{4})-/.exec(today)?.[1]);
  if (!Number.isFinite(year)) return [];
  const found: { iso: string; index: number; month: number; day: number }[] = [];
  // Not "10-1" out of "10-19-26": the day takes every digit, and a year after it is a calendar date.
  for (const match of text.matchAll(/(?<![\d-])(\d{1,2})-(\d{1,2})(?!\d|-\d)/g)) {
    const index = match.index ?? 0;
    const after = text.slice(index + match[0].length, index + match[0].length + 16);
    if (/^\s*(?:min|mins|minutes|hrs|hours|hr)\b/i.test(after)) continue;
    const before = text.slice(Math.max(0, index - 16), index);
    if (/\btime\s*[:=]?\s*$/i.test(before)) continue;
    if (dateIsPrior(text, index)) continue;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const iso = monthDayIso(year, month, day);
    if (iso) found.push({ iso, index, month, day });
  }
  return found;
}

/** "10-20" is 20 October. "10-20 min" and "time 10-20" are not dates. */
function dashedMonthDay(text: string, today: string): string | null {
  const year = Number(/^(\d{4})-/.exec(today)?.[1]);
  if (!Number.isFinite(year)) return null;
  let found: string | null = null;
  for (const match of text.matchAll(/(?<![\d-])(\d{1,2})-(\d{1,2})(?!-\d)/g)) {
    const index = match.index ?? 0;
    const after = text.slice(index + match[0].length, index + match[0].length + 16);
    if (/^\s*(?:min|mins|minutes|hrs|hours|hr)\b/i.test(after)) continue;
    const before = text.slice(Math.max(0, index - 16), index);
    if (/\btime\s*[:=]?\s*$/i.test(before)) continue;
    if (dateIsPrior(text, index)) continue;
    const iso = monthDayIso(year, Number(match[1]), Number(match[2]));
    if (iso) found = iso;
  }
  return found;
}

function monthDayIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function managerPayrollAmount(text: string): string | null {
  const stripped = text.replace(POLICY_QUOTE, " ");
  return payrollDeductAmount(stripped) ?? clausePayrollAmount(stripped);
}

function clausePayrollAmount(text: string): string | null {
  let found: string | null = null;
  for (const clause of text.split(/[.;\n]|\s+but\s+/i)) {
    if (!/\bpayroll\b|\bdeduct/i.test(clause)) continue;
    const amounts = [...clause.matchAll(/\$\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/g)];
    const last = amounts.at(-1);
    if (!last) continue;
    const amount = last[0]!.replace(/\s+/g, "");
    if (Number(amount.replace(/[$,]/g, "")) === 0) continue;
    found = amount.startsWith("$") ? amount : `$${amount}`;
  }
  return found;
}

function groundedPolicy(text: string): string | null {
  const reading = readCaPolicy(text);
  if (reading.stated) return CA_POLICY_LABEL[reading.stated];
  // "late to open", "late opening", "opened late": the manual's Late Opening
  // section, which this card did not name (QA, 24 Oct 2026; LATE_OPEN_DATE_ENABLED).
  if (lateOpenOn() && describedAttendanceKeys(text)?.includes(LATE_OPENING_OFFENSE)) return "Late Opening";
  return null;
}

function acceptSummary(summary: string | null, said: string): string | null {
  if (!summary) return null;
  const clean = summary.replace(/\s+/g, " ").trim();
  if (!clean || /as you said/i.test(clean)) return null;
  const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const summaryNorm = norm(clean);
  const saidNorm = norm(said);
  if (!summaryNorm || summaryNorm === saidNorm) return null;
  if (saidNorm.split("\n").some((line) => norm(line) === summaryNorm)) return null;
  const words = summaryNorm.split(/[^a-z0-9$]+/).filter((word) => word.length > 4);
  if (words.some((word) => !saidNorm.includes(word))) return null;
  return clean;
}

function stripMoney(text: string): string {
  return text.replace(/\$\s?\d[\d,]*(?:\.\d{2})?/g, " ").replace(/\s{2,}/g, " ").trim();
}

function closeNote(name: string, people: readonly RosterEmployee[]): string | null {
  const match = matchEmployeeName(name, people);
  if (match.kind === "unchecked" && match.closeName) return wovenCloseNote(match.closeName);
  if (match.kind === "confirm" && match.candidates.length === 1) return wovenCloseNote(match.candidates[0]!.name);
  return null;
}

/**
 * The offense, once the name, store, date, and slot answers are out of the way.
 * A full sentence ("She left the register drawer open") stays with the model's
 * summary. A note ("out of dress code 3 shifts", "on cell phone 30+ min") is
 * the issue itself.
 */
function statedIncident(text: string, employeeName: string | null, managerOnly = false): string | null {
  const clauses = text.split(/[\n,;]+/).map((clause) => clause.trim()).filter(Boolean);
  let found: string | null = null;
  for (const clause of clauses) {
    if (slotClause(clause)) continue;
    if (managerOnly && namesOrPlacesThem(clause)) continue;
    const offense = phraseOffense(stripSlots(clause, employeeName));
    if (offense) found = offense;
  }
  return found;
}

function stripSlots(clause: string, employeeName: string | null): string {
  let text = clause;
  text = text.replace(/\b(?:verbal|written)\s+(?:ca|c\/a|corrective actions?)\b/gi, " ");
  text = text.replace(/\b(?:create\s+a\s+)?(?:corrective actions?|coaching form|write-?ups?|ca|c\/a)\s+for\s+/gi, " ");
  if (employeeName) {
    text = text.replace(new RegExp(employeeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  }
  text = text.replace(/^\s*[A-Z][\w'.-]+\s+[A-Z][\w'.-]+\s+(?=at\b|out of\b)/, "");
  text = text.replace(/\bat\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3}/g, " ");
  text = text.replace(/\buse\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3}\s+as the location\b/gi, " ");
  text = text.replace(/\bprior\s*=\s*[^,]+/gi, " ");
  text = text.replace(/\bcoached on\s+\S+/gi, " ");
  text = text.replace(/\bno payroll\b/gi, " ");
  return text;
}

function phraseOffense(clause: string): string | null {
  let text = clause.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ");
  text = text.replace(/(?<![\d-])\d{1,2}-\d{1,2}(?!-\d)(?!\s*(?:min|mins|minutes|hrs|hours|hr)\b)/g, " ");
  text = text.replace(/\s+/g, " ").trim().replace(/^[,\s]+|[,\s.]+$/g, "");
  // "register short $40 on 10-20" leaves "on" behind once the date is lifted.
  text = text.replace(/\s+(?:on|at)$/i, "");
  if (!text || text.length > 80) return null;
  if (/\b(?:she|he|they|i|we)\b/i.test(text)) return null;
  const title = statedJobTitle(text) ?? extractJobTitle(text);
  if (title && title.toLowerCase() === text.toLowerCase()) return null;
  const onDuration = /^on\s+(.+?)\s+(\d+\+?\s*(?:min|mins|minutes|hrs|hours))\b/i.exec(text);
  if (onDuration) {
    const thing = onDuration[1]!.replace(/\s+/g, " ").trim();
    const duration = onDuration[2]!.replace(/\s+/g, "");
    const spaced = duration.replace(/(\d\+?)(?=[a-z])/i, "$1 ");
    return /\buse\b/i.test(thing) ? `${thing} ${spaced}` : `${thing} use ${spaced}`;
  }
  const outOf = /^out of\s+(.+)$/i.exec(text);
  if (outOf) {
    const rest = outOf[1]!.trim();
    const counted = /^(.+?)\s+(\d+)\s+([a-z]+)$/i.exec(rest);
    if (counted) return `${counted[1]}, ${counted[2]} ${counted[3]}`;
    return rest;
  }
  return text;
}

/**
 * "Her name is Test Employee" and "Test Employee works at Grand Island" say
 * who and where. They are not what happened.
 */
function namesOrPlacesThem(clause: string): boolean {
  const text = clause.trim();
  if (/^(?:(?:her|his|their|the employee'?s|employee'?s?)\s+)?(?:full\s+)?name\s+is\b/i.test(text)) return true;
  return /^(?:[A-Za-z'’-]+(?:\s+[A-Za-z'’-]+)?\s+)?(?:works|worked|is based|is assigned|is working)\s+(?:at|in|out of|from)\s+(?:the\s+)?[^.!?]{1,40}[.!]?$/i.test(
    text,
  );
}

const PAYROLL_ANSWER_ONLY =
  /^(?:(?:yes|no|yeah|nope|y|n)\b[\s,.!-]*)?payroll(?:\s+|-)deduct(?:ion|ed|s)?(?:\s+(?:of\s+)?\$?\d{1,6}(?:\.\d{1,2})?)?(?:\s+(?:applies|applicable|apply|is\s+applicable|does\s+not\s+apply|doesn'?t\s+apply|not\s+applicable|n\/?a|yes|no))?[\s.!]*$/i;

const STATE_NAMES =
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming";
const STATE_ONLY = new RegExp(
  `^(?:A[LKZR]|C[AOT]|DE|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY]|${STATE_NAMES})\\.?$`,
  "i",
);

function slotClause(clause: string): boolean {
  const text = clause.trim();
  if (/^(?:verbal|written|yes|no|yeah|nope)[.!]?\s*$/i.test(text)) return true;
  // "Create a Coaching Form" names the form. It is not what happened.
  if (
    /^(?:please\s+)?(?:create|make|start|open|do|file|write)\s+(?:a\s+|an\s+|the\s+)?(?:coaching form|corrective action(?: form)?|write-?up|ca|c\/a|dpoa|policy review|follow-?up coaching(?: form)?)\s*[.!]?\s*$/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/^\s*coached on\b/i.test(text)) return true;
  if (/\bprior\s*=/i.test(text)) return true;
  if (/\bno payroll\b/i.test(text) && text.split(/\s+/).length <= 6) return true;
  // "payroll deduct $40 applies" and "yes payroll deduct" answer the payroll
  // question. Read as the incident, they replaced "register short $40". Only
  // a clause that is nothing but that answer: "falsified payroll deduct
  // paperwork" and "payroll deduct for missing cash $40" are offenses (QA).
  if (PAYROLL_ANSWER_ONLY.test(text)) return true;
  // "at Dodge, NE": a clause that is only the store's state is not what happened.
  if (STATE_ONLY.test(text)) return true;
  if (/\buse\s+.+\bas the location\b/i.test(text)) return true;
  return false;
}

function statedPrior(text: string): string | null {
  const hits: string[] = [];
  for (const match of text.matchAll(/\bprior\s*=\s*([^,\n.]+)/gi)) {
    hits.push(match[1]!.trim().replace(/\back\b/gi, "acknowledgement"));
  }
  for (const match of text.matchAll(/\bcoached on\s+(\S+)/gi)) hits.push(`coached on ${match[1]}`);
  return hits.length > 0 ? hits.join("\n") : null;
}

/** A labelled time ("time 10:20"). A bare "10-20" is a month and day. */
function statedTime(text: string): string | null {
  const labelled = /\btime\s*[:=]?\s*(\d{1,2}[:.-]\d{2})\b/i.exec(text);
  return labelled?.[1] ?? null;
}

const SLOT_KEYS = [
  "templateKey",
  "employeeName",
  "jobTitle",
  "store",
  "locationId",
  "incidentDateIso",
  "incidentTime",
  "warningLevel",
  "payrollDeduct",
  "payrollAmount",
  "policySection",
  "observation",
  "priorActions",
  "actionPlan",
  "closeMatchNote",
] as const satisfies readonly (keyof FormRemapSlots)[];

/** A later value replaces the same field. A blank read leaves the saved one. */
function mergeSlots(next: FormRemapSlots, saved: Partial<FormRemapSlots> | null): FormRemapSlots {
  if (!saved) return next;
  const merged: Record<string, FormRemapSlots[keyof FormRemapSlots]> = { ...next };
  for (const key of SLOT_KEYS) {
    if (merged[key] == null && saved[key] != null) merged[key] = saved[key];
  }
  return merged as unknown as FormRemapSlots;
}

function finishSlots(slots: FormRemapSlots, said: string): FormRemapSlots {
  if (slots.templateKey !== "dpoa") {
    return { ...slots, warningLevel: null, payrollDeduct: null, payrollAmount: null };
  }
  return {
    ...slots,
    payrollAmount: slots.payrollDeduct === "yes" ? (slots.payrollAmount ?? managerPayrollAmount(said)) : null,
  };
}

function questionsFor(slots: FormRemapSlots, assistants: readonly string[]): string[] {
  const needed: string[] = [];
  if (!slots.templateKey) needed.push("templateKey");
  else {
    for (const key of ["employeeName", "jobTitle", "store", "incidentDateIso", "observation"] as const) {
      if (!slots[key]) needed.push(key);
    }
    if (slots.templateKey === "dpoa") {
      if (!slots.warningLevel) needed.push("warningLevel");
      if (!slots.payrollDeduct) needed.push("payrollDeduct");
      if (slots.payrollDeduct === "yes" && !slots.payrollAmount) needed.push("payrollAmount");
    }
  }
  return needed
    .map((key) => QUESTIONS[key]!)
    .filter((question) => !assistants.some((message) => message.includes(question)));
}

function renderReply(slots: FormRemapSlots, questions: readonly string[]): string {
  const lines: string[] = [];
  if (slots.templateKey) {
    const name = TEMPLATE_SEEDS.find((seed) => seed.key === slots.templateKey)?.name ?? "form";
    lines.push(`Here is the ${name}.`);
  }
  if (slots.employeeName) lines.push(`**Employee:** ${slots.employeeName}`);
  if (slots.jobTitle) lines.push(`**Job title:** ${slots.jobTitle}, as you said`);
  if (slots.store) lines.push(`**Store:** ${slots.store}, as you said`);
  if (slots.incidentDateIso) lines.push(`**Date:** ${slots.incidentDateIso}`);
  if (slots.incidentTime) lines.push(`**Time:** ${slots.incidentTime}`);
  if (slots.observation) lines.push(`**What happened:** ${slots.observation}`);
  // The card is the one prior-action line. Repeating it in the reply painted
  // the acknowledgement twice on the turn that first stated it.
  if (slots.policySection) lines.push(`**Policy:** ${slots.policySection}, as you said`);
  if (slots.warningLevel) {
    const label = slots.warningLevel === "verbal" ? "Verbal Warning" : "Written Warning";
    lines.push(`**Type of warning:** ${label}, as you said`);
  }
  if (slots.payrollDeduct) lines.push(`**Payroll deduct:** ${slots.payrollDeduct === "yes" ? "Yes" : "No"}, as you said`);
  if (slots.payrollAmount) lines.push(`**Payroll deduction amount:** ${slots.payrollAmount}`);
  if (slots.actionPlan) lines.push(`**Action plan:** ${slots.actionPlan}`);
  const body = lines.join("\n");
  const asked = questions.join("\n");
  return [body, asked].filter((part) => part.trim() !== "").join("\n\n");
}

function proposalFor(slots: FormRemapSlots): ChatFormProposal {
  const templateKey = slots.templateKey!;
  const named = Boolean(slots.employeeName);
  const located = Boolean(slots.locationId);
  const status = !named ? "needs_employee" : located ? "ready" : "needs_location";
  return {
    proposalId: "form-remap",
    templateKey,
    templateName: TEMPLATE_SEEDS.find((seed) => seed.key === templateKey)?.name ?? templateKey,
    supportsInlineDraft: status === "ready" && supportsInlineDraft(templateKey, []),
    variantKey: null,
    employeeName: slots.employeeName,
    employeeRole: slots.jobTitle,
    employeeRoleSource: slots.jobTitle ? "manager" : null,
    ...(slots.closeMatchNote ? { closeMatchNote: slots.closeMatchNote } : {}),
    formDate: slots.incidentDateIso,
    incidentTime: slots.incidentTime,
    payrollDeduct: slots.payrollDeduct,
    warningLevel: slots.warningLevel,
    issue: slots.observation,
    priorActions: slots.priorActions,
    locationId: slots.locationId,
    locationName: slots.store,
    locationResolution: located ? "resolved" : "needs_selection",
    authorizedLocationIds: slots.locationId ? [slots.locationId] : [],
    status,
    sourceMessageIds: [],
  };
}

const TOOL_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: ["templateKey", "employeeName", "observation", "actionPlan"],
  properties: {
    templateKey: { type: ["string", "null"], enum: [...TEMPLATES, null] },
    employeeName: { type: ["string", "null"] },
    jobTitle: { type: ["string", "null"] },
    store: { type: ["string", "null"] },
    incidentDateIso: { type: ["string", "null"] },
    useToday: { type: "boolean" },
    warningLevel: { type: ["string", "null"], enum: ["verbal", "written", null] },
    payrollDeduct: { type: ["string", "null"], enum: ["yes", "no", null] },
    payrollAmount: { type: ["string", "null"] },
    policySection: { type: ["string", "null"] },
    observation: { type: ["string", "null"] },
    actionPlan: { type: ["string", "null"] },
  },
};
