import "server-only";

import type { AskResponse } from "@/lib/ai/types";
import type { ChatMessage } from "@/types";

import { authorizeForms } from "./access";
import { candidateNameWords } from "./chat-form-records";
import { displayName } from "./employee-match";
import { loadScopedRoster } from "./employee-roster";
import { correctActiveForm } from "./chat-correction";
import { changeActiveFormPolicy } from "./chat-policy-change";
import { reviseActiveForm } from "./chat-revision";
import { formOpenedFor, openEditableDraft, openingLine, reasonRequiredReply } from "./editable-draft";
import { RevisionReasonRequiredError } from "./revision-chain";
import { authorizeInstance, instanceListFilterFor, visibleInstances } from "./instance-scope";
import { listInstances, type InstanceRow } from "./instances";
import { extractEmployeeNames, samePerson } from "./proposal";
import { EDIT_VERB, SHOW_OR_OPEN_VERB, WHICH_FORM_ON_FILE } from "./reopen-cue";
import { readReopenRequest } from "./reopen-request";
import { getTemplateByKey } from "./repository";
import { formEditDateRulesEnabled, formEditSingleWriterEnabled, possessiveNoApostropheEnabled, reopenByAnyOpenVerbEnabled } from "@/lib/config/chat-quality-flags";
import { privateAwareLimit } from "./private-creators";

/**
 * ============================================================================
 * "CHANGE EXIT FOR <NAME>" — A FORM ON FILE, BROUGHT BACK INTO CHAT
 * ============================================================================
 *
 * Ported from the reference platform (production feedback, 20 Oct 2026): a
 * manager asked to change, then to duplicate, an exit form that already
 * existed, and could only be sent to the forms register — which has no
 * editor. This finds the form and puts it in the thread, editable:
 *
 *   A DRAFT is opened as it is.
 *   A FINALIZED form gets a new draft (a revision) with everything carried
 *   over; the finalized one stays on file, unchanged, until that draft is
 *   finalized and replaces it.
 *   A REVISED form is followed to its newer version.
 *
 * Then whatever change the same sentence asked for ("… and change date notice
 * given to 9-27-26") is made on that draft, by the same readers that correct
 * a form already in the conversation: a correction, then a policy named from
 * the manual, then a redraft — the chat route's own order.
 *
 * WHICH FORM. The form in this conversation when it is the one meant;
 * otherwise the newest active form of the named template, for the named
 * employee, among the forms this actor may see — `instanceListFilterFor` and
 * `visibleInstances`, exactly as the Forms Register lists them (the home or
 * Woven-assigned stores, and the creator's own forms while their scope still
 * covers the store) — and then re-authorized for "edit" before anything is
 * opened.
 *
 * NOTHING NEW IS EVER CREATED HERE. "Create an exit form for Jordan Smith" is
 * not read as a reopen request; it still proposes a new form.
 */
export async function reopenRequestedForm(input: {
  request: Request;
  question: string;
  history: Pick<ChatMessage, "id" | "role" | "content" | "error">[];
  today: string;
  activeInstanceId?: string;
  /** The template of a proposal still waiting to be created, if any. */
  continuingTemplateKey?: string;
}): Promise<AskResponse | null> {
  /*
   * REOPEN_BY_ANY_OPEN_VERB_ENABLED (QA, 6 Nov 2026): the answer to "Which one
   * should I open?" below — a number or a date from that list — is read with
   * the request it answers, and picks that form.
   */
  const anyOpenVerb = reopenByAnyOpenVerbEnabled();
  const choice = anyOpenVerb ? chosenFromWhichList(input.question, input.history) : null;
  const question = choice?.request ?? input.question;
  const reading = readReopenRequest(question);
  if (!reading) return null;
  /*
   * A PROPOSAL NOT YET CREATED IS WHAT "CHANGE THE EXIT FORM" MEANS while it
   * is on screen — the proposal flow takes that turn, and no form on file is
   * revised behind it.
   */
  /*
   * FORM_EDIT_DATE_RULES_ENABLED: "can you edit the form I already finalized
   * for Test Employee? change the date to 10-20-26" (QA replay, 25 Oct 2026)
   * names the form on file, not the card on screen. The card's form is the one
   * looked up, and a finalized one opens as a revision.
   */
  const finalizedMeant = formEditDateRulesEnabled() && REFERS_TO_FINALIZED.test(question);
  if (
    input.continuingTemplateKey &&
    !finalizedMeant &&
    (reading.templateKey === null || reading.templateKey === input.continuingTemplateKey)
  ) {
    return null;
  }
  const templateKey = reading.templateKey ?? (finalizedMeant ? (input.continuingTemplateKey ?? null) : null);

  let names = extractEmployeeNames(question).map((name) => name.replace(/['’]s?$/, ""));
  /*
   * REOPEN_BY_ANY_OPEN_VERB_ENABLED (QA/Pau, 6 Nov 2026): "bring up Odalys's
   * corrective action" — a first name the name reader does not take, that is
   * the first name of exactly one person on this manager's roster.
   */
  /*
   * QA, 6 Nov 2026 (follow-up): for every verb, "edit" included, a first name
   * alone is a person only when exactly one person on the roster has it;
   * when several do, the manager is asked whose, and nothing is opened.
   */
  if (anyOpenVerb) {
    // "edit Odalys's CA" was read as the name "edit Odalys": the request's own verb is no part of a name.
    names = names.map((name) => name.replace(LEADING_VERB_IN_NAME, "")).filter(Boolean);
    const firstNames = names.length === 0 ? (input.activeInstanceId ? [] : candidateNameWords(question)) : names.filter((name) => !/\s/.test(name.trim()));
    if (firstNames.length > 0) {
      let people = await rosterPeopleByFirstName(input.request, firstNames);
      /*
       * POSSESSIVE_NO_APOSTROPHE_ENABLED (QA, Bubbles live tester with round 5, 8 Nov 2026): "bring up <first name>s
       * corrective action" — a possessive typed without the apostrophe. Only when no roster person has the word as it
       * was typed, the word without its final "s" ("ss" never) is tried, by the same one-person rule.
       */
      if (people.length === 0 && possessiveNoApostropheEnabled()) {
        const unpossessed = firstNames.map((word) => word.trim()).filter((word) => /^\p{L}{3,}s$/u.test(word) && !/ss$/i.test(word)).map((word) => word.slice(0, -1));
        if (unpossessed.length > 0) people = await rosterPeopleByFirstName(input.request, unpossessed);
        if (people.length === 1) names = names.filter((name) => !unpossessed.some((word) => `${word}s`.toLowerCase() === name.trim().toLowerCase()));
      }
      if (people.length > 1) return reply(whichPersonReply(people, await templateLabel(templateKey)));
      if (people.length === 1) names = [...names.filter((name) => /\s/.test(name.trim())), people[0]!];
    }
  }
  const named = (employee: string) =>
    names.some((name) => samePerson(name, employee)) || mentionsFullName(question, employee);
  /*
   * REOPEN_BY_ANY_OPEN_VERB_ENABLED: "bring up the coaching form" names nobody
   * whose form to look up, and is left as it was before the flag.
   */
  const unnamed = names.length === 0;
  /*
   * QA decision (c) follow-up, 6 Nov 2026: "open her CA" / "bring up her
   * coaching form" (any verb, with the flag) that is not the form already in
   * this chat asks whose form it is; never a blank form, never somebody
   * picked.
   */
  const pointsAtSomeone = anyOpenVerb && unnamed && POSSESSIVE_PRONOUN.test(question);
  if (reading.byAddedVerb && unnamed && !input.activeInstanceId && !pointsAtSomeone) return null;

  let target: { id: string; templateName: string; employeeName: string } | null = null;

  /* The form already in this conversation, when it is the one meant. */
  if (input.activeInstanceId) {
    try {
      const { loaded } = await authorizeInstance(input.request, input.activeInstanceId, "view");
      const active = loaded.instance;
      const sameTemplate = reading.templateKey === null || reading.templateKey === active.templateKey;
      const samePersonMeant = names.length === 0 || named(active.employeeName);
      if (sameTemplate && samePersonMeant) target = toTarget(active);
    } catch {
      // Gone or no longer permitted: fall through to the lookup by name.
    }
  }

  if (!target && pointsAtSomeone) return reply(whoseFormReply(await templateLabel(templateKey)));
  if (!target && reading.byAddedVerb && unnamed) return null;

  /* Otherwise the newest one on file for the named employee. */
  if (!target && (templateKey || finalizedMeant)) {
    let visible: InstanceRow[];
    try {
      const actor = await authorizeForms(input.request, "view_form_monitoring");
      /*
       * NARROWED BY THE NAME BEFORE THE LIMIT, as the Forms Register lookup in
       * `chat-form-records.ts` is, so an older form is not lost behind the
       * newest 200. A name the reader did not catch ("lacey morrow" in lower
       * case) still reads the newest forms, matched by `mentionsFullName`.
       */
      const words = names.flatMap((name) => name.split(/\s+/)).filter((word) => /^[a-z]+$/i.test(word));
      const filter = instanceListFilterFor(actor);
      visible = visibleInstances(
        actor,
        // PRIVATE_CREATOR_FORMS: over-read, then trim to the page; off, 200 itself.
        await listInstances("active", privateAwareLimit(200), words.length > 0 ? { ...filter, employeeNameWords: words } : filter),
      ).slice(0, 200);
    } catch {
      return null;
    }
    const candidates = visible
      .filter((row) => (templateKey === null || row.templateKey === templateKey) && row.status !== "revised")
      .filter((row) => !finalizedMeant || row.status === "finalized")
      .filter((row) => named(row.employeeName))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    /*
     * REOPEN_BY_ANY_OPEN_VERB_ENABLED (QA/Pau, 6 Nov 2026): several forms on
     * file for the person named — listed, and the manager asked which. One
     * finalized form and the new draft of it are one form here: the draft.
     */
    const listed = anyOpenVerb ? withoutRevisedOriginals(candidates) : candidates;
    if (anyOpenVerb && !choice && names.length > 0 && listed.length > 1) return reply(whichFormReply(listed));
    const found = choice ? listed[choice.index] : candidates[0];
    if (found) {
      target = toTarget(found);
    } else if (names.length > 0) {
      // The form's own name from the library, so the reply names it even when none is visible.
      const templateName =
        (templateKey ? visible.find((row) => row.templateKey === templateKey)?.templateName : null) ??
        (templateKey ? (await getTemplateByKey(templateKey).catch(() => null))?.name : null) ??
        "form";
      return reply(
        `I couldn't find a ${templateName === "form" ? "form" : `**${templateName}**`} for **${names[0]}** on file that you can open. Forms already created are listed in Forms → Forms Register. If you need a new one, ask me to create it — for example "create a ${templateName === "form" ? "form" : templateName} for ${names[0]}".`,
      );
    }
  }
  if (!target && finalizedMeant) {
    return reply(
      "I couldn't find a finalized form on file for that employee that you can open. Name the form and the employee — for example \"edit the corrective action form for <name>\" — and I'll open a new draft of the finalized one to change; the finalized form stays on file. Forms already created are listed in Forms → Forms Register.",
    );
  }
  if (!target) return null;

  let draft: Awaited<ReturnType<typeof openEditableDraft>>;
  try {
    draft = await openEditableDraft(input.request, target.id, { revise: reading.mode === "edit" || reading.opensToEdit === true });
  } catch (error) {
    if (error instanceof RevisionReasonRequiredError) return reasonRequiredReply(input.request, target.id);
    return reply(
      `I found the **${target.templateName}** for **${target.employeeName}**, but couldn't open it to edit: ${(error as Error).message}`,
    );
  }

  /*
   * THE CHANGE THE SAME SENTENCE ASKED FOR, on the draft — the correction
   * readers first, then a policy named from the manual, then a redraft. Each
   * returns null when the sentence asked for no such change, and the draft is
   * simply open.
   */
  let applied: AskResponse | null = null;
  /*
   * FORM_EDIT_SINGLE_WRITER_ENABLED (STEP_B_POLICY_REOPEN_DESIGN): the draft as
   * it opened, so the change's claim is checked against what was saved. The
   * change itself is written by the one writer, through the correction and
   * policy paths. See `lib/forms/form-write.ts`.
   */
  const opened =
    formEditSingleWriterEnabled() && reading.mode === "edit" && draft.status === "draft"
      ? await (await import("./form-write")).editSnapshot(draft.instanceId, "reopen")
      : null;
  if (reading.mode === "edit" && draft.status === "draft") {
    applied =
      (await correctActiveForm({
        request: input.request,
        instanceId: draft.instanceId,
        question: input.question,
        today: input.today,
        history: input.history,
      })) ??
      (await changeActiveFormPolicy({
        request: input.request,
        instanceId: draft.instanceId,
        question: input.question,
        history: input.history,
      })) ??
      // A redraft asks the model; only when the sentence asked for a change.
      (reading.asksChange
        ? await reviseActiveForm({
            request: input.request,
            instanceId: draft.instanceId,
            question: input.question,
            history: input.history,
            today: input.today,
          })
        : null);
  }

  if (formEditSingleWriterEnabled() && applied && opened) {
    applied = await (await import("./form-write")).realizedClaim(applied, draft.instanceId, opened);
  }
  const closing =
    draft.status === "draft"
      ? "Edit anything that needs changing below, save, and finalize it when it's ready."
      : null;
  return {
    ...reply(
      [openingLine(draft), applied?.content ?? closing].filter((line): line is string => Boolean(line)).join("\n\n"),
    ),
    ...(applied?.formUpdate ? { formUpdate: applied.formUpdate } : {}),
    formOpened: formOpenedFor(draft),
  };
}

/**
 * The one person on the actor's roster whose first (or preferred) name is a
 * word of the question that could be a name — read as the forms-on-file
 * lookup reads one (`candidateNameWords`). None, or several: nobody.
 */
async function rosterPeopleByFirstName(request: Request, firstNames: readonly string[]): Promise<string[]> {
  const words = new Set(firstNames.map((name) => name.trim().toLowerCase().replace(/['’]s$/, "")));
  if (words.size === 0) return [];
  try {
    const actor = await authorizeForms(request, "view_form_monitoring");
    const roster = await loadScopedRoster(actor.scope);
    const people = roster.filter((person) =>
      [person.firstName, person.preferredFirstName ?? ""].some((first) => words.has(first.trim().toLowerCase())),
    );
    return [...new Set(people.map((person) => displayName(person)))];
  } catch {
    return [];
  }
}

/** A reopen verb the name reader took as the start of a name. */
const LEADING_VERB_IN_NAME = new RegExp(`^(?:${EDIT_VERB.source}|${SHOW_OR_OPEN_VERB.source})\\s+`, "i");

/** "her", "his", "their" before the form: a person meant, and not named. */
const POSSESSIVE_PRONOUN = /\b(?:her|his|their)\b/i;

/** The template's name as the library publishes it, or "form". */
async function templateLabel(templateKey: string | null): Promise<string | null> {
  if (!templateKey) return null;
  try {
    return (await getTemplateByKey(templateKey))?.name ?? null;
  } catch {
    return null;
  }
}

function whoseFormReply(templateName: string | null): string {
  return `Whose ${templateName ? `**${templateName}**` : "form"} should I open? Tell me the employee's full name.`;
}

function whichPersonReply(people: readonly string[], templateName: string | null): string {
  const listed = people.map((name) => `**${name}**`);
  const choices = listed.length > 1 ? `${listed.slice(0, -1).join(", ")} or ${listed[listed.length - 1]}` : listed[0];
  return `More than one person on your roster has that first name. Whose ${templateName ? `**${templateName}**` : "form"} should I open — ${choices}?`;
}

/** A finalized form whose new draft is also on file is that draft. */
function withoutRevisedOriginals(rows: InstanceRow[]): InstanceRow[] {
  const revised = new Set(rows.map((row) => row.revisesInstanceId).filter((id): id is string => Boolean(id)));
  return rows.filter((row) => !revised.has(row.id));
}

const LISTED_FORM = /^(\d+)\. \*\*[^*]+\*\* for \*\*[^*]+\*\* — (\w+), created ([A-Z][a-z]{2} \d{1,2}), \d{4}$/gm;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function createdOn(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`;
}

/** The forms on file for the person named, newest first, and the question which one. */
function whichFormReply(rows: InstanceRow[]): string {
  const people = [...new Set(rows.map((row) => row.employeeName))];
  const lines = rows
    .slice(0, 9)
    .map((row, index) => `${index + 1}. **${row.templateName}** for **${row.employeeName}** — ${row.status}, created ${createdOn(row.createdAt)}`);
  return [
    `I found ${rows.length} forms on file for ${people.map((name) => `**${name}**`).join(" and ")}:`,
    lines.join("\n"),
    `${WHICH_FORM_ON_FILE} Reply with its number or its date.`,
  ].join("\n\n");
}

/**
 * The manager's answer to `whichFormReply`, read only against that reply's
 * own lines: a date it listed ("the one from nov 3") or a status it listed
 * ("the finalized one") that picks exactly one line, or else the one number
 * in the answer. With the request the list answered, which is read again.
 */
function chosenFromWhichList(
  question: string,
  history: Pick<ChatMessage, "role" | "content">[],
): { request: string; index: number } | null {
  let at = -1;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]!.role === "assistant") {
      at = i;
      break;
    }
  }
  const listing = at >= 0 ? history[at]!.content : "";
  if (!listing.includes(WHICH_FORM_ON_FILE)) return null;
  const request = history.slice(0, at).reverse().find((message) => message.role === "user")?.content;
  if (!request) return null;
  const lines = [...listing.matchAll(LISTED_FORM)].map((match) => ({
    number: Number(match[1]),
    status: match[2]!.toLowerCase(),
    date: match[3]!.toLowerCase(),
  }));
  if (lines.length === 0) return null;
  const said = question.toLowerCase();
  const says = (words: string) => new RegExp(`(?:^|[^a-z0-9])${words.replace(/\s+/g, "\\s+")}(?:$|[^a-z0-9])`).test(said);
  const byDate = lines.filter((line) => says(line.date));
  const byStatus = lines.filter((line) => says(line.status));
  const numbers = byDate.length === 0 ? (said.match(/\d+/g) ?? []) : [];
  const picked =
    byDate.length === 1 ? byDate[0] : byStatus.length === 1 ? byStatus[0] : numbers.length === 1 ? lines.find((line) => line.number === Number(numbers[0])) : undefined;
  return picked ? { request, index: picked.number - 1 } : null;
}

/** "the form I already finalized", "the one we submitted": a form already on file. */
const REFERS_TO_FINALIZED = /\bfinali[sz]ed\b|\b(?:i|we)\s+(?:already\s+)?(?:submitted|filed|signed)\b/i;

function toTarget(row: Pick<InstanceRow, "id" | "templateName" | "employeeName">) {
  return { id: row.id, templateName: row.templateName, employeeName: row.employeeName };
}

/** "jordan smith exit form": the employee's whole name, as words, in any case. */
function mentionsFullName(question: string, employee: string): boolean {
  const words = employee.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(question);
}

function reply(content: string): AskResponse {
  return { content, citations: [], coverage: "not_applicable" };
}
