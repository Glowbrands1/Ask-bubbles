import { datesInText, listFormDates } from "@/lib/forms/form-date-answer";
import { managerStatedWarningLevel, templateHasWarningLevel } from "@/lib/forms/warning-level";
import { displayName, editDistance, matchEmployeeName, type RosterEmployee } from "@/lib/forms/employee-match";
import { describedAttendanceKeys } from "@/lib/forms/ca-policy";
import { headingKey, sectionHeadingsFor } from "@/lib/forms/official-policy-manual";
import { namesHeading } from "@/lib/forms/named-policy-section";
import { payrollDeductAmount, payrollDeductFromConversation, type PayrollDeductAnswer } from "@/lib/forms/payroll-deduct";
import {
  intentPayrollManagerOnlyEnabled,
  managerWordsOnlyEnabled,
  notANameGuardEnabled,
  warningLevelManagerOnlyEnabled,
  caTemplateMapEnabled,
  formChoiceStatedEnabled,
  placeSpanGuardEnabled,
  priorActionsParseEnabled,
} from "@/lib/config/chat-quality-flags";
import { isNotAName, maskNotANameText, saidInReply } from "@/lib/forms/not-a-name";
import { extractJobTitle } from "@/lib/forms/proposal";
import { lateOpenOn, newestStatedDate, withYearlessDatesWritten } from "@/lib/forms/late-open";
import { correctiveActionBasis } from "@/lib/forms/corrective-action-intake";
import { detectTemplateIntent, mentionsEarlierCoaching } from "@/lib/forms/template-intent";
import { labelledStoreIds } from "@/lib/forms/store-cue";

import {
  EMPTY_CONVERSATION_FORM_STATE,
  prependFormState,
  stateSentences,
  type ConversationFormState,
} from "./form-state";
import type { GroundedPerson } from "./grounded-entities";
import { titleTextFromTurns } from "./title-words";

/**
 * Slots read off one turn, then kept only when the roster, the store list,
 * or the manual headings agree.
 *
 * The model copies what the manager said. This file decides what is real.
 * A heading that is not in the headings it was given is not an incident
 * type, and a person who is not on the roster is not the employee.
 */

export const INTENT_TOOL_NAME = "record_intent_slots";

export interface IntentSlotReading {
  readonly employee: string | null;
  readonly store: string | null;
  readonly title: string | null;
  readonly incidentType: string | null;
  readonly incidentDate: string | null;
  readonly payrollAmount: string | null;
  readonly warningLevel: "verbal" | "written" | null;
  readonly formType: string | null;
  readonly formTurn: boolean;
}

export const INTENT_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: [
    "employee",
    "store",
    "title",
    "incidentType",
    "incidentDate",
    "payrollAmount",
    "warningLevel",
    "formType",
    "formTurn",
  ],
  properties: {
    employee: { type: ["string", "null"], description: "The person named, in the manager's own spelling. Null when nobody was named." },
    store: { type: ["string", "null"], description: "The store named, in the manager's own words. Null when none was named." },
    title: { type: ["string", "null"], description: "The job title the manager stated. Null when they did not state one." },
    incidentType: { type: ["string", "null"], description: "What happened, in the manager's words. Null when they did not say." },
    incidentDate: {
      type: ["string", "null"],
      description: "The incident date as the manager wrote it, any format. Null when they gave no date.",
    },
    payrollAmount: { type: ["string", "null"], description: "A payroll amount they stated. Null when they did not." },
    warningLevel: { type: ["string", "null"], enum: ["verbal", "written", null] },
    formType: { type: ["string", "null"], description: "The form they named, in their words. Null when no form was named." },
    formTurn: { type: "boolean", description: "True when this turn is filing or continuing a form." },
  },
};

export const INTENT_TOOL_DESCRIPTION =
  "Record the slots the manager has stated in this conversation. Copy their words. Do not invent a name, a store, a title, a date, an amount, or a policy.";

export interface StoreRow {
  readonly id: string;
  readonly name: string;
}

export interface TemplateRow {
  readonly key: string;
  readonly name: string;
}

export interface IntentTurnInput {
  readonly question: string;
  readonly history: readonly { role: string; content: string }[];
  readonly today: string;
  readonly saved: ConversationFormState | null;
  /** The tool payload, or null when the model returned nothing usable. */
  readonly raw: unknown;
  readonly people: readonly GroundedPerson[];
  readonly stores: readonly StoreRow[];
  /** Section headings from the manual that was retrieved. */
  readonly headings: readonly string[];
  readonly templates: readonly TemplateRow[];
  readonly formInProgress: boolean;
}

export interface IntentTurnDecision {
  readonly question: string;
  readonly state: ConversationFormState;
  readonly clarification: string | null;
}

interface ChoiceOption {
  readonly label: string;
  readonly detail: string | null;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const DAY_MONTH =
  /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:,?\s+(\d{4}))?\b/gi;

/**
 * A calendar date in the shapes the form reader already accepts, plus a day
 * written before the month ("1 October 2026"). Anything that is not a real
 * day is null.
 */
export function normalizeIncidentDate(raw: string, today: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const known = datesInText(text, today);
  if (known.length === 1) return known[0]!.iso;
  if (known.length > 1) return known[known.length - 1]!.iso;
  DAY_MONTH.lastIndex = 0;
  const named = DAY_MONTH.exec(text);
  if (!named) return null;
  const month = MONTHS[named[2]!.toLowerCase().replace(/\./g, "")];
  if (!month) return null;
  const year = named[3] ? Number(named[3]) : Number(today.slice(0, 4));
  return calendarIso(year, month, Number(named[1]));
}

export function decideIntentTurn(rawInput: IntentTurnInput): IntentTurnDecision {
  const input = withoutUntypedSavedName(rawInput);
  const choiceStated = formChoiceStatedEnabled();
  const saved = choiceStated
    ? withoutDisciplineProcedure(input.saved ?? EMPTY_CONVERSATION_FORM_STATE)
    : (input.saved ?? EMPTY_CONVERSATION_FORM_STATE);
  const reading = parseReading(input.raw);
  const blob = conversationBlob(input);
  const choice = readPriorChoice(input.history, input.question, input.people, input.stores);
  const employee = choice?.person
    ? { person: choice.person, name: displayName(choice.person), ambiguous: [] as readonly GroundedPerson[], typed: null }
    : groundEmployee(guardedTyped(reading?.employee ?? null, input), blob, input.people);
  const store =
    newestTurnStore(input.question, input.stores) ??
    groundStore(choice?.store ?? reading?.store ?? null, blob, input.stores, employee.person);
  // The manager's turns only: not the assistant's, not the saved state, not a
  // pasted policy, and "ass't" spelled out.
  const titleText = managerWordsOnlyEnabled()
    ? titleTextFromTurns([...input.history.filter((turn) => turn.role !== "assistant").map((turn) => turn.content), input.question])
    : null;
  const title = groundTitle(reading?.title ?? null, blob, input.people, employee.person, titleText);
  const groundedIncident = groundIncident(reading?.incidentType ?? null, blob, input.headings);
  const incidentType = choiceStated && isDisciplineProcedure(groundedIncident) ? null : groundedIncident;
  /*
   * LATE_OPEN_DATE_ENABLED (QA, 24 Oct 2026; ported from the sibling app): "late
   * to open 10-19" and "change the date to 10-22" are dates, and the one this
   * turn states dates the form ahead of the saved one. See `late-open.ts`.
   */
  const lateOpen = lateOpenOn();
  const statedNow = lateOpen && !choice?.date ? newestStatedDate(input.question, input.today) : null;
  const date = statedNow
    ? { iso: statedNow, ambiguous: [] as readonly string[] }
    : groundDate(
        choice?.date ?? reading?.incidentDate ?? null,
        lateOpen ? withYearlessDatesWritten(blob, input.today) : blob,
        input.today,
      );
  const managerOnly = intentPayrollManagerOnlyEnabled();
  // The manager's Yes/No, never an assistant turn's: "payroll deduct is not
  // applicable" is No in the saved state too (LATE_OPEN_DATE_ENABLED).
  const payrollAnswer =
    managerOnly || lateOpen
      ? payrollDeductFromConversation([...input.history, { role: "user", content: input.question }])
      : null;
  const payrollAmount = !managerOnly
    ? lateOpen && payrollAnswer === "no"
      ? null
      : groundPayroll(reading?.payrollAmount ?? null, blob)
    : payrollAnswer === "no"
      ? null
      : (payrollClauseAmount(input) ??
        (payrollAnswer === "yes" ? groundPayroll(reading?.payrollAmount ?? null, managerBlob(input)) : null));
  /*
   * THE MANAGER'S LEVEL ONLY (WARNING_LEVEL_MANAGER_ONLY_ENABLED; ported from
   * the sibling app, live replays 24 Oct 2026). The blob holds the assistant's own
   * turns ("the warning level, verbal or written") and the saved state, and a
   * word anywhere in it — or the slot model's guess — was taken as the level.
   * With the flag, the level is a numbered choice the manager just made, or
   * what their own turns state — nothing else.
   */
  const warningManagerOnly = warningLevelManagerOnlyEnabled();
  const warningLevel = warningManagerOnly
    ? {
        value:
          choice?.warning ??
          managerStatedWarningLevel([...input.history, { role: "user", content: input.question }], input.today),
        ambiguous: false,
      }
    : groundWarning(choice?.warning ?? reading?.warningLevel ?? null, blob);
  const formType: { key: string | null; ambiguous: readonly TemplateRow[]; together?: boolean } = choiceStated
    ? groundStatedForm(
        choice?.form ?? null,
        managerTurns(input),
        input.templates,
        saved.templateKey ? null : (reading?.formType ?? null),
        saved.templateKey,
        // CA_TEMPLATE_MAP_ENABLED: a metric with no behaviour stays the
        // progression here too, as in `correctiveActionRequestKey`.
        caTemplateMapEnabled() && correctiveActionBasis(managerBlob(input)) === "metric_only",
      )
    : groundForm(choice?.form ?? reading?.formType ?? null, blob, input.templates, {
        question: input.question,
        managerText: managerBlob(input),
      });
  const formTurn = Boolean(input.formInProgress || reading?.formTurn || formType.key || saved.templateKey);

  const merged = mergeSlots(saved, {
    employee,
    store,
    title,
    incidentType,
    date: date.iso,
    payrollAmount,
    payrollAnswer,
    managerOnly,
    managerAnswer: lateOpen,
    warningLevel: warningLevel.value,
    formType: formType.key,
  });
  let state = choiceStated ? firstCoachingUnlessEarlier(merged, managerTurns(input), input.templates) : merged;
  if (warningManagerOnly) {
    const answered = payrollAnsweredNow(input.history, input.question);
    if (answered) state = { ...state, payrollDeduct: answered };
    /*
     * RE-READ EVERY TURN, AND ONLY FOR A FORM WITH A TYPE OF WARNING (ported
     * from the sibling app; QA, 24 Oct 2026). A level stored once came back on every
     * later turn, beat "this is a verbal", and rode onto other forms. The
     * level is what the manager's turns state now; the stored one is kept only
     * when the history may have been cut (the route keeps the last HISTORY_CAP
     * turns), so a level stated before that is not lost.
     */
    const template = input.templates.find((row) => row.key === state.templateKey) ?? null;
    const kept = warningLevel.value ?? (input.history.length >= HISTORY_CAP ? saved.warningLevel : null);
    const level = templateHasWarningLevel(template ?? { key: state.templateKey }) ? kept : null;
    if (level !== state.warningLevel) state = { ...state, warningLevel: level };
  }

  const clarification = clarificationFor({
    formTurn,
    employee,
    store,
    title,
    incidentType,
    date,
    payrollAmount,
    warningLevel,
    formType,
    state,
    people: input.people,
    stores: input.stores,
    templates: input.templates,
  });

  if (clarification) return { question: input.question, state, clarification };
  if (!formTurn) return { question: input.question, state, clarification: null };
  return { question: prependFormState(input.question, state), state, clarification: null };
}

/**
 * FORM_CHOICE_STATED_ENABLED. "Disciplinary Action" is the manual's discipline
 * procedure itself, never the policy an offense broke. A stored one wrote
 * "Policy reference: Disciplinary Action" ahead of the turn, and its alias
 * picked the Corrective Action Form over the form the manager asked for
 * (ported from the sibling app, QA 24 Oct 2026).
 */
function isDisciplineProcedure(heading: string | null | undefined): boolean {
  return Boolean(heading) && /^disciplinary actions?(?: policy)?$/.test(headingKey(heading!));
}

function withoutDisciplineProcedure(state: ConversationFormState): ConversationFormState {
  const policy = isDisciplineProcedure(state.policyHeading);
  const incident = isDisciplineProcedure(state.incidentType);
  if (!policy && !incident) return state;
  return {
    ...state,
    policyHeading: policy ? null : state.policyHeading,
    policyPage: policy ? null : state.policyPage,
    incidentType: incident ? null : state.incidentType,
  };
}

/** The manager's own turns, oldest first, this one last. */
function managerTurns(input: IntentTurnInput): string[] {
  return [...input.history.filter((turn) => turn.role === "user").map((turn) => turn.content), input.question].filter(
    (part) => part.trim() !== "",
  );
}

/**
 * FORM_CHOICE_STATED_ENABLED. The form the manager named, newest turn first.
 *
 * Read from their own words only. The assistant's "**Corrective Action
 * Form**", the stored state's sentences and the model's formType (which
 * copies either) never choose it. A turn that names no form ("Create a form
 * from this conversation") looks further back; a turn that names one
 * replaces the stored form. When no manager turn names a form, the stored
 * form stays, and only then does the model's formType count — read as a
 * template name, never from the blob.
 *
 * In a coaching conversation the model's formType never picks the Corrective
 * Action Form; the manager asks for one in their own words ("create a CA", "a
 * verbal warning", "write them up" — formNamedIn reads those). Ported from
 * the sibling app (QA round 12, 25 Oct 2026): "Help me prepare for a coaching
 * conversation." then "…not verifying documents are signed" was a Corrective
 * Action card on every turn, though the manager only asked for coaching and
 * a Policy Review.
 *
 * One turn carries one card. A turn that names two forms ("a coaching form
 * and a policy review? I'd like to see both") asks which to start with; the
 * manager answers with the form's name, and once a form is stored that
 * earlier turn no longer asks.
 */
function groundStatedForm(
  chosen: string | null,
  turns: readonly string[],
  templates: readonly TemplateRow[],
  modelForm: string | null,
  storedKey: string | null,
  metricOnly = false,
): { key: string | null; ambiguous: readonly TemplateRow[]; together?: boolean } {
  const picked = chosen ? matchTemplates(chosen, templates) : [];
  if (picked.length === 1) return { key: picked[0]!.key, ambiguous: [] };
  for (let at = turns.length - 1; at >= 0; at -= 1) {
    const several = formsNamedTogether(turns[at]!, templates);
    if (several.length > 1) {
      if (at < turns.length - 1 && storedKey) return { key: null, ambiguous: [] };
      return { key: null, ambiguous: several, together: true };
    }
    const key = formNamedIn(turns[at]!, templates);
    if (key && !(metricOnly && key === CORRECTIVE_ACTION_KEY)) return { key, ambiguous: [] };
  }
  const typed = modelForm?.trim() ? matchTemplates(modelForm.trim(), templates) : [];
  const key = typed.length === 1 && !(typed[0]!.key === "dpoa" && coachingConversation(turns)) ? typed[0]!.key : null;
  return { key, ambiguous: [] };
}

/**
 * FORM_CHOICE_STATED_ENABLED. The manager is talking about coaching ("a
 * coaching conversation", "coach an employee") and mentions no coaching that
 * already happened. The model's Corrective Action Form does not count here.
 */
function coachingConversation(turns: readonly string[]): boolean {
  return turns.some((turn) => /\bcoach(?:ing)?\b/i.test(turn)) && !turns.some((turn) => mentionsEarlierCoaching(turn));
}

/**
 * FORM_CHOICE_STATED_ENABLED. The forms one turn asks for together: "a
 * coaching form and a policy review", "a coaching form, plus a policy
 * review". Each part is read on its own; fewer than two forms is none.
 */
function formsNamedTogether(text: string, templates: readonly TemplateRow[]): TemplateRow[] {
  const parts = text.split(/,|&|\band\b|\bplus\b|\bas well as\b/i).filter((part) => part.trim() !== "");
  if (parts.length < 2) return [];
  const keys = new Set<string>();
  for (const part of parts) {
    const key = formNamedIn(part, templates);
    if (key) keys.add(key);
  }
  return keys.size > 1 ? templates.filter((template) => keys.has(template.key)) : [];
}

/**
 * FORM_CHOICE_STATED_ENABLED. The Follow-Up Coaching Form only when a manager
 * turn mentions coaching that already happened or a follow-up; otherwise the
 * Coaching Form. A stored follow-up key from an earlier turn is corrected the
 * same way.
 */
function firstCoachingUnlessEarlier(
  state: ConversationFormState,
  turns: readonly string[],
  templates: readonly TemplateRow[],
): ConversationFormState {
  if (state.templateKey !== "follow-up-coaching") return state;
  if (turns.some((turn) => mentionsEarlierCoaching(turn))) return state;
  return templates.some((template) => template.key === "coaching") ? { ...state, templateKey: "coaching" } : state;
}

function formNamedIn(text: string, templates: readonly TemplateRow[]): string | null {
  const published = (key: string) => (templates.some((template) => template.key === key) ? key : null);
  const intent = detectTemplateIntent(text);
  if (intent.kind === "explicit" || intent.kind === "clarify") {
    const named = published(intent.templateKey);
    if (named) return named;
  }
  // "create a CA", "create a Verbal CA for …": a corrective action asked for
  // in this turn is the Corrective Action Form, as the proposal reads it.
  if (intent.kind === "corrective_action" && intent.requestedCreation) return published("dpoa");
  if (intent.kind !== "none") return null;
  const lower = text.toLowerCase();
  const byName = templates.filter((template) => lower.includes(template.name.toLowerCase()));
  return byName.length === 1 ? byName[0]!.key : null;
}

/** `LIMITS.historyTurns` in `lib/api/validation.ts` (server-only, so not imported here). */
const HISTORY_CAP = 20;

/** Another yes/no question beside the payroll one: "Did you mean **Rowan Testo**?". */
const OTHER_YES_NO =
  /^\s*(?:did\s+you\s+mean|is|isn'?t|are|was|should|shall|do|does|did|will|would|can|could)\b/i;

/**
 * "Yes" / "No" ANSWERING "Is payroll deduct applicable? Yes or No?" — read
 * here, while the reply is still bare. Once the stored slots are put ahead of
 * it the reply is no longer a bare answer, and the card asked the payroll
 * question again (sibling-app live replay, 24 Oct 2026). Only the assistant turn
 * right before it counts, and only when that turn asks no other yes/no
 * question, so the "Yes" that confirms a name is never a payroll answer.
 * Behind WARNING_LEVEL_MANAGER_ONLY_ENABLED.
 */
function payrollAnsweredNow(
  history: readonly { role: string; content: string }[],
  question: string,
): "yes" | "no" | null {
  const before = history[history.length - 1];
  if (!before || before.role !== "assistant") return null;
  const questions = (before.content.replace(/[*_`]/g, "").match(/[^.!?\n]*\?/g) ?? [])
    .map((line) => line.trim())
    .filter((line) => !/payroll/i.test(line) && !/^yes\s+or\s+no\?$/i.test(line));
  // An either/or ("a Verbal Warning or a Written Warning?") is not answered by "Yes", as payroll-deduct.ts reads it too.
  if (questions.some((line) => OTHER_YES_NO.test(line) && !/\bor\b/i.test(line))) return null;
  return payrollDeductFromConversation(
    [
      { role: "assistant", content: before.content },
      { role: "user", content: question },
    ],
    { fromThisForm: true },
  );
}

function parseReading(raw: unknown): IntentSlotReading | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const warning = row.warningLevel;
  return {
    employee: blank(row.employee),
    store: blank(row.store),
    title: blank(row.title),
    incidentType: blank(row.incidentType),
    incidentDate: blank(row.incidentDate),
    payrollAmount: blank(row.payrollAmount),
    warningLevel: warning === "verbal" || warning === "written" ? warning : null,
    formType: blank(row.formType),
    formTurn: row.formTurn === true,
  };
}

/**
 * The manager's own words this conversation. The assistant's turns quote
 * policy figures that the manager never stated, and the saved state may
 * already hold one of those figures.
 */
function managerBlob(input: IntentTurnInput): string {
  const said = input.history.filter((turn) => turn.role === "user").map((turn) => turn.content);
  return [...said, input.question].filter((part) => part.trim() !== "").join("\n");
}

/**
 * The latest amount the manager stated for the deduction itself ("payroll
 * deduct $25", "deduct $40", "$25 will be payroll deducted"). A shortage
 * ("register short $40") is not a deduction.
 */
function payrollClauseAmount(input: IntentTurnInput): string | null {
  const said = [...input.history.filter((turn) => turn.role === "user").map((turn) => turn.content), input.question];
  for (let at = said.length - 1; at >= 0; at -= 1) {
    const stated = payrollDeductAmount(said[at] ?? "");
    if (stated) return canonicalAmount(stated);
  }
  return null;
}

function conversationBlob(input: IntentTurnInput): string {
  const prior = input.history.map((turn) => turn.content);
  const saved = input.saved ? stateSentences(input.saved).join(" ") : "";
  return [...prior, input.question, saved].filter((part) => part.trim() !== "").join("\n");
}

/**
 * NOT_A_NAME_GUARD_ENABLED: the model's employee is kept only when it is in
 * the manager's own words and is a name. The intent model reads the
 * assistant's turns too, and in the sibling app copied "require practice" out of a
 * reply (QA round 4, 24 Oct 2026); "blank" is the manager saying there is
 * nobody yet. Off, the model's slot is read as before.
 */
function guardedTyped(typed: string | null, input: IntentTurnInput): string | null {
  if (!typed?.trim() || !notANameGuardEnabled()) return typed;
  if (isNotAName(typed)) return null;
  const turns = [
    ...input.history.filter((turn) => turn.role === "user").map((turn) => turn.content),
    input.question,
    input.saved ? stateSentences(input.saved).join(" ") : "",
  ];
  return typedBy(turns, typed) ? typed : null;
}

/** The name is in these turns, outside a bulleted or priced offer list. */
function typedBy(turns: readonly string[], name: string): boolean {
  const needle = name.trim().toLowerCase().replace(/\s+/g, " ");
  return turns.some((turn) => maskNotANameText(turn).toLowerCase().replace(/\s+/g, " ").includes(needle));
}

/**
 * NOT_A_NAME_GUARD_ENABLED: a saved employee that came from a reply is not
 * kept. In the sibling app (QA L23), a name read from a manual heading in an
 * assistant reply was saved, and "The employee is …" then outvoted the name
 * the manager typed on every later turn.
 *
 * Only on evidence: the name is not a name at all ("blank"), or an
 * assistant turn in the window says it (other than as a card's subject,
 * `saidInReply`) and none of the manager's turns do. History is
 * capped at 20 turns, so a name typed long ago may be outside the window;
 * with no evidence either way the saved name stays. A roster pick (it
 * carries the directory id) is the manager's choice and stays.
 */
function withoutUntypedSavedName(input: IntentTurnInput): IntentTurnInput {
  const name = input.saved?.employeeName ?? null;
  if (!notANameGuardEnabled() || !input.saved || !name || input.saved.employeeId) return input;
  const said = [...input.history.filter((turn) => turn.role === "user").map((turn) => turn.content), input.question];
  const replies = input.history.filter((turn) => turn.role === "assistant").map((turn) => turn.content);
  const fromReply = !typedBy(said, name) && saidInReply(replies, name);
  if (!isNotAName(name) && !fromReply) return input;
  return { ...input, saved: { ...input.saved, employeeName: null, keptTypedName: null } };
}

function groundEmployee(
  typed: string | null,
  blob: string,
  people: readonly GroundedPerson[],
): { person: GroundedPerson | null; name: string | null; ambiguous: readonly GroundedPerson[]; typed: string | null } {
  const fromText = peopleNamedIn(blob, people);
  const probe = typed?.trim() || (fromText.length === 1 ? displayName(fromText[0]!) : null);
  if (!probe) {
    if (fromText.length > 1) return { person: null, name: null, ambiguous: fromText, typed: displayName(fromText[0]!) };
    return { person: null, name: null, ambiguous: [], typed: null };
  }
  if (people.length === 0) return { person: null, name: probe, ambiguous: [], typed: probe };
  const match = matchEmployeeName(probe, people);
  if (match.kind === "exact") {
    const person = asGrounded(match.employee, people);
    return { person, name: displayName(person), ambiguous: [], typed: probe };
  }
  if (match.kind === "confirm") {
    const rows = match.candidates.map((candidate) => asGrounded(candidate.employee, people));
    const words = probe.split(/\s+/).filter(Boolean);
    if (rows.length === 1 && words.length > 1) {
      return { person: rows[0]!, name: displayName(rows[0]!), ambiguous: [], typed: probe };
    }
    return { person: null, name: null, ambiguous: rows, typed: probe };
  }
  if (match.kind === "unchecked") return { person: null, name: probe, ambiguous: [], typed: probe };
  return { person: null, name: null, ambiguous: [], typed: probe };
}

function peopleNamedIn(blob: string, people: readonly GroundedPerson[]): GroundedPerson[] {
  const haystack = blob.toLowerCase();
  const found: GroundedPerson[] = [];
  for (const person of people) {
    const names = [displayName(person), person.preferredFirstName ? `${person.preferredFirstName} ${person.lastName}` : ""]
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name.includes(" "));
    if (names.some((name) => haystack.includes(name)) && !found.some((row) => row.id === person.id)) found.push(person);
  }
  return found;
}

function asGrounded(employee: RosterEmployee, people: readonly GroundedPerson[]): GroundedPerson {
  return people.find((person) => person.id === employee.id) ?? { ...employee, title: null, primaryLocationName: null };
}

/*
 * PLACE_SPAN_GUARD_ENABLED. The store this turn names wins over the one the
 * conversation saved: "location kearney" after "store is grand island" is
 * Kearney (ported from the sibling app, QA Round 4). A field label counts as the
 * place cue (`store-cue.ts`). Off, or when this turn names no single store,
 * the store is grounded as before.
 */
function newestTurnStore(
  question: string,
  stores: readonly StoreRow[],
): { id: string; name: string; ambiguous: readonly StoreRow[] } | null {
  if (!placeSpanGuardEnabled()) return null;
  const ids = labelledStoreIds(question);
  if (ids.length !== 1) return null;
  const row = stores.find((store) => store.id === ids[0]);
  return row ? { id: row.id, name: row.name, ambiguous: [] } : null;
}

function groundStore(
  typed: string | null,
  blob: string,
  stores: readonly StoreRow[],
  person: GroundedPerson | null,
): { id: string | null; name: string | null; ambiguous: readonly StoreRow[] } {
  const pool = person && person.locationIds.length > 0 ? stores.filter((store) => person.locationIds.includes(store.id)) : stores;
  const list = pool.length > 0 ? pool : stores;
  const probed = typed?.trim() || null;
  const matched = probed ? matchStores(probed, list) : matchStoresInText(blob, list);
  if (matched.length === 1) return { id: matched[0]!.id, name: matched[0]!.name, ambiguous: [] };
  if (matched.length > 1) return { id: null, name: null, ambiguous: matched };
  if (person && person.locationIds.length === 1) {
    const only = stores.find((store) => store.id === person.locationIds[0]);
    if (only) return { id: only.id, name: only.name, ambiguous: [] };
    if (person.primaryLocationName) return { id: person.locationIds[0]!, name: person.primaryLocationName, ambiguous: [] };
  }
  return { id: null, name: null, ambiguous: [] };
}

function matchStores(typed: string, stores: readonly StoreRow[]): StoreRow[] {
  const needle = tokens(typed);
  if (needle.length === 0) return [];
  return stores.filter((store) => covers(tokens(store.name), needle));
}

function matchStoresInText(blob: string, stores: readonly StoreRow[]): StoreRow[] {
  const haystack = new Set(tokens(blob));
  return stores.filter((store) => {
    const words = tokens(store.name);
    return words.length > 0 && words.every((word) => haystack.has(word));
  });
}

function groundTitle(
  typed: string | null,
  blob: string,
  people: readonly GroundedPerson[],
  person: GroundedPerson | null,
  titleText: string | null = null,
): string | null {
  if (person?.title) return person.title;
  const titles = [...new Set(people.map((row) => row.title).filter((title): title is string => Boolean(title?.trim())))];
  const probe = typed?.trim() || null;
  if (probe) {
    const hit = titles.find((title) => title.toLowerCase() === probe.toLowerCase());
    if (hit) return hit;
    const close = titles.filter((title) => editDistance(title.toLowerCase(), probe.toLowerCase()) <= 1);
    if (close.length === 1) return close[0]!;
  }
  if (titleText !== null) {
    // Most specific first: "assistant store manager" is not "Store Manager".
    const stated = extractJobTitle(titleText);
    if (stated) return stated;
  }
  const said = (titleText ?? blob).toLowerCase();
  const inText = titles.filter((title) => said.includes(title.toLowerCase()));
  return inText.length === 1 ? inText[0]! : null;
}

function groundIncident(typed: string | null, blob: string, headings: readonly string[]): string | null {
  const fromAccount = headingFromAccount(blob, headings);
  if (fromAccount) return fromAccount;
  if (!typed) return null;
  const exact = headings.find((heading) => headingKey(heading) === headingKey(typed));
  if (exact) return exact;
  const named = headings.filter((heading) => namesHeading(typed, heading));
  return named.length === 1 ? named[0]! : null;
}

/** The manual heading the account describes, and only a heading that was retrieved. */
export function headingFromAccount(text: string, headings: readonly string[]): string | null {
  const keys = describedAttendanceKeys(text);
  if (!keys || headings.length === 0) return null;
  const wanted = sectionHeadingsFor({ offenseKeys: keys, notes: text }).flat();
  for (const heading of wanted) {
    const found = headings.find((item) => headingKey(item) === headingKey(heading));
    if (found) return found;
  }
  return null;
}

function groundDate(
  typed: string | null,
  blob: string,
  today: string,
): { iso: string | null; ambiguous: readonly string[] } {
  const inText = datesInConversation(blob, today);
  const normalized = typed ? normalizeIncidentDate(typed, today) : null;
  if (normalized && inText.includes(normalized)) return { iso: normalized, ambiguous: [] };
  if (inText.length === 1) return { iso: inText[0]!, ambiguous: [] };
  if (inText.length > 1) return { iso: null, ambiguous: inText };
  return { iso: null, ambiguous: [] };
}

function datesInConversation(blob: string, today: string): string[] {
  const found = new Set(datesInText(blob, today).map((item) => item.iso));
  /*
   * PRIOR_ACTIONS_PARSE_ENABLED: an earlier step's date ("previous coaching
   * jba manual 11-1-26", "jba manual 11-1-25") or a follow-up's is not a
   * date for the form, even when the model read it as the incident's
   * (conv_mvmznap42vcw0dl dated a form 2025-11-01).
   */
  if (priorActionsParseEnabled()) {
    const kept = new Set(listFormDates(blob, today).map((item) => item.iso));
    for (const iso of [...found]) if (!kept.has(iso)) found.delete(iso);
  }
  DAY_MONTH.lastIndex = 0;
  for (const match of blob.matchAll(DAY_MONTH)) {
    const iso = dayMonthIso(match, today);
    if (iso) found.add(iso);
  }
  return [...found];
}

function dayMonthIso(match: RegExpMatchArray, today: string): string | null {
  const month = MONTHS[match[2]!.toLowerCase().replace(/\./g, "")];
  if (!month) return null;
  const year = match[3] ? Number(match[3]) : Number(today.slice(0, 4));
  return calendarIso(year, month, Number(match[1]));
}

function groundPayroll(typed: string | null, blob: string): string | null {
  const found = payrollAmounts(blob);
  if (typed) {
    const wanted = canonicalAmount(typed);
    if (wanted && found.includes(wanted)) return wanted;
  }
  return found.length === 1 ? found[0]! : null;
}

export function payrollAmounts(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\$\s*(\d{1,6}(?:\.\d{1,2})?)/g)) {
    const amount = canonicalAmount(match[1] ?? "");
    if (amount) found.add(amount);
  }
  for (const match of text.matchAll(/\b(\d{1,6}(?:\.\d{1,2})?)\s*(?:dollars|dollar)\b/gi)) {
    const amount = canonicalAmount(match[1] ?? "");
    if (amount) found.add(amount);
  }
  return [...found];
}

function groundWarning(
  typed: "verbal" | "written" | null,
  blob: string,
): { value: "verbal" | "written" | null; ambiguous: boolean } {
  const verbal = /\bverbal\b/i.test(blob);
  const written = /\bwritten\b/i.test(blob);
  if (verbal && written) {
    if (typed === "verbal" || typed === "written") return { value: typed, ambiguous: false };
    return { value: null, ambiguous: true };
  }
  if (verbal) return { value: "verbal", ambiguous: false };
  if (written) return { value: "written", ambiguous: false };
  return { value: null, ambiguous: false };
}

function groundForm(
  typed: string | null,
  blob: string,
  templates: readonly TemplateRow[],
  turn?: { readonly question: string; readonly managerText: string },
): { key: string | null; ambiguous: readonly TemplateRow[] } {
  const probed = typed?.trim() || null;
  const fromTyped = probed ? matchTemplates(probed, templates) : [];
  if (fromTyped.length === 1) return { key: fromTyped[0]!.key, ambiguous: [] };
  if (fromTyped.length > 1) return { key: null, ambiguous: fromTyped };
  const requested = turn && caTemplateMapEnabled() ? correctiveActionRequestKey(turn, templates) : null;
  if (requested) return { key: requested, ambiguous: [] };
  const fromText = templates.filter((template) => blob.toLowerCase().includes(template.name.toLowerCase()));
  if (fromText.length === 1) return { key: fromText[0]!.key, ambiguous: [] };
  if (fromText.length > 1) return { key: null, ambiguous: fromText };
  return { key: null, ambiguous: [] };
}

/** The Corrective Action Form's library key; the template reader names it the same way. */
const CORRECTIVE_ACTION_KEY = "dpoa";

/**
 * CA_TEMPLATE_MAP_ENABLED (QA F4, 24 Oct 2026). "create a Verbal CA for …",
 * "I need a CA for someone opening the store late": this turn asks for a
 * corrective action to be started. With no model reading, only a template
 * name typed in full was kept, so the slot stayed empty. The form that
 * records it is the published Corrective Action Form, whether the template
 * reader calls the request the progression ("verbal CA") or the form itself
 * ("CA for …"). A question about corrective action starts nothing, and a
 * metric with no behaviour is the progression, as the form proposal reads it.
 */
function correctiveActionRequestKey(
  turn: { readonly question: string; readonly managerText: string },
  templates: readonly TemplateRow[],
): string | null {
  const intent = detectTemplateIntent(turn.question);
  const asked =
    (intent.kind === "corrective_action" && intent.requestedCreation) ||
    (intent.kind === "explicit" && intent.templateKey === CORRECTIVE_ACTION_KEY);
  if (!asked) return null;
  if (correctiveActionBasis(turn.managerText) === "metric_only") return null;
  return templates.some((template) => template.key === CORRECTIVE_ACTION_KEY) ? CORRECTIVE_ACTION_KEY : null;
}

function matchTemplates(typed: string, templates: readonly TemplateRow[]): TemplateRow[] {
  const needle = typed.toLowerCase().trim();
  const exact = templates.filter((template) => template.key.toLowerCase() === needle || template.name.toLowerCase() === needle);
  if (exact.length > 0) return exact;
  if (needle.length < 4) return [];
  return templates.filter((template) => template.name.toLowerCase().includes(needle) || needle.includes(template.name.toLowerCase()));
}

function mergeSlots(
  prior: ConversationFormState,
  slots: {
    employee: ReturnType<typeof groundEmployee>;
    store: ReturnType<typeof groundStore>;
    title: string | null;
    incidentType: string | null;
    date: string | null;
    payrollAmount: string | null;
    /** The manager's Yes/No, when INTENT_PAYROLL_MANAGER_ONLY_ENABLED is on. */
    payrollAnswer?: PayrollDeductAnswer | null;
    /** INTENT_PAYROLL_MANAGER_ONLY_ENABLED: Yes/No only from the manager's answer, never from an amount alone. */
    managerOnly?: boolean;
    /** LATE_OPEN_DATE_ENABLED: the manager's stated Yes/No is kept, ahead of an amount's Yes. */
    managerAnswer?: boolean;
    warningLevel: "verbal" | "written" | null;
    formType: string | null;
  },
): ConversationFormState {
  const named = slots.employee.name;
  return {
    ...prior,
    employeeId: slots.employee.person?.id ?? prior.employeeId,
    employeeName: slots.employee.person ? displayName(slots.employee.person) : named ?? prior.employeeName,
    locationId: slots.store.id ?? prior.locationId,
    title: slots.title ?? prior.title,
    formDate: slots.date ?? prior.formDate,
    warningLevel: slots.warningLevel ?? prior.warningLevel,
    payrollDeduct: slots.managerOnly
      ? (slots.payrollAnswer ?? prior.payrollDeduct)
      : slots.managerAnswer && slots.payrollAnswer
        ? slots.payrollAnswer
        : slots.payrollAmount
          ? "yes"
          : prior.payrollDeduct,
    templateKey: slots.formType ?? prior.templateKey,
    incidentType: slots.incidentType ?? prior.incidentType,
    payrollAmount: slots.payrollAnswer === "no" ? null : slots.payrollAmount ?? prior.payrollAmount,
  };
}

function clarificationFor(input: {
  formTurn: boolean;
  employee: ReturnType<typeof groundEmployee>;
  store: ReturnType<typeof groundStore>;
  title: string | null;
  incidentType: string | null;
  date: { iso: string | null; ambiguous: readonly string[] };
  payrollAmount: string | null;
  warningLevel: { value: "verbal" | "written" | null; ambiguous: boolean };
  formType: { key: string | null; ambiguous: readonly TemplateRow[]; together?: boolean };
  state: ConversationFormState;
  people: readonly GroundedPerson[];
  stores: readonly StoreRow[];
  templates: readonly TemplateRow[];
}): string | null {
  if (input.employee.ambiguous.length > 1 || (input.employee.ambiguous.length === 1 && !input.employee.person)) {
    return personQuestion(input.employee.ambiguous, input.employee.typed, input.stores);
  }
  if (input.store.ambiguous.length > 1) return storeQuestion(input.store.ambiguous);
  if (input.date.ambiguous.length > 1) return dateQuestion(input.date.ambiguous);
  if (input.formType.ambiguous.length > 1 && input.formType.together) return startWithQuestion(input.formType.ambiguous);
  if (input.formType.ambiguous.length > 1) return formQuestion(input.formType.ambiguous);
  if (input.warningLevel.ambiguous) {
    return "Which warning level did you mean? Reply with the number.\n1. **verbal**\n2. **written**";
  }
  if (!input.formTurn) return null;

  const missing: string[] = [];
  if (!input.state.employeeName) {
    missing.push(
      input.employee.typed
        ? `which employee — **${input.employee.typed}** is not in the Woven roster`
        : "which employee",
    );
  }
  if (!input.state.locationId) missing.push("which store");
  if (input.state.employeeName && !input.state.title) missing.push("the job title");
  if (!input.state.incidentType) missing.push("what happened");
  if (!input.state.formDate) missing.push("the date it happened");
  if (!input.state.templateKey) missing.push("which form");
  const corrective = isCorrective(input.state.templateKey, input.templates);
  if (corrective && !input.state.warningLevel) missing.push("the warning level, verbal or written");
  if (corrective && input.state.payrollDeduct === "yes" && !input.state.payrollAmount) missing.push("the payroll amount");
  if (missing.length === 0) return null;
  return `I still need ${joinList(missing)}.`;
}

function isCorrective(key: string | null, templates: readonly TemplateRow[]): boolean {
  if (!key) return false;
  const template = templates.find((item) => item.key === key);
  const name = `${key} ${template?.name ?? ""}`.toLowerCase();
  return name.includes("corrective");
}

function personQuestion(people: readonly GroundedPerson[], typed: string | null, stores: readonly StoreRow[]): string {
  const options = people.map((person, index) => {
    const detail = personDetail(person, stores);
    const label = detail ? `**${displayName(person)}** (${detail})` : `**${displayName(person)}**`;
    return `${index + 1}. ${label}`;
  });
  const who = typed ? ` for **${typed}**` : "";
  return `Which person did you mean${who}? Reply with the number, the store, or the job title.\n${options.join("\n")}`;
}

function storeQuestion(stores: readonly StoreRow[]): string {
  const options = stores.map((store, index) => `${index + 1}. **${store.name}**`);
  return `Which store did you mean? Reply with the number or the store.\n${options.join("\n")}`;
}

function dateQuestion(dates: readonly string[]): string {
  const options = dates.map((iso, index) => `${index + 1}. **${slashDate(iso)}**`);
  return `Which date should go on the form? Reply with the number.\n${options.join("\n")}`;
}

function formQuestion(templates: readonly TemplateRow[]): string {
  const options = templates.map((template, index) => `${index + 1}. **${template.name}**`);
  return `Which form did you mean? Reply with the number or the form.\n${options.join("\n")}`;
}

/**
 * FORM_CHOICE_STATED_ENABLED: two forms asked for in one turn; one card at a
 * time. The same question the full remap asks, answered with the form's name.
 */
function startWithQuestion(templates: readonly TemplateRow[]): string {
  const names = templates.map((template) => `the **${template.name}**`);
  const choices = names.length === 2 ? names.join(" or ") : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
  return `Which form should I start with — ${choices}? I'll draft one at a time; ask for the other once this one is done.`;
}

export function personDetail(person: GroundedPerson, stores: readonly StoreRow[]): string | null {
  const names = person.locationIds
    .map((id) => stores.find((store) => store.id === id)?.name ?? (person.primaryLocationName && person.locationIds.length === 1 ? person.primaryLocationName : null))
    .filter((name): name is string => Boolean(name));
  const unique = [...new Set(names)];
  const store = unique.length > 0 ? unique.join(", ") : person.primaryLocationName;
  const detail = [store, person.title].filter(Boolean).join(", ");
  return detail || null;
}

function readPriorChoice(
  history: readonly { role: string; content: string }[],
  reply: string,
  people: readonly GroundedPerson[],
  stores: readonly StoreRow[],
): { person?: GroundedPerson; store?: string; date?: string; form?: string; warning?: "verbal" | "written" } | null {
  const asked = [...history].reverse().find((turn) => turn.role === "assistant");
  if (!asked) return null;
  const options = choiceOptions(asked.content);
  if (options.length < 2) return null;
  const index = numberChoice(reply, options.length);
  const detailHits = options.filter((option) => optionMatches(reply, option));
  const picked = index !== null ? options[index] : detailHits.length === 1 ? detailHits[0] : null;
  if (!picked) return null;
  if (asked.content.startsWith("Which store")) return { store: picked.label };
  if (asked.content.startsWith("Which date")) return { date: picked.label };
  if (asked.content.startsWith("Which form")) return { form: picked.label };
  if (asked.content.startsWith("Which warning")) {
    const level = picked.label.toLowerCase();
    return level === "verbal" || level === "written" ? { warning: level } : null;
  }
  if (!asked.content.startsWith("Which person")) return null;
  const rows = people.filter((person) => displayName(person).toLowerCase() === picked.label.toLowerCase());
  const person =
    rows.length === 1
      ? rows[0]
      : rows.find((row) => personDetail(row, stores)?.toLowerCase() === picked.detail?.toLowerCase()) ?? null;
  return person ? { person } : null;
}

function choiceOptions(content: string): ChoiceOption[] {
  const options: ChoiceOption[] = [];
  for (const line of content.split("\n")) {
    const match = /^\s*(\d+)\.\s+\*\*([^*]+)\*\*(?:\s+\(([^)]*)\))?/.exec(line);
    if (!match) continue;
    options.push({ label: match[2]!.trim(), detail: match[3]?.trim() || null });
  }
  return options;
}

function numberChoice(reply: string, count: number): number | null {
  const trimmed = reply.trim().toLowerCase();
  const digit = /^(\d+)\b/.exec(trimmed);
  if (digit) {
    const index = Number(digit[1]) - 1;
    return index >= 0 && index < count ? index : null;
  }
  const words = ["first", "second", "third", "fourth", "fifth"];
  const found = words.findIndex((word) => trimmed.startsWith(word));
  return found >= 0 && found < count ? found : null;
}

function optionMatches(reply: string, option: ChoiceOption): boolean {
  const haystack = reply.toLowerCase();
  if (option.detail) {
    const parts = option.detail.toLowerCase().split(",");
    if (parts.some((part) => part.trim().length > 3 && haystack.includes(part.trim().toLowerCase()))) return true;
  }
  const labelWords = tokens(option.label);
  return labelWords.length > 0 && labelWords.every((word) => haystack.includes(word));
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length >= 4);
}

function covers(nameWords: readonly string[], needle: readonly string[]): boolean {
  if (nameWords.length === 0 || needle.length === 0) return false;
  return nameWords.every((word) => needle.some((other) => other === word || editDistance(word, other) <= 1));
}

function canonicalAmount(raw: string): string | null {
  const match = /(\d{1,6})(?:\.(\d{1,2}))?/.exec(raw.replace(/,/g, ""));
  if (!match) return null;
  const whole = String(Number(match[1]));
  if (match[2] === undefined) return whole;
  return `${whole}.${match[2].padEnd(2, "0").slice(0, 2)}`;
}

function calendarIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > days) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function slashDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${Number(month)}/${Number(day)}/${year}`;
}

function joinList(items: readonly string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function blank(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}
