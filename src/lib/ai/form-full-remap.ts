import "server-only";

import { CLAUDE_HAIKU_MODEL } from "@/lib/config/models";
import { formFullRemapEnabled } from "@/lib/config/chat-quality-flags";
import { CA_POLICY_LABEL, readCaPolicy } from "@/lib/forms/ca-policy";
import { matchEmployeeName, wovenCloseNote, type RosterEmployee } from "@/lib/forms/employee-match";
import { listIncidentDates } from "@/lib/forms/form-date-answer";
import { supportsInlineDraft } from "@/lib/forms/inline-draft";
import { TEMPLATE_SEEDS } from "@/lib/forms/library";
import { readLocationMentions, rosterLocationName } from "@/lib/forms/location-mention";
import { payrollDeductAmount, payrollDeductFromConversation } from "@/lib/forms/payroll-deduct";
import { PAYROLL_DEDUCT_AMOUNT_QUESTION } from "@/lib/forms/payroll-deduct-amount";
import { extractEmployeeNames, extractJobTitle, statedJobTitle } from "@/lib/forms/proposal";
import { spokenDates } from "@/lib/forms/relative-date";
import { warningLevelFromTurns } from "@/lib/forms/warning-level";
import type { ChatFormProposal } from "@/types";

import { callClaudeToolDetailed } from "./call-claude";
import { chatTraceDraft } from "./chat-trace-store";
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
  readonly warningLevel: "verbal" | "written" | null;
  readonly payrollDeduct: "yes" | "no" | null;
  readonly payrollAmount: string | null;
  readonly policySection: string | null;
  readonly observation: string | null;
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
}): { slots: FormRemapSlots; response: AskResponse } {
  const users = userTurns(input.history, input.question);
  const said = users.join("\n");
  const raw = parseRaw(input.raw);
  const templateKey =
    templateFromUser(said) ??
    (isTemplate(input.continueTemplateKey) ? input.continueTemplateKey : null) ??
    (isTemplate(raw.templateKey) ? raw.templateKey : null);
  const employeeName = groundedName(raw.employeeName, users);
  const jobTitle = groundedTitle(users);
  const store = groundedStore(said);
  const incidentDateIso = groundedDate(said, input.today);
  const warningLevel = templateKey === "dpoa" ? explicitWarning(users, input.today) : null;
  const payrollDeduct = templateKey === "dpoa" ? payrollDeductFromConversation([...input.history, { role: "user", content: input.question }]) : null;
  const payrollAmount = payrollDeduct === "yes" ? managerPayrollAmount(said) : null;
  const policySection = groundedPolicy(said);
  const observation = acceptSummary(raw.observation, said);
  const actionPlan = acceptSummary(stripMoney(raw.actionPlan ?? ""), said);
  const closeMatchNote = employeeName ? closeNote(employeeName, input.people) : null;

  const slots: FormRemapSlots = {
    templateKey,
    employeeName,
    jobTitle,
    store: store?.name ?? null,
    locationId: store?.id ?? null,
    incidentDateIso,
    warningLevel: warningLevel === "verbal" || warningLevel === "written" ? warningLevel : null,
    payrollDeduct,
    payrollAmount,
    policySection,
    observation,
    actionPlan,
    closeMatchNote,
  };

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

export async function remapFormTurn(
  input: {
    readonly history: readonly Turn[];
    readonly question: string;
    readonly today: string;
    readonly people: readonly RosterEmployee[];
    readonly continueTemplateKey?: string | null;
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
      user: conversationText(input.history, input.question, input.today),
    });
  } catch {
    return null;
  }
  const grounded = groundFormSlots({ ...input, raw: result.raw });
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

function userTurns(history: readonly Turn[], question: string): string[] {
  return [...history, { role: "user", content: question }]
    .filter((turn) => turn.role === "user" && turn.content.trim() !== "")
    .map((turn) => turn.content);
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
  const hits: { index: number; key: TemplateKey }[] = [];
  const add = (re: RegExp, key: TemplateKey) => {
    for (const match of text.matchAll(re)) hits.push({ index: match.index ?? 0, key });
  };
  add(/\bfollow[- ]up coaching\b/gi, "follow-up-coaching");
  add(/\bpolicy review\b/gi, "policy-review");
  add(/\bcorrective action\b|\bwrite-?up\b/gi, "dpoa");
  add(/\bcoaching form\b|\bcoaching\b/gi, "coaching");
  const followUps = hits.filter((hit) => hit.key === "follow-up-coaching");
  const kept = hits.filter((hit) => {
    if (hit.key !== "coaching") return true;
    return !followUps.some((follow) => hit.index >= follow.index && hit.index < follow.index + 24);
  });
  kept.sort((a, b) => a.index - b.index);
  return kept.at(-1)?.key ?? null;
}

function groundedName(proposed: string | null, turns: readonly string[]): string | null {
  const said = turns.join("\n");
  const latest = turns.at(-1) ?? "";
  if (proposed) {
    const inLatest = exactSlice(latest, proposed);
    if (inLatest) return inLatest;
    const inSaid = exactSlice(said, proposed);
    if (inSaid) return inSaid;
  }
  let found: string | null = null;
  for (const turn of turns) {
    const names = extractEmployeeNames(turn);
    if (names.length === 1) found = exactSlice(turn, names[0]!) ?? names[0]!;
  }
  return found;
}

function exactSlice(haystack: string, needle: string): string | null {
  const at = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return null;
  return haystack.slice(at, at + needle.length);
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
  const calendar = [...new Set(listIncidentDates(text, today).map((item) => item.iso))];
  if (calendar.length === 1) return calendar[0]!;
  if (calendar.length > 1) return null;
  if (/\b(?:use\s+)?today'?s\s+date\b/i.test(text)) return today;
  const spoken = [
    ...new Set(
      spokenDates(text, today)
        .map((item) => item.iso)
        .filter((iso): iso is string => typeof iso === "string" && iso !== "" && iso !== today),
    ),
  ];
  return spoken.length === 1 ? spoken[0]! : null;
}

function explicitWarning(turns: readonly string[], today: string): "verbal" | "written" | null {
  const cleaned = turns.map((turn) => turn.replace(/\bwrit(?:e|ing|ten)\s+ups?\b/gi, " "));
  const fromReader = warningLevelFromTurns(cleaned, today);
  if (fromReader === "verbal" || fromReader === "written") return fromReader;
  let level: "verbal" | "written" | null = null;
  for (const turn of cleaned) {
    for (const sentence of turn.split(/[.\n;]+/)) {
      if (!/^\s*(?:a\s+)?(verbal|written)\s+warnings?\s*$/i.test(sentence) && !/^\s*(verbal|written)\s*$/i.test(sentence)) {
        continue;
      }
      level = /written/i.test(sentence) ? "written" : "verbal";
    }
  }
  return level;
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
  return reading.stated ? CA_POLICY_LABEL[reading.stated] : null;
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
  if (slots.observation) lines.push(`**What happened:** ${slots.observation}`);
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
    payrollDeduct: slots.payrollDeduct,
    warningLevel: slots.warningLevel,
    issue: slots.observation,
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
