import "server-only";

import type { AskResponse } from "@/lib/ai/types";
import type { ChatMessage } from "@/types";

import { authorizeForms } from "./access";
import { correctActiveForm } from "./chat-correction";
import { changeActiveFormPolicy } from "./chat-policy-change";
import { reviseActiveForm } from "./chat-revision";
import { formOpenedFor, openEditableDraft, openingLine } from "./editable-draft";
import { authorizeInstance, instanceListFilterFor, visibleInstances } from "./instance-scope";
import { listInstances, type InstanceRow } from "./instances";
import { extractEmployeeNames, samePerson } from "./proposal";
import { readReopenRequest } from "./reopen-request";
import { getTemplateByKey } from "./repository";
import { formEditDateRulesEnabled } from "@/lib/config/chat-quality-flags";

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
  const reading = readReopenRequest(input.question);
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
  const finalizedMeant = formEditDateRulesEnabled() && REFERS_TO_FINALIZED.test(input.question);
  if (
    input.continuingTemplateKey &&
    !finalizedMeant &&
    (reading.templateKey === null || reading.templateKey === input.continuingTemplateKey)
  ) {
    return null;
  }
  const templateKey = reading.templateKey ?? (finalizedMeant ? (input.continuingTemplateKey ?? null) : null);

  const names = extractEmployeeNames(input.question).map((name) => name.replace(/['’]s?$/, ""));
  const named = (employee: string) =>
    names.some((name) => samePerson(name, employee)) || mentionsFullName(input.question, employee);

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
        await listInstances("active", 200, words.length > 0 ? { ...filter, employeeNameWords: words } : filter),
      );
    } catch {
      return null;
    }
    const candidates = visible
      .filter((row) => (templateKey === null || row.templateKey === templateKey) && row.status !== "revised")
      .filter((row) => !finalizedMeant || row.status === "finalized")
      .filter((row) => named(row.employeeName))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const found = candidates[0];
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
    draft = await openEditableDraft(input.request, target.id, { revise: reading.mode === "edit" });
  } catch (error) {
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
