import "server-only";

import { withoutAppLines } from "@/lib/ai/app-sentences";
import { aiReadsCodeChecksEnabled, checkedReadingEnabled } from "@/lib/config/chat-quality-flags";
import { CLAUDE_READER_MODEL } from "@/lib/config/models";
import { ACTIVE_BRAND } from "@/lib/brand";
import { displayName } from "@/lib/forms/employee-match";
import { loadScopedRoster, readDirectoryFacts } from "@/lib/forms/employee-roster";
import { authorizedLocationIds } from "@/lib/forms/location-scope";
import { manualSectionHeadings } from "@/lib/forms/official-policy-manual";
import { SupabaseKnowledgeProvider } from "@/lib/knowledge/providers/supabase";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import type { ChatFormProposal } from "@/types";

import { updateChatTrace } from "../chat-trace-store";
import { slotClause } from "../form-full-remap";
import type { ChatActor } from "../form-proposal";
import type { GroundedPerson } from "../grounded-entities";
import { currentRequestStart } from "../remap-incident";
import type { AskRequest, AskResponse } from "../types";
import { plainWords, type CheckContext, type CheckedReading } from "./check";
import { lastFirstResult } from "./last-first";
import { mergeCheckedReading } from "./merge";
import { readFormRequest, type ReaderResult } from "./read";
import type { FormReading } from "./schema";

/**
 * ============================================================================
 * AI_READS_CODE_CHECKS_ENABLED — WHERE THE READER JOINS THIS APP'S CHAT TURN
 * ============================================================================
 *
 * The sibling app joins the reader to its live slot call. This app has no
 * live slot call, so the reader joins at the form proposal (`server-ask.ts`):
 * it starts as the turn goes down the forms path, beside the proposal, and is
 * merged once today's card is known. The same checks and the same merge rule
 * as the sibling app (`check.ts`, `merge.ts`):
 *
 *   today's readers settled a field   -> it stays; a different reading is traced
 *   they left it open                 -> the checked reading fills it
 *   (open: no value, a typed name that is nobody on the roster, a date the
 *    manager gave for an earlier step, or one a newer answer moved past)
 *
 * The reading reaches the card the way this app already hands values to its
 * readers (`app-sentences.ts`): the proposal is made again with "The employee
 * is …", "It happened on …" before the manager's words. No protected reader
 * is changed. A card made again is used only when it holds a value it was
 * given and changed nothing else the code had read.
 *
 * The passed fields ride on the card with their quotes (`checkedReading`);
 * the create and draft routes check every quote again (`recheck.ts`).
 *
 * Off, or with no usable reply, nothing here runs or changes.
 */

/** The Last, First reading found no pair: nothing to trace, nothing to merge. */
const NO_PAIR = "no_pair";

export interface StartedReading {
  readonly context: Promise<CheckContext>;
  readonly result: Promise<ReaderResult | { readonly fallback: string }>;
}

type Turn = { readonly role: string; readonly content: string };

/** The history of the form now being written: from a later create request with its own incident. */
function scopedHistory<T extends Turn>(history: readonly T[], question: string): T[] {
  const userAt = history.flatMap((turn, index) => (turn.role === "user" ? [index] : []));
  const start = currentRequestStart({
    turns: [...userAt.map((index) => history[index]!.content), question],
    employeeName: null,
    slotClause,
  });
  if (start === 0) return [...history];
  if (start >= userAt.length) return [];
  return history.slice(userAt[start]!);
}

/** Starts the reader for a form turn. Null when the flag is off. Never throws. */
export function startFormReading(request: AskRequest, actor: ChatActor): StartedReading | null {
  if (!checkedReadingEnabled()) return null;
  const history = scopedHistory(request.history, request.question);
  const turns: Turn[] = [...history, { role: "user", content: request.question }];
  const context = (async (): Promise<CheckContext> => {
    const [people, headings] = await Promise.all([loadPeople(actor), loadHeadings()]);
    const allowed = actor.scope ? new Set(authorizedLocationIds(actor.scope)) : null;
    return {
      managerTurns: turns
        .filter((turn) => turn.role === "user")
        .map((turn) => withoutAppLines(turn.content))
        .filter((turn) => turn.trim() !== ""),
      people,
      locations: COMPANY_LOCATIONS.filter((store) => !allowed || allowed.has(store.id)).map((store) => ({ id: store.id, name: store.name })),
      headings,
      today: request.context.todayIso,
    };
  })();
  // LAST_FIRST_NAME_READ_ENABLED, with no AI reader: "Calder, Remy" is read by the reader's own checks, no model.
  const result = context.then(
    (ready) =>
      aiReadsCodeChecksEnabled()
        ? readFormRequest({ turns, context: ready })
        : (lastFirstResult(ready) ?? { fallback: NO_PAIR }),
    () => ({ fallback: "error" }),
  );
  return { context, result };
}

async function loadPeople(actor: ChatActor): Promise<GroundedPerson[]> {
  try {
    const facts = await readDirectoryFacts(actor.scope);
    if (facts.length > 0) return facts;
    const roster = await loadScopedRoster(actor.scope);
    return roster.map((person) => ({ ...person, title: person.positionName ?? null, primaryLocationName: null }));
  } catch {
    return [];
  }
}

async function loadHeadings(): Promise<string[]> {
  try {
    const manual = await new SupabaseKnowledgeProvider().fetchOfficialPolicyManual(ACTIVE_BRAND.knowledgeScopeId);
    return manual.ok ? manualSectionHeadings(manual.chunks) : [];
  } catch {
    return [];
  }
}

/**
 * The reader's call in the chat trace's `slots.reader`, the same shape as the
 * sibling app: `{ model, ms, usage, rejected, filled, disputed }`, or
 * `{ fallback }`. Field names only, never the manager's words. The spend
 * guard counts the reader's usage from here.
 */
function traceReader(read: ReaderResult | { readonly fallback: string }, filled: readonly string[] = [], disputed: readonly string[] = []): void {
  if ("fallback" in read && read.fallback === NO_PAIR) return;
  updateChatTrace({
    reader:
      "fallback" in read
        ? { fallback: read.fallback }
        : { ...(read.ms > 0 ? { model: CLAUDE_READER_MODEL } : { source: "last_first" }), ms: read.ms, usage: read.usage, rejected: read.checked.rejected, filled: [...filled], disputed: [...disputed] },
  });
}

/* ------------------------------------------------------------------ merge -- */

type Field = "employee" | "store" | "jobTitle" | "incidentDate" | "warningLevel" | "payrollDeduct";
const FIELDS: readonly Field[] = ["employee", "store", "jobTitle", "incidentDate", "warningLevel", "payrollDeduct"];

function fieldsOf(card: ChatFormProposal): Record<Field, string | null> {
  return {
    employee: card.employeeName ?? null,
    store: card.locationId ?? null,
    jobTitle: card.employeeRole ?? null,
    incidentDate: card.formDate ?? null,
    warningLevel: card.warningLevel ?? null,
    payrollDeduct: card.payrollDeduct ?? null,
  };
}

function slashDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

export interface MergePlan {
  /** The app's lines that hand each filled value to the code readers. */
  readonly lines: string[];
  /** The values the card must hold once made again. */
  readonly expect: Partial<Record<Field, string>>;
  readonly filled: readonly string[];
  readonly disputed: readonly string[];
}

/** The person the card names, when it is the roster spelling of exactly one person in scope. */
function rosterPerson(name: string | null, people: readonly GroundedPerson[]): GroundedPerson | null {
  if (!name) return null;
  const fits = people.filter((person) =>
    [person.firstName, person.preferredFirstName ?? ""]
      .filter(Boolean)
      .some((first) => plainWords(`${first} ${person.lastName}`) === plainWords(name)),
  );
  return fits.length === 1 ? fits[0]! : null;
}

export function mergePlan(card: ChatFormProposal, checked: CheckedReading, people: readonly GroundedPerson[]): MergePlan {
  const merge = mergeCheckedReading(checked);
  const lines: string[] = [];
  const expect: Partial<Record<Field, string>> = {};
  const filled: string[] = [];
  const disputed: string[] = [];

  const employeeCode = { person: rosterPerson(card.employeeName, people), name: card.employeeName, ambiguous: [], typed: card.employeeName };
  const employee = merge.employee(employeeCode);
  if (employee !== employeeCode && employee.person) {
    const name = displayName(employee.person);
    lines.push(`The employee is ${name}.`);
    expect.employee = name;
  }
  const storeCode = { id: card.locationId, name: card.locationName, ambiguous: [] };
  const store = merge.store(storeCode);
  if (store !== storeCode && store.id && store.name) {
    lines.push(`It happened at ${store.name}.`);
    expect.store = store.id;
  }
  const title = merge.title(card.employeeRole);
  if (title !== card.employeeRole && title) {
    lines.push(`Job title: ${title}.`);
    expect.jobTitle = title;
  }
  const dateCode = { iso: card.formDate ?? null, ambiguous: [] };
  const date = merge.date(dateCode);
  if (date !== dateCode && date.iso) {
    lines.push(`It happened on ${slashDate(date.iso)}.`);
    expect.incidentDate = date.iso;
  }
  // A final warning on the card is the code's; the reader reads verbal or written only.
  if (card.warningLevel !== "final_warning") {
    const levelCode = { value: card.warningLevel ?? null, ambiguous: false };
    const level = merge.warningLevel(levelCode);
    if (level !== levelCode && level.value) {
      lines.push(`Warning level: ${level.value}.`);
      expect.warningLevel = level.value;
    }
  }
  // Payroll yes/no, by the same rule: a card that has an answer keeps it.
  if (checked.payroll && !card.payrollDeduct) {
    lines.push(checked.payroll === "yes" ? "Payroll deduct applies." : "No payroll deduction.");
    expect.payrollDeduct = checked.payroll;
    filled.push("payroll");
  } else if (checked.payroll && card.payrollDeduct !== checked.payroll) {
    disputed.push("payroll");
  }
  // The amount goes with a Yes only; the card has no amount of its own, so it is open there.
  const amount = (card.payrollDeduct ?? expect.payrollDeduct) === "yes" ? merge.payrollAmount(null) : null;
  if (amount) lines.push(`Payroll deduction of ${amount}.`);
  return { lines, expect, filled: [...merge.filled, ...filled], disputed: [...merge.disputed, ...disputed] };
}

/**
 * The card made again is used only when it holds at least one value it was
 * given and changed nothing else the code had read. Once the employee is a
 * roster person, the code reads their title and store as for any named person.
 */
function improves(first: ChatFormProposal, again: ChatFormProposal | undefined, expect: MergePlan["expect"]): boolean {
  if (!again || again.templateKey !== first.templateKey) return false;
  const before = fieldsOf(first);
  const after = fieldsOf(again);
  const held = (Object.entries(expect) as [Field, string][]).filter(
    ([field, value]) => after[field] !== null && plainWords(after[field]!) === plainWords(value),
  );
  if (held.length === 0) return false;
  const follows = (field: Field) => "employee" in expect && (field === "jobTitle" || field === "store") && after[field] !== null;
  return FIELDS.every((field) => field in expect || before[field] === null || before[field] === after[field] || follows(field));
}

/**
 * The code kept the typed name ("quinn", "Marlowe") and the checked reading
 * found the one roster person it is: the card takes the roster's spelling.
 * The create route checks it against the reader's quote.
 */
function withRosterSpelling(response: AskResponse, checked: CheckedReading, people: readonly GroundedPerson[]): AskResponse {
  const card = response.formProposal;
  const person = checked.employee?.person;
  if (!card?.employeeName || !person || card.subject === "team" || rosterPerson(card.employeeName, people)) return response;
  const typed = plainWords(card.employeeName).split(" ");
  const names = [person.firstName, person.preferredFirstName ?? "", person.lastName]
    .flatMap((name) => plainWords(name).split(" "))
    .filter(Boolean);
  if (!typed.every((word) => names.includes(word))) return response;
  return { ...response, formProposal: { ...card, employeeName: displayName(person) } };
}

/** The card's copy of what passed, each with its quote, for the create and draft routes. */
function cardReading(checked: CheckedReading, reading: FormReading): NonNullable<ChatFormProposal["checkedReading"]> {
  const quote = (field: { readonly evidence: string | null }) => field.evidence ?? "";
  const steps = checked.priorSteps.flatMap((step) => {
    const row = reading.priorSteps.find((candidate) => candidate.date === step.iso && candidate.evidence);
    return row ? [{ value: { step: step.kind, date: step.iso }, quote: row.evidence! }] : [];
  });
  return {
    ...(checked.employee?.person ? { employee: { value: displayName(checked.employee.person), quote: quote(reading.employee) } } : {}),
    ...(checked.warningLevel ? { warningLevel: { value: checked.warningLevel, quote: quote(reading.warningLevel) } } : {}),
    ...(checked.payroll ? { payrollDeduct: { value: checked.payroll, quote: quote(reading.payroll) } } : {}),
    ...(checked.payrollAmount ? { payrollAmount: { value: checked.payrollAmount, quote: quote(reading.payrollAmount) } } : {}),
    ...(checked.incidentDate ? { incidentDate: { value: checked.incidentDate, quote: quote(reading.incidentDate) } } : {}),
    ...(steps.length > 0 ? { priorSteps: steps } : {}),
  };
}

/** Every quote that passed. */
function passedQuotes(checked: CheckedReading, reading: FormReading): string[] {
  const one: [unknown, { readonly evidence: string | null }][] = [
    [checked.employee, reading.employee],
    [checked.location, reading.location],
    [checked.jobTitle, reading.jobTitle],
    [checked.incidentDate, reading.incidentDate],
    [checked.warningLevel, reading.warningLevel],
    [checked.payroll, reading.payroll],
    [checked.payrollAmount, reading.payrollAmount],
  ];
  const steps = checked.priorSteps.flatMap((step) =>
    reading.priorSteps.filter((row) => row.date === step.iso && row.evidence).map((row) => row.evidence!),
  );
  return [...one.flatMap(([passed, field]) => (passed && field.evidence ? [field.evidence] : [])), ...steps];
}

/**
 * The turns the draft is written from include each turn a passed quote came
 * from: the reader found this form's account there ("she was issued a verbal
 * ca on 10.1"). Manager turns of this conversation only, oldest first.
 */
function sourcesWithQuotedTurns(
  card: ChatFormProposal,
  quotes: readonly string[],
  request: Pick<AskRequest, "history" | "question" | "questionMessageId">,
): string[] {
  const turns = [
    ...request.history.filter((turn) => turn.role === "user").map((turn) => ({ id: turn.id, text: turn.content })),
    ...(request.questionMessageId ? [{ id: request.questionMessageId, text: request.question }] : []),
  ];
  const quoted = new Set(
    quotes.flatMap((quote) => {
      const needle = ` ${plainWords(quote)} `;
      const hit = [...turns].reverse().find((turn) => ` ${plainWords(turn.text)} `.includes(needle));
      return hit ? [hit.id] : [];
    }),
  );
  const ids = new Set([...card.sourceMessageIds, ...quoted]);
  return turns.map((turn) => turn.id).filter((id) => ids.has(id));
}

function withReading(
  response: AskResponse,
  read: ReaderResult,
  request: Pick<AskRequest, "history" | "question" | "questionMessageId">,
): AskResponse {
  const card = response.formProposal;
  if (!card) return response;
  const reading = cardReading(read.checked, read.reading);
  const sources = card.sourceExcerpts ? card.sourceMessageIds : sourcesWithQuotedTurns(card, passedQuotes(read.checked, read.reading), request);
  const moreSources = sources.length !== card.sourceMessageIds.length;
  if (Object.keys(reading).length === 0 && !moreSources) return response;
  return {
    ...response,
    formProposal: {
      ...card,
      ...(moreSources ? { sourceMessageIds: sources } : {}),
      ...(Object.keys(reading).length > 0 ? { checkedReading: reading } : {}),
    },
  };
}

/**
 * The proposal call with the reader merged in. With the flag off (`started`
 * null) it is the proposal call itself.
 */
export function readerPropose(
  started: StartedReading | null,
  request: Pick<AskRequest, "history" | "question" | "questionMessageId">,
  base: (question: string) => Promise<AskResponse | null>,
): (question: string) => Promise<AskResponse | null> {
  if (!started) return base;
  return async (question) => {
    const first = await base(question);
    const read = await started.result;
    if ("fallback" in read) {
      traceReader(read);
      return first;
    }
    const card = first?.formProposal;
    if (!first || !card) {
      traceReader(read);
      return first;
    }
    const people = (await started.context).people;
    const plan = mergePlan(card, read.checked, people);
    let response = first;
    let filled: readonly string[] = [];
    if (plan.lines.length > 0) {
      const again = await base(`${plan.lines.join(" ")}\n${question}`);
      // A value the code readers would not take is not forced onto the card.
      if (again && improves(card, again.formProposal, plan.expect)) {
        response = again;
        filled = plan.filled;
      }
    }
    const spelled = withRosterSpelling(response, read.checked, people);
    if (spelled !== response && !filled.includes("employee")) filled = [...filled, "employee"];
    traceReader(read, filled, plan.disputed);
    return withReading(spelled, read, request);
  };
}

const ROSTER_NOTE = /^I couldn't find ((?:\*\*[^*]+\*\*(?: or )?)+) in the Woven roster, so that name is not on the form\.$/;

/**
 * The reply's "I couldn't find **Marlowe** in the Woven roster" line, written
 * from the manager's words before the reader filled the employee, is dropped
 * when the card now names the roster person the reader quoted and every name
 * in the line is part of theirs ("Marlowe" of Quinn Marlowe). Any other line,
 * and every reply without the reader's employee, is left as it is.
 */
export function withoutStaleRosterNote(response: AskResponse | null): AskResponse | null {
  const card = response?.formProposal;
  const filled = card?.checkedReading?.employee?.value;
  if (!response || !card?.employeeName || !filled || plainWords(filled) !== plainWords(card.employeeName)) return response;
  const named = plainWords(card.employeeName).split(" ");
  const blocks = response.content.split("\n\n");
  const kept = blocks.filter((block) => {
    const match = ROSTER_NOTE.exec(block.trim());
    if (!match) return true;
    const names = [...match[1]!.matchAll(/\*\*([^*]+)\*\*/g)].map((hit) => plainWords(hit[1]!));
    return !names.every((name) => name.split(" ").every((word) => named.includes(word)));
  });
  return kept.length === blocks.length ? response : { ...response, content: kept.join("\n\n").trim() };
}
