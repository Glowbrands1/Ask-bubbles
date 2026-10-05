import "server-only";

import { companyFormFor } from "@/config/company/forms";
import { ACTIVE_BRAND } from "@/lib/brand";
import {
  entryFor,
  formsLocationFor,
  groupedForActor,
  groupedOfferedForActor,
  offerable,
  publishedEntries,
  type FormInventory,
  type InventoryEntry,
} from "@/lib/forms/inventory";
import type { InventoryQuestion } from "@/lib/forms/inventory-question";
import type { Role } from "@/types";

import type { AskResponse } from "./types";

/**
 * ============================================================================
 * ANSWERS ABOUT THE LIBRARY, WRITTEN BY THE SERVER
 * ============================================================================
 *
 * "Which forms do we have?" is a question about DATA, and the data is two tables
 * away. Handing it to the model with a retrieved policy excerpt is how the
 * reference platform came to describe a Role-Play Evaluation and a Follow-Up
 * Coaching Note as documents the business had — with a table of their contents —
 * when neither was a template anybody could open.
 *
 * So these answers are assembled here from `form_templates`, not generated. The
 * model is not asked to name a form and then checked; it is not asked at all.
 *
 * ============================================================================
 * EVERY NAME IN EVERY SENTENCE BELOW COMES OUT OF THE INVENTORY
 * ============================================================================
 *
 * There is no template name written as a string literal in this file, and that
 * is a rule rather than a coincidence. A prose list is exactly the thing that
 * drifts: it survives a template being renamed, retired, unpublished or added,
 * and goes on describing a library that no longer exists. Where a sentence needs
 * a form's name it looks it up by KEY, and a key that resolves to nothing
 * published produces a sentence saying so.
 */

/* ------------------------------------------------------------- the ladder -- */



/* -------------------------------------------------------------- rendering -- */

function creationNote(entry: InventoryEntry): string {
  if (!entry.canCreate) return "your role cannot create this one";
  if (entry.inlineCreation) return `${ACTIVE_BRAND.assistantName} can create this one here in the conversation`;
  return `not available yet — ${ACTIVE_BRAND.assistantName} cannot create this one in chat`;
}

/** One form, as a bullet: real name, stored description, honest availability. */
function bullet(entry: InventoryEntry): string {
  return `- **${entry.name}** — ${entry.description} (${creationNote(entry)})`;
}

function bulletList(entries: InventoryEntry[]): string {
  return entries.map(bullet).join("\n");
}

/** Every response from this module is about the library, not from the corpus. */
function turn(content: string): AskResponse {
  return {
    content,
    /*
     * NO CITATIONS AND `not_applicable`. The Forms Library is not the knowledge
     * corpus, so there is no document to cite — and showing "the knowledge base
     * does not cover this" under a correct, complete answer about the library
     * would be the banner contradicting the reply.
     */
    citations: [],
    coverage: "not_applicable",
  };
}

/** The sentence that keeps the two registers apart, in one place. */
const REGISTER_NOTE =
  "The **templates** are in Forms. The **guidance** — how to coach, when to escalate, what the progression is — is Knowledge Base material, and I cite it when I answer from it.";

const NOTHING_PUBLISHED =
  `There are no forms published in ${ACTIVE_BRAND.productName} that your role can start. An Owner or Administrator publishes templates and sets which roles may use them.`;

/* ------------------------------------------------------ inventory answers -- */

/**
 * Answers a question about the library.
 *
 * @param namedTemplateKey The template the sentence named, if it named one, as
 *   read by `detectTemplateIntent`. Used only by the availability branch, and
 *   only after it has been checked against the inventory — a key the reader
 *   suggested is not proof a template answers to it.
 */
export function answerInventoryQuestion(input: {
  question: InventoryQuestion;
  inventory: FormInventory;
  role: Role | null;
  namedTemplateKey: string | null;
}): AskResponse | null {
  const { question, inventory, role, namedTemplateKey } = input;

  if (question.kind === "none") return null;
  if (question.kind === "list") return listAnswer(inventory, role);
  if (question.kind === "location") return locationAnswer(inventory, role);
  return availabilityAnswer(inventory, role, namedTemplateKey);
}

function listAnswer(inventory: FormInventory, role: Role | null): AskResponse {
  /*
   * OFFERED, NOT MERELY CREATABLE. "Which form should I use?" is a manager
   * asking to be pointed at one, so this is a shortlist Sunny is putting
   * forward and the chooser withholding applies to it. The templates it leaves
   * out are still published and still answered for by name — see
   * `availabilityAnswer`, which resolves by key.
   */
  const groups = groupedOfferedForActor(inventory);
  if (groups.length === 0) return turn(NOTHING_PUBLISHED);

  const sections = groups
    .map((group) => `**${group.label}**\n\n${bulletList(group.entries)}`)
    .join("\n\n");

  return turn(
    [
      `These are the forms published in ${ACTIVE_BRAND.productName} that you can use:`,
      "",
      sections,
      "",
      `You will find them in ${formsLocationFor(role)}`,
      "",
      REGISTER_NOTE,
    ].join("\n"),
  );
}

function locationAnswer(inventory: FormInventory, role: Role | null): AskResponse {
  /*
   * THE FULL GROUPING, not the offered one, and that is not an oversight.
   * This answer names no form — it says where forms are made and what the
   * library's categories are — and the library still carries every category
   * it always did. Narrowing it here would describe a library that does not
   * exist.
   */
  const groups = groupedForActor(inventory);
  const where = `You create and find forms in ${formsLocationFor(role)}`;

  if (groups.length === 0) return turn([where, "", NOTHING_PUBLISHED].join("\n"));

  return turn(
    [
      where,
      "",
      `They are grouped as ${groups.map((group) => `**${group.label}**`).join(" and ")}.`,
      "",
      REGISTER_NOTE,
    ].join("\n"),
  );
}

function availabilityAnswer(
  inventory: FormInventory,
  role: Role | null,
  namedTemplateKey: string | null,
): AskResponse {
  const entry = namedTemplateKey ? entryFor(inventory, namedTemplateKey) : null;

  /*
   * NAMED SOMETHING THE LIBRARY DOES NOT PUBLISH.
   *
   * The whole point of the branch. "Do we have a role-play evaluation?" reads as
   * a template nobody can name, so the answer is no — followed by what there
   * actually is, because a bare no is not useful and a substituted form is worse
   * than either.
   */
  if (!entry || !entry.published) {
    const mine = offerable(inventory);
    return turn(
      [
        `Not as a form in ${ACTIVE_BRAND.productName} — there is no published template for that, and I won't stand in for it with a different one.`,
        "",
        mine.length > 0
          ? `Here is the whole list of what you can start:\n\n${bulletList(mine)}`
          : NOTHING_PUBLISHED,
        "",
        REGISTER_NOTE,
      ].join("\n"),
    );
  }

  if (!entry.canCreate) {
    return turn(
      [
        `Yes — **${entry.name}** is published, but your role cannot create it.`,
        "",
        `${entry.description}`,
        "",
        "Ask your district manager which forms your role should cover.",
      ].join("\n"),
    );
  }

  return turn(
    [
      `Yes. **${entry.name}** — ${entry.description}`,
      "",
      entry.inlineCreation
        ? "I can create it here in the conversation. Tell me who it is for and what happened."
        : "I can't create this one in chat yet, and forms are only created here, so it isn't available to start right now.",
      "",
      `It is filed under **${entry.categoryLabel}** in the forms library.`,
    ].join("\n"),
  );
}

/* ------------------------------------------------ register clarification -- */

/**
 * ============================================================================
 * ONE QUESTION, WHERE THE ANTECEDENT NAMED BOTH REGISTERS
 * ============================================================================
 *
 * `resolveRegisterAnchor` reports `ambiguous` when the nearest turn named a
 * template AND a knowledge document and neither dominated. "I need to find
 * those documents" then has two equally good readings, and the two answers are
 * different pages of the product.
 *
 * SO IT ASKS, ONCE, AND SHORT. The alternative is a coin toss dressed as an
 * answer: half the time a manager looking for the escalation framework is
 * handed a menu of blank paperwork, and there is nothing in the reply to tell
 * them that is what happened.
 *
 * The question names what it saw, so the manager can correct the reading rather
 * than only choose from it.
 */
export function answerRegisterClarification(input: {
  named: readonly string[];
  role: Role | null;
}): AskResponse {
  const seen = input.named.filter((name) => name.trim() !== "").slice(0, 4);
  const context =
    seen.length > 0
      ? ` We were just talking about ${seen.map((name) => `**${name}**`).join(", ")}, which spans both.`
      : "";

  return turn(
    [
      `Which do you mean - the **forms**, or the **guidance**?${context}`,
      "",
      `- The **templates** you fill in and file are in ${formsLocationFor(input.role)}`,
      "- The **guidance** that explains the process is Knowledge Base material, and I quote it with its source when I answer from it.",
      "",
      "Say which one and I will take you straight to it.",
    ].join("\n"),
  );
}

/* ------------------------------------------------- forms library block -- */

/**
 * ============================================================================
 * THE FORMS LIBRARY, AS A BLOCK IN THE PROMPT
 * ============================================================================
 *
 * For every turn this module did NOT answer. A manager whose question wanders
 * into forms mid-conversation — "where is this information stored", "is this
 * under operations" — reaches the grounded path, and a model asked about forms
 * with no list of forms invents them. This is the list, so the prompt's rule
 * against naming a form that is not in it has something to point at.
 *
 * SENT ON EVERY TURN rather than only on turns that look form-shaped. It is a
 * dozen short lines, and the alternative is a keyword gate deciding when Sunny
 * is allowed to be accurate about the library.
 *
 * PUBLISHED ROWS ONLY. An unpublished template is not a form anybody can be
 * told about, and listing it would produce the exact claim this removes: that a
 * document exists when it cannot be opened.
 */
export function buildFormInventoryBlock(inventory: FormInventory): string {
  const published = publishedEntries(inventory);

  if (published.length === 0) {
    return "FORMS LIBRARY\n\nNo forms are published in this deployment. There are no form templates to name.";
  }

  const rows = published
    .map((entry) => {
      const availability = !entry.canCreate
        ? "this user's role may NOT create it"
        : entry.inlineCreation
          ? "this user may create it, and it can be created inside the conversation"
          : "this user may create it, but it can NOT be created inside the conversation yet, and there is no other place to start it";
      /*
       * THE ONE THING THE MODEL CANNOT WORK OUT FROM THE ROW.
       *
       * The server-written answers are already narrowed — `offerable` keeps a
       * withheld form out of every list Sunny assembles itself. This block is
       * the other half: the turns the model writes freehand, where a library
       * it can see is a library it will happily recommend from. So the rule
       * travels WITH THE ROW rather than only in the prompt's forms section,
       * because a marker beside the name is the version a model does not have
       * to remember three sections later.
       */
      const withheld = companyFormFor(entry.templateKey)?.offeredInChooser === true
        ? ""
        : "; NOT OFFERED — never suggest this form or include it when listing forms to choose from";
      return `- ${entry.name} (short name: ${entry.shortName}; category: ${entry.categoryLabel}; ${availability}${withheld})\n  ${entry.description}`;
    })
    .join("\n");

  return `FORMS LIBRARY

This is the COMPLETE list of form templates published in ${ACTIVE_BRAND.productName}. It is read from the database for this user, and it is the only list of forms that exists.

An entry marked NOT OFFERED still exists and is still published: answer honestly if the user asks about it by name, and say where it is opened. Never put it forward yourself — leave it out when you ask which form somebody needs, when you list the forms they can use, and when you recommend one.

${rows}`;
}
