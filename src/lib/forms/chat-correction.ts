import "server-only";

import { companyFormFor, type ChatCorrectableField } from "@/config/company/forms";
import type { AskResponse } from "@/lib/ai/types";

import {
  answerStatementText,
  blocksForVariant,
  checkboxGroupsForVariant,
  displayDate,
  fieldsForVariant,
  parseFormDocument,
  responsibilityMap,
  type FormDocument,
} from "./document";
import { CORRECTABLE_KEYS, correctionValues, employmentChangeKind, syncNarrative } from "./employment-change";
import { EXIT_CORRECTABLE_KEYS, exitCorrectionValues } from "./exit-details";
import { isExitDocumentKeys } from "./exit-draft";
import { authorizeInstance } from "./instance-scope";
import { PAYROLL_DEDUCT_KEY, payrollDeductChecked, payrollDeductCorrection } from "./payroll-deduct";
import { extractEmployeeNames, samePerson as samePersonByName } from "./proposal";
import { clausesOf, LEAD_IN, separateQuestions } from "./message-parts";
import { isQuestion } from "./question";
import { singleSpokenDate } from "./relative-date";
import { detectTemplateIntent } from "./template-intent";
import { saveInstanceValues } from "./instances";
import { enforcePersonEdit } from "./responsibility";
import { namesIncidentTopic } from "./corrective-action-intake";
import {
  WARNING_LEVEL_KEYS,
  WARNING_TYPE_KEY,
  warningLevelChecked,
  warningLevelCorrection,
} from "./warning-level";

/**
 * ============================================================================
 * CORRECTING A FORM THAT ALREADY EXISTS, FROM THE CONVERSATION
 * ============================================================================
 *
 * "Change her new location to salon 24", typed after the Demotion or Position
 * Transfer Form was created in this conversation, updates that form rather
 * than starting the interview again. So does "actually she did return her
 * key" or "her last day was 9/16" on the Resignation/Exit Form — read with
 * the exit form's own readers (`exitCorrectionValues`), so the same words
 * that filled the draft are what correct it.
 *
 * EVERYTHING IS RE-CHECKED. The browser names the instance; this loads it and
 * runs `authorizeInstance` with the "edit" action, which applies the TEMPLATE'S
 * own permission and the salon scope exactly as the inline editor's save does.
 * An id that fails, or that is not an employment change form, returns null and
 * the turn is answered as it always would have been.
 *
 * IT IS THE MANAGER'S OWN EDIT. Saved through `saveInstanceValues` — the same
 * path as typing into the field — so it is recorded as the manager's, refused
 * on a finalized form, and limited to fields a person may edit.
 */
async function correctFromFormReaders(
  input: {
    request: Request;
    instanceId: string;
    question: string;
    today: string;
    /** The whole message, when `question` is one clause of it. */
    message?: string;
  },
  applied: AppliedBy = {},
): Promise<AskResponse | null> {
  // A cheap first reading, before anything is loaded: most turns are not corrections.
  const employmentCorrection = correctionValues(input.question, input.today);
  const exitCorrection = exitCorrectionValues(input.question, input.today);
  const payroll = payrollDeductCorrection(input.question);
  /*
   * "CHANGE WRITTEN WARNING TO VERBAL", "make it verbal" — the Type of
   * Warning on a Corrective Action Form, as the manager now states it. A
   * warning described as already given is history and corrects nothing.
   */
  /*
   * ANOTHER INCIDENT IS NOT A CORRECTION. "sarah was late today, make it a
   * verbal warning" names somebody's conduct and asks for a level; with no
   * change verb it is a new request, and the ordinary flow proposes it.
   */
  /*
   * Read against the WHOLE message, not just the clause being retried
   * (`correctActiveForm` retries correction clauses on their own): "sarah was
   * late again today, make it a written warning" is about Sarah however it is
   * split.
   */
  const whole = input.message ?? input.question;
  const warning =
    namesIncidentTopic(whole) && !/\b(?:change|switch|set|update|correct)\b/i.test(whole)
      ? null
      : warningLevelCorrection(input.question, input.today);
  if (!employmentCorrection && !exitCorrection && !payroll && !warning) return null;

  let authorized: Awaited<ReturnType<typeof authorizeInstance>>;
  try {
    authorized = await authorizeInstance(input.request, input.instanceId, "edit");
  } catch {
    // Not visible, not permitted, or gone: the turn goes on as a normal one.
    return null;
  }
  const { actor, loaded } = authorized;
  const document = parseFormDocument(loaded.version.document);
  const variantKey = loaded.instance.variantKey;
  const kind = employmentChangeKind(loaded.instance.templateKey);
  /*
   * "NO PAYROLL DEDUCTION" / "CHANGE PAYROLL DEDUCT TO YES" on a form whose
   * version asks "Is payroll deduct applicable?" — today the Corrective Action
   * Form. That one answer is the only thing such a form takes from chat; its
   * other lines are edited on the form. Read off the version's keys, so no
   * template key is special-cased.
   */
  const asksPayroll = checkboxGroupsForVariant(document, variantKey).some(
    (group) => group.key === PAYROLL_DEDUCT_KEY,
  );
  /*
   * THE TYPE OF WARNING, on a version whose group offers the level stated —
   * read off the version's keys, like the payroll question.
   */
  const warningOptions =
    checkboxGroupsForVariant(document, variantKey)
      .find((group) => group.key === WARNING_TYPE_KEY)
      ?.options.map((option) => option.key) ?? [];
  /*
   * Only the LEVEL changes. A Termination or Demotion a manager ticked by hand
   * on a leadership decision stays exactly as they left it.
   */
  const existingWarning = loaded.values.find((row) => row.fieldKey === WARNING_TYPE_KEY)?.checked ?? [];
  const level = warningLevelChecked(warning, warningOptions)[WARNING_TYPE_KEY];
  const warningChecked: Record<string, string[]> = level
    ? { [WARNING_TYPE_KEY]: [...existingWarning.filter((option) => !WARNING_LEVEL_KEYS.has(option)), ...level] }
    : {};
  /*
   * SOMEBODY ELSE, NAMED THE WAY MANAGERS TYPE: "kim was late too. change it
   * to verbal", "change it to verbal for sarah". A lowercase first name is not
   * caught by `extractEmployeeNames`, so the level is not changed on this
   * form when the message's subject, or who it is "for", is somebody else.
   */
  const correctsWarning =
    Object.keys(warningChecked).length > 0 &&
    !aboutSomebodyElse(input.message ?? input.question, loaded.instance.employeeName);
  // The Exit Form, read off the pinned version's keys as the drafting route does.
  const isExit = !kind && isExitDocumentKeys(responsibilityMap(document, variantKey).keys());
  if (!kind && !isExit && !(asksPayroll && payroll) && !correctsWarning) return null;
  /*
   * ==========================================================================
   * A NEW REQUEST IS NEVER A CORRECTION TO THE LAST FORM
   * ==========================================================================
   *
   * Found in hands-on QA: with a Demotion Form for one employee open, "pull
   * up a transfer form for jane doe, … from stc 12 to salon 18" was read as a
   * correction and wrote Jane's details onto the other employee's demotion.
   * So a turn that asks for a form (any other than this one), or that names a
   * person who is not this form's employee, is left to the ordinary flow —
   * which proposes the new form.
   */
  const intent = detectTemplateIntent(input.question);
  /*
   * "Verbal warning" and "written warning" NAME this form, so a correction of
   * its level reads as an explicit request for it. "Make it a verbal warning"
   * is still a correction; "make a new written warning for Jordan" is not.
   */
  const asksNewForm = correctsWarning
    ? /\b(?:create|start|pull up|new|another)\b|\bmake\s+(?:a|an)\b|\bneed\s+(?:a|an)\b/i.test(input.question)
    : /\b(?:create|make|start|pull up|new|another|need)\b/i.test(input.question);
  if (
    intent.kind === "ambiguous" ||
    intent.kind === "corrective_action" ||
    (intent.kind === "explicit" && intent.templateKey !== loaded.instance.templateKey) ||
    (intent.kind === "explicit" && asksNewForm)
  ) {
    return null;
  }
  // "change the name to …" is the one correction that names somebody new, on purpose.
  const renaming = /\b(?:change|update|correct|fix|set|make)\s+(?:the\s+|her\s+|his\s+|their\s+)?(?:employee(?:'s)?\s+)?name\b/i.test(input.question);
  // The WHOLE message: "Jordan Smith was late. Change it to verbal" is about Jordan, however it is split.
  const named = renaming ? [] : extractEmployeeNames(input.message ?? input.question);
  if (named.length > 0 && !named.some((name) => samePerson(name, loaded.instance.employeeName))) {
    return null;
  }

  /*
   * THE EXIT FORM'S CORRECTION is its own readers' reading, plus the one
   * header line a correction may name on purpose — the employee's name.
   */
  const exitValues =
    exitCorrection || employmentCorrection?.values.employee_name
      ? {
          values: {
            ...(exitCorrection?.values ?? {}),
            ...(employmentCorrection?.values.employee_name
              ? { employee_name: employmentCorrection.values.employee_name }
              : {}),
          },
          checked: exitCorrection?.checked ?? {},
        }
      : null;
  const correction = kind
    ? employmentCorrection
    : isExit
      ? exitValues
      : {
          values: {},
          checked: {
            ...(asksPayroll ? payrollDeductChecked(payroll) : {}),
            ...warningChecked,
          },
        };
  if (!correction) return null;

  const who = `**${loaded.instance.templateName}** for **${loaded.instance.employeeName}**`;
  if (loaded.instance.status !== "draft") {
    return reply(
      `The ${who} is finalized, so I haven't changed it. Open it from Form Monitoring and create a revision to make a change.`,
    );
  }

  const correctable: ReadonlySet<string> = kind
    ? CORRECTABLE_KEYS
    : isExit
      ? EXIT_CORRECTABLE_KEYS
      : new Set([PAYROLL_DEDUCT_KEY, WARNING_TYPE_KEY]);
  const restrict = <T,>(entries: Record<string, T>) =>
    Object.fromEntries(Object.entries(entries).filter(([key]) => correctable.has(key)));
  const values = restrict(correction.values);
  const checked = restrict(correction.checked);

  // Only keys this version actually has; the rest are not a correction to THIS form.
  const present = new Set([
    ...fieldsForVariant(document, variantKey).map((field) => field.key),
    ...checkboxGroupsForVariant(document, variantKey).map((group) => group.key),
  ]);
  const onForm = <T,>(entries: Record<string, T>) =>
    Object.fromEntries(Object.entries(entries).filter(([key]) => present.has(key)));
  const submitted = { values: onForm(values), checked: onForm(checked) };
  const keys = [...Object.keys(submitted.values), ...Object.keys(submitted.checked)];
  if (keys.length === 0) return null;

  /*
   * WHAT THE PERSON MAY WRITE, decided before anything is saved — the same
   * `enforcePersonEdit` the save applies — so the paragraph below is only
   * ever brought in line with a value that is actually going to be written.
   */
  const accepted = enforcePersonEdit(document, variantKey, submitted);
  const refused = new Set(accepted.rejected.map((entry) => entry.key));
  const updated = keys.filter((key) => !refused.has(key));
  if (updated.length === 0) return null;

  const reason =
    kind || isExit
      ? loaded.values.find((row) => row.fieldKey === "reason" || row.fieldKey === "details")
      : undefined;
  // The exit form's paragraph is printed as "Additional Details" from revision 2.
  const paragraph =
    reason?.fieldKey === "details"
      ? `${fieldsForVariant(document, variantKey).find((field) => field.key === "details")?.label ?? "Details"} paragraph`
      : "reason paragraph";

  /*
   * THE PARAGRAPH FOLLOWS THE FIELD — on the Demotion and Position Transfer
   * Forms. A value the correction replaced is also replaced where the reason
   * paragraph names it, so the form never says "Salon 24" in one place and
   * "salon 23" in another. See `syncNarrative`, which rewrites only what it
   * can prove is that value and reports the rest. The Exit Form's Details
   * paragraph is not rewritten here; it keeps its reminder below.
   */
  const narrative = reason?.value ?? "";
  let sync: ReturnType<typeof syncNarrative> | null = null;
  if (kind && reason && narrative.trim() !== "") {
    const previous = new Map(loaded.values.map((row) => [row.fieldKey, row.value ?? ""]));
    const changedText = updated.filter((key) => key in submitted.values);
    sync = syncNarrative({
      narrative,
      changes: changedText.map((key) => ({ from: previous.get(key) ?? "", to: submitted.values[key]! })),
      unchanged: loaded.values
        .filter((row) => row.fieldKey !== reason.fieldKey && !changedText.includes(row.fieldKey))
        .map((row) => row.value ?? "")
        .filter((value) => value.trim() !== ""),
    });
  }
  /*
   * ONLY A PARAGRAPH ASK BUBBLES DRAFTED IS REWRITTEN. Found in QA: a reason the
   * manager wrote themselves ("she asked to move to salon 23 because salon 23
   * is closer to home") became "…because Salon 24 is closer to home" — the
   * manager's own account, changed. A paragraph a person wrote or edited is
   * never rewritten; what would have changed is reported for them instead.
   */
  const drafted = reason?.filledBy === "ai";
  if (sync && !drafted) {
    sync = {
      text: narrative,
      replaced: [],
      left: [...new Set([...sync.left, ...sync.replaced.map((change) => change.from)])],
    };
  }
  const syncedKey = reason && sync && sync.text !== narrative ? reason.fieldKey : null;

  /*
   * ONE SAVE. The corrected field and the paragraph that names it are written
   * together, in the single upsert `saveInstanceValues` makes, so a failure
   * leaves neither: the form can never hold "Salon 24" beside a reason that
   * still says "salon 23" because a second write failed after the first.
   */
  const toSave = {
    values: { ...accepted.values, ...(syncedKey ? { [syncedKey]: sync!.text } : {}) },
    checked: accepted.checked,
  };
  const saved = await saveInstanceValues(input.instanceId, toSave, actor.id);
  // The reply reports only what the save itself accepted.
  const refusedOnSave = new Set(saved.rejected.map((entry) => entry.key));
  const written = updated.filter((key) => !refusedOnSave.has(key));
  if (written.length === 0) return null;
  const rewritten = syncedKey && !refusedOnSave.has(syncedKey) ? syncedKey : null;

  const before = Object.fromEntries(loaded.values.map((row) => [row.fieldKey, row.checked]));
  const after = { ...before, ...submitted.checked };
  const described = written
    .map((key) => describe(document, variantKey, key, submitted, { before, after }))
    .filter((line): line is string => line !== null);
  const lines = [
    // A Details line is its own sentence ("…eligible for rehire."), so no second full stop.
    `Updated the ${who}: ${described.length > 0 ? described.join("; ") : "Resignation Details boxes cleared"}.`.replace(/\.\.$/, "."),
  ];
  if (rewritten) {
    written.push(rewritten);
    const changes = sync!.replaced.map((change) => `"${change.from}" → "${change.to}"`).join(", ");
    lines.push("", `I changed ${changes} in the ${paragraph} too, so it matches the form.`);
  }
  if (sync && sync.left.length > 0) {
    const values = sync.left.map((value) => `"${value}"`).join(", ");
    lines.push(
      "",
      `The ${paragraph} still mentions ${values}, which I didn't change automatically because I can't be sure that mention means this line — check that it still says what you mean.`,
    );
  } else if (reason && narrative.trim() !== "" && !rewritten) {
    lines.push("", `The ${paragraph} was written before this change — give it a quick read to make sure it still matches.`);
  }

  // What THIS form's readers take from a clause — the test for "was that part done?".
  applied.reads = (clause) =>
    Boolean(
      (kind && correctionValues(clause, input.today)) ||
        (isExit && exitCorrectionValues(clause, input.today)) ||
        (asksPayroll && payrollDeductCorrection(clause)),
    );
  return { ...reply(lines.join("\n")), formUpdate: { instanceId: input.instanceId, updated: written } };
}

/** Words that can stand where a person would and are not one. */
const NOT_A_PERSON = new Set([
  "she", "he", "they", "her", "him", "them", "it", "this", "that", "there", "i", "we", "you", "me", "us",
  "the", "a", "an", "today", "now", "being", "everyone", "nobody", "someone", "same",
  "attendance", "tardiness", "lateness", "absence", "conduct", "policy", "performance", "cash", "dress",
  "uniform", "safety", "warning", "verbal", "written", "also", "and", "too", "then", "actually",
  "but", "so", "my", "our", "your", "his", "their", "its", "traffic", "manager", "mistake", "sure", "real",
  "bus", "car", "hr", "nobody", "everybody", "everything", "nothing", "something", "store", "shift",
  "good", "it's", "that's", "what", "who", "which", "one", "please", "form", "draft", "change",
  "consistency", "fairness", "schedule", "dm", "payroll", "policy", "it", "everyone's", "team", "notes",
]);

/**
 * Whether the message is about a person other than `employee`: a sentence
 * whose subject is another first name ("kim was late too"), or a level asked
 * "for" another name ("change it to verbal for sarah").
 */
function aboutSomebodyElse(message: string, employee: string): boolean {
  const own = new Set(employee.toLowerCase().split(/\s+/).filter(Boolean));
  const other = (word: string) => {
    const w = word.toLowerCase().replace(/['’]s$/, "");
    return !NOT_A_PERSON.has(w) && !own.has(w) && !namesIncidentTopic(w);
  };
  // "kim was late", "and jo was late", "jordan smith was late": either word of the subject.
  const subjects = message.matchAll(
    /(?:^|[.!?;,]\s*|\b(?:and|also|too|but)\s+)([a-z][a-z'’-]+)(?:\s+([a-z][a-z'’-]+))?\s+(?:was|were|is|are|has|had|got|did|left|came|showed|called|didn'?t|wasn'?t|isn'?t|keeps|kept|needs|deserves)\b/gi,
  );
  for (const match of subjects) if (other(match[1]!) || (match[2] && other(match[2]))) return true;
  // "also jo.", "kim too, make it verbal" — a bare first name added on.
  for (const match of message.matchAll(/(?:^|[.!?;,]\s*)(?:also|and)\s+([a-z][a-z'’-]+)\s*(?:[.,!:]|too\b|$)|\b([a-z][a-z'’-]+)\s+too\b/gi)) {
    const word = match[1] ?? match[2]!;
    if (other(word)) return true;
  }
  // "kim's late too", "kim's out today".
  for (const match of message.matchAll(/\b([a-z][a-z-]+)['’]s\s+(?:late|absent|out|rude|also|been|not|on)\b/gi)) {
    if (other(match[1]!)) return true;
  }
  // "change kim to verbal".
  for (const match of message.matchAll(/\b(?:change|set|make|switch|move|put)\s+([a-z][a-z'’-]+)\s+(?:to|as|on)\b/gi)) {
    if (other(match[1]!)) return true;
  }
  // "…for kim", "for jordan:", "for kim please", "for kim's form".
  for (const match of message.matchAll(/\bfor\s+([a-z][a-z-]+)(?:['’]s\b|\s*(?:[.!:,]|$)|\s+(?:please|too|instead)\b)/gi)) {
    if (other(match[1]!)) return true;
  }
  return false;
}

/** "jane", "Jane Doe" and "JANE DOE" name the employee on a form for "Jane Doe". */
function samePerson(named: string, employee: string): boolean {
  // "change paulyne's warning to verbal" names Paulyne; the verb is not part of the name.
  const a = named
    .toLowerCase()
    .replace(/^(?:change|update|set|make|fix|correct|switch)\s+/, "")
    .replace(/['’]s$/, "")
    .split(/\s+/);
  const b = employee.toLowerCase().split(/\s+/);
  return a.join(" ") === b.join(" ") || (a.length === 1 && a[0] === b[0]);
}

/* ------------------------------------------------- header lines ------ */

/**
 * ============================================================================
 * CORRECTING A FORM THAT ALREADY EXISTS, FROM THE CONVERSATION
 * ============================================================================
 *
 * Ported from the reference platform's `chat-correction.ts`. "Change the date
 * to yesterday" or "change the name to Jane Doe-Smith", typed after a draft was
 * created in this conversation, updates THAT draft rather than starting the
 * interview again or answering with advice.
 *
 * WHAT WAS PORTED is the machinery, which names no form: the cheap first
 * reading, re-authorization, the "a new request is not a correction" and
 * "somebody else is not this employee" guards, the person-edit rules, one
 * save, and a reply in the form's own labels with a `formUpdate` the browser
 * uses to refresh the open form.
 *
 * THE FORMS' OWN READERS were ported too, unchanged, as
 * `correctFromFormReaders` (the transfer, demotion, exit and payroll lines);
 * they run first. This header reader is the generic fallback: a form opts in
 * through the company registry, `chatCorrectableFields`, and only the header
 * lines the platform can read generically are offered — the employee's name
 * and the form's date.
 *
 * EVERYTHING IS RE-CHECKED. The browser names the instance; this loads it and
 * runs `authorizeInstance` with the "edit" action, which applies the
 * template's own permission and the location scope exactly as the inline
 * editor's save does. An id that fails returns null and the turn is answered
 * as it always would have been.
 *
 * IT IS THE MANAGER'S OWN EDIT. Saved through `saveInstanceValues` — the same
 * path as typing into the field — so it is recorded as the manager's, refused
 * on a finalized form, and limited to fields a person may edit.
 */

const VERB = String.raw`(?:change|update|correct|fix|set|make)`;
const NAME_CORRECTION = new RegExp(
  String.raw`\b${VERB}\s+(?:the\s+|her\s+|his\s+|their\s+)?(?:employee(?:'s)?\s+|team member(?:'s)?\s+)?name\s+(?:to|is|should be)\s+(.+?)\s*[.!]?$`,
  "i",
);
/* "Actually her name is Jane Doe-Smith." — the correction said as a statement. */
const NAME_STATEMENT =
  /^(?:(?:sorry|oops|actually|no)[,.!\s]+)*(?:her|his|their|the employee'?s|the team member'?s)\s+(?:full\s+)?name\s+is\s+(?:actually\s+)?(.+?)\s*[.!]?$/i;
/*
 * "Change Avery's date to …" / "change the date for Avery to …" — the person
 * named is how one of several open forms is picked (`activeFormInstanceFor`),
 * and the guard below still refuses it on anybody else's form.
 */
const DATE_CORRECTION = new RegExp(
  String.raw`\b${VERB}\s+(?:the\s+|[a-z][a-z-]*(?:\s+[a-z][a-z-]*)?['’]s\s+)?(?:form(?:'s)?\s+)?date\s+(?:(?:for|on)\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*)?(?:['’]s)?(?:\s+form)?\s+)?(?:to|is|should be|as)\s+`,
  "i",
);
const DATE_STATEMENT =
  /^(?:(?:sorry|oops|actually|no)[,.!\s]+)*(?:the\s+)?(?:form(?:'s)?\s+)?date\s+(?:should\s+(?:be|say|read)|is\s+(?:actually|wrong[,\s]+it(?:'s|\s+is|\s+should\s+be)))\s+/i;

export interface HeaderCorrection {
  readonly values: Partial<Record<ChatCorrectableField, string>>;
}

/**
 * The header lines `text` corrects, or null when it corrects none. Pure, so
 * the reading is testable without a form.
 */
export function readHeaderCorrection(text: string, today: string): HeaderCorrection | null {
  const trimmed = text.trim();
  if (isQuestion(trimmed)) return null;
  const values: Partial<Record<ChatCorrectableField, string>> = {};

  const name = NAME_CORRECTION.exec(trimmed) ?? NAME_STATEMENT.exec(trimmed);
  if (name) {
    const typed = name[1]!.replace(/^["'“‘(]+|["'”’)]+$/g, "").replace(/\s+/g, " ").trim();
    if (typed) values.employee_name = typed;
  }

  const date = DATE_CORRECTION.exec(trimmed) ?? DATE_STATEMENT.exec(trimmed);
  if (date) {
    const iso = singleSpokenDate(trimmed.slice(date.index + date[0].length), today);
    if (iso) values.form_date = iso;
  }

  return Object.keys(values).length > 0 ? { values } : null;
}

/*
 * ============================================================================
 * NOTHING IN THE MESSAGE IS SILENTLY DROPPED
 * ============================================================================
 *
 * A correction ends the turn: whatever it saved is answered, and nothing else
 * in the message reaches revision or retrieval. Release QA found what that
 * lost, on both platforms:
 *
 *   "change the date to yesterday and shorten the summary"   summary ignored
 *   "payroll deduct is not applicable and add that she was
 *    late twice"                                              addition ignored
 *   "last day was yesterday and change the date to today"     date ignored
 *   "new location salon 24. also what is the transfer policy?"
 *                                     NOTHING saved: the question made the
 *                                     whole message read as a question
 *
 * So the message is taken apart first. Its questions are set aside (they no
 * longer stop the statements around them from being read); the statements are
 * read as one, as before; and if that reads nothing, the clauses that say
 * "change/update/set/fix …" are read on their own. Whatever the applied path
 * did not read — an instruction or a question — is NAMED in the reply, word
 * for word, with how to get it done. Nothing is guessed about it.
 */
interface AppliedBy {
  /** Whether the readers that saved this correction read `clause`. Set on success. */
  reads?: (clause: string) => boolean;
}

/** An instruction, or the name/date a header correction is about. */
const INSTRUCTION =
  /\b(?:rewrite|reword|shorten|lengthen|expand|add|remove|delete|drop|include|mention|change|update|fix|make|put|set|correct|tick|untick|check|uncheck|name|date)\b/i;
/** What only a correction says: an explicit verb that sets a value. */
const CORRECTION_VERB = /\b(?:change|update|correct|fix|set|make)\b/i;
/** The instruction clauses of `statements` that `reads` did not take. */
export function unreadInstructions(statements: string, reads: (clause: string) => boolean): string[] {
  const clauses = clausesOf(statements);
  if (clauses.length < 2) return [];
  return clauses.filter((clause) => INSTRUCTION.test(clause) && !reads(clause));
}

function leftoverNote(parts: readonly string[]): string {
  const quoted = parts.map((part) => `- "${part.replace(LEAD_IN, "")}"`).join("\n");
  return `I haven't done this part of your message yet:\n${quoted}\n\nSend ${parts.length === 1 ? "it" : "each one"} as its own message and I'll take care of it.`;
}

/** A turn that asks for a form — this one again, or another — is never a correction. */
async function correctHeaderLines(
  input: {
    request: Request;
    instanceId: string;
    question: string;
    today: string;
  },
  applied: AppliedBy = {},
): Promise<AskResponse | null> {
  // A cheap first reading, before anything is loaded: most turns are not corrections.
  const correction = readHeaderCorrection(input.question, input.today);
  if (!correction) return null;

  /*
   * A NEW REQUEST IS NEVER A CORRECTION TO THE LAST FORM. Found in the
   * reference platform's QA: with a form for one employee open, a request for
   * another form was read as a correction and wrote onto the wrong record.
   */
  const intent = detectTemplateIntent(input.question);
  if (intent.kind === "ambiguous") return null;
  if (intent.kind === "explicit" && /\b(?:create|make|start|pull up|new|another|need)\b/i.test(input.question)) return null;

  let authorized: Awaited<ReturnType<typeof authorizeInstance>>;
  try {
    authorized = await authorizeInstance(input.request, input.instanceId, "edit");
  } catch {
    // Not visible, not permitted, or gone: the turn goes on as a normal one.
    return null;
  }
  const { actor, loaded } = authorized;
  const instance = loaded.instance;
  if (intent.kind === "explicit" && intent.templateKey !== instance.templateKey) return null;

  const allowed = new Set<string>(companyFormFor(instance.templateKey)?.chatCorrectableFields ?? []);
  if (allowed.size === 0) return null;

  /*
   * SOMEBODY ELSE IS NOT THIS EMPLOYEE. "Change the date to yesterday for
   * Jordan" with Avery's form open is about another record. Renaming is the one
   * correction that names somebody new on purpose, so it is exempt.
   */
  if (!correction.values.employee_name) {
    const named = extractEmployeeNames(input.question);
    if (named.length > 0 && !named.some((name) => samePersonByName(name, instance.employeeName))) return null;
  }

  const document = parseFormDocument(loaded.version.document);
  const variantKey = instance.variantKey;
  const present = new Set([
    ...fieldsForVariant(document, variantKey).map((field) => field.key),
    ...checkboxGroupsForVariant(document, variantKey).map((group) => group.key),
  ]);
  const values = Object.fromEntries(
    Object.entries(correction.values).filter(
      (entry): entry is [string, string] => allowed.has(entry[0]) && present.has(entry[0]) && Boolean(entry[1]),
    ),
  );
  if (Object.keys(values).length === 0) return null;

  const who = `**${instance.templateName}** for **${instance.employeeName}**`;
  if (instance.status !== "draft") {
    return reply(
      `The ${who} is finalized, so I haven't changed it. Open it from the forms register and create a revision to make a change.`,
    );
  }

  /*
   * WHAT THE PERSON MAY WRITE, decided before anything is saved — the same
   * `enforcePersonEdit` the save applies.
   */
  const accepted = enforcePersonEdit(document, variantKey, { values, checked: {} });
  const keys = Object.keys(accepted.values);
  if (keys.length === 0) return null;

  const saved = await saveInstanceValues(input.instanceId, { values: accepted.values, checked: {} }, actor.id);
  const refused = new Set(saved.rejected.map((entry) => entry.key));
  const written = keys.filter((key) => !refused.has(key));
  if (written.length === 0) return null;

  const described = written.map((key) => {
    const field = fieldsForVariant(document, variantKey).find((entry) => entry.key === key);
    const value = accepted.values[key] ?? "";
    return `${field?.label ?? key} → ${field?.input === "date" ? displayDate(value, document.style) : value}`;
  });

  const lines = [`Updated the ${who}: ${described.join("; ")}.`];
  /*
   * A drafted paragraph that names the old value is not rewritten here — the
   * reference platform only rewrites paragraphs for its own field readers —
   * so the manager is told to give it a read.
   */
  const drafted = loaded.values.some(
    (row) => row.filledBy === "ai" && (row.value ?? "").trim() !== "" && !written.includes(row.fieldKey),
  );
  if (drafted && written.includes("employee_name")) {
    lines.push("", "The drafted text was written before this change — give it a quick read to make sure it still names the right person.");
  }
  applied.reads = (clause) => readHeaderCorrection(clause, input.today) !== null;

  return { ...reply(lines.join("\n")), formUpdate: { instanceId: input.instanceId, updated: written } };
}


/**
 * ============================================================================
 * A CORRECTION TO THE ACTIVE FORM, IN ORDER
 * ============================================================================
 *
 * The reference platform's form readers come first and are unchanged: the
 * Demotion and Transfer lines, the Resignation/Exit answers and the Corrective
 * Action's payroll question. Only when none of them reads the turn as a
 * correction does the header reader look at it — "change the date to
 * yesterday", "her name is actually Jane Doe-Smith" — which works on every
 * form whose registry entry lists the header line as chat-correctable.
 */
export async function correctActiveForm(input: {
  request: Request;
  instanceId: string;
  question: string;
  today: string;
}): Promise<AskResponse | null> {
  const { statements, questions } = separateQuestions(input.question);
  if (!statements) return null;

  const attempt = async (question: string) => {
    const applied: AppliedBy = {};
    const response =
      (await correctFromFormReaders({ ...input, question, message: statements }, applied)) ??
      (await correctHeaderLines({ ...input, question }, applied));
    return { response, applied };
  };

  let { response, applied } = await attempt(statements);
  /*
   * "Change her new location to salon 24 and rewrite the reason …" reads as
   * nothing whole. Its explicit correction clauses are read alone — never a
   * clause without a correction verb, so a request that is all revision
   * ("rewrite the reason to say she starts at salon 24") still goes to the
   * revision path untouched.
   */
  if (!response) {
    const clauses = clausesOf(statements);
    const explicit = clauses.filter((clause) => CORRECTION_VERB.test(clause));
    if (explicit.length === 0 || explicit.length === clauses.length) return null;
    ({ response, applied } = await attempt(explicit.join(". ")));
  }
  if (!response) return null;
  // Nothing was changed (a finalized form): there is no "rest" to speak of.
  if (!response.formUpdate) return response;

  const leftovers = [...unreadInstructions(statements, applied.reads ?? (() => false)), ...questions];
  if (leftovers.length === 0) return response;
  return { ...response, content: `${response.content}\n\n${leftoverNote(leftovers)}` };
}

function reply(content: string): AskResponse {
  return { content, citations: [], coverage: "not_applicable" };
}

/**
 * "New Location → Salon 24", "Type of Demotion → Voluntary", in the form's own
 * labels. A yes/no the exit form states as a Details line is described in
 * that line's own sentence — "Salon Key Returned → Salon key was returned." —
 * so the chat says what the page now says. A group cleared by the correction
 * is named as unticked, or left out when nothing was ticked there.
 */
function describe(
  document: FormDocument,
  variantKey: string | null,
  key: string,
  submitted: { values: Record<string, string>; checked: Record<string, string[]> },
  ticks: { before: Record<string, string[]>; after: Record<string, string[]> },
): string | null {
  const field = fieldsForVariant(document, variantKey).find((entry) => entry.key === key);
  if (field) {
    const value = submitted.values[key] ?? "";
    return `${field.label} → ${field.input === "date" ? displayDate(value, document.style) : value}`;
  }
  const statement = blocksForVariant(document, variantKey)
    .flatMap((block) => (block.kind === "answer_statements" ? block.lines : []))
    .find((line) => line.parts.some((part) => part.key === key));
  if (statement) {
    const sentence = answerStatementText(statement, ticks.after);
    if (sentence) return `${statement.label} → ${sentence}`;
  }
  const group = checkboxGroupsForVariant(document, variantKey).find((entry) => entry.key === key);
  const label = (option: string) => group?.options.find((entry) => entry.key === option)?.label ?? option;
  if ((submitted.checked[key] ?? []).length === 0) {
    const was = ticks.before[key] ?? [];
    return was.length > 0 ? `Unticked ${was.map(label).join(", ")}` : null;
  }
  const options = (submitted.checked[key] ?? []).map(label).join(", ");
  /*
   * A group printed under a section heading — the Corrective Action Form's
   * Type of Warning — is described by that heading, and a box the correction
   * unticked is named, so "Written Warning" visibly went.
   */
  const heading = group?.label || (key === WARNING_TYPE_KEY ? sectionHeading(document, variantKey, key) : null);
  const unticked = (ticks.before[key] ?? []).filter((option) => !(submitted.checked[key] ?? []).includes(option));
  if (heading && key === WARNING_TYPE_KEY && unticked.length > 0) {
    return `${heading} → ${options} (${unticked.map(label).join(", ")} unticked)`;
  }
  // The separation boxes have no question of their own; the ticked box says it all.
  return heading ? `${heading} → ${options}` : `Ticked ${options}`;
}

/** The section heading a group is printed under, where it has no label of its own. */
function sectionHeading(document: FormDocument, variantKey: string | null, key: string): string | null {
  let heading: string | null = null;
  for (const block of blocksForVariant(document, variantKey)) {
    if (block.kind === "section") heading = block.label;
    if (block.kind === "checkbox_group" && block.key === key) return heading;
  }
  return null;
}

/**
 * ============================================================================
 * TWO FORMS FROM ONE MESSAGE, AND A CORRECTION THAT NAMES NEITHER
 * ============================================================================
 *
 * "Coaching form for Avery and a CA for Jordan" can leave two drafts open at
 * once. "Change the date to yesterday" is then a correction to ONE of them,
 * and which is not something to guess: the wrong employee's record would be
 * changed. Nor may it be dropped. So it is answered with the question, naming
 * the forms the manager can actually edit, and nothing is changed until they
 * say whose. A correction that names the person is routed by the browser to
 * that form (`activeFormInstanceFor`) and never reaches this.
 *
 * Every id is re-authorized for "edit" — a forged one is simply not named.
 */
export async function askWhichFormToCorrect(input: {
  request: Request;
  instanceIds: readonly string[];
  question: string;
}): Promise<AskResponse | null> {
  const { statements } = separateQuestions(input.question);
  if (!statements || !INSTRUCTION.test(statements)) return null;
  if (detectTemplateIntent(statements).kind !== "none") return null;

  const forms: string[] = [];
  for (const instanceId of input.instanceIds.slice(0, 6)) {
    try {
      const { loaded } = await authorizeInstance(input.request, instanceId, "edit");
      forms.push(
        `**${loaded.instance.templateName}**${loaded.instance.employeeName ? ` for **${loaded.instance.employeeName}**` : ""}`,
      );
    } catch {
      // Not visible to this person: not offered.
    }
  }
  if (forms.length < 2) return null;
  return {
    content: `You have ${forms.length === 2 ? "two" : String(forms.length)} forms open from that message — ${forms.slice(0, -1).join(", ")} or ${forms[forms.length - 1]}. Which one should I change? Say it again with the person's name, and I'll change only that form. Nothing has been changed yet.`,
    citations: [],
    coverage: "not_applicable",
  };
}
