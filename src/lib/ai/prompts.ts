import { ASSISTANT_PURPOSE, ASSISTANT_TONE, ASSISTANT_VOICE } from "@/config/company/assistant";
import { BUSINESS_TIMEZONE, shiftDays, weekdayOf } from "@/lib/business-date";
import { displayLocator } from "@/lib/knowledge/locator";
import type { AnswerMode } from "@/types";
import type { AskContext } from "./types";

/**
 * THE ASSISTANT'S SYSTEM INSTRUCTION AND GROUNDING FORMAT.
 *
 * Pure string construction — no SDK, no key, no network — so the exact prompt
 * Claude receives is testable.
 *
 * TWO LAYERS. The rules below — what may be asserted, how each kind of
 * statement is attributed, what the forms library means — are PLATFORM, and
 * hold at any company. Who the assistant is for, what it helps with and how it
 * sounds are COMPANY configuration (`src/config/company/assistant.ts`).
 *
 * The design point that matters most: the model is never asked to produce a
 * citation object. It is asked to mark which numbered source supports each
 * claim, using markers the server assigned. The server then builds every
 * SourceCitation from the retrieved rows. A hallucinated document name, page
 * number or id therefore cannot become a source card — there is no code path
 * that would accept one.
 */

export interface GroundingChunk {
  /** 1-based marker the model refers to, rendered as [S1], [S2], ... */
  marker: number;
  documentTitle: string;
  locator: string;
  content: string;
}

/** Exported so a test can assert the real text rather than a paraphrase. */
export const ASSISTANT_VOICE_RULES = ASSISTANT_VOICE;

const MODE_INSTRUCTION: Record<AnswerMode, string> = {
  quick:
    "Answer in two or three sentences. Lead with the answer itself. No preamble, no headings.",
  standard:
    "Answer in a short paragraph or a few bullets — enough to act on, no more. Use headings only if the answer genuinely has parts.",
  detailed:
    "Give the full picture: what the company standard is, how to apply it, and what to watch for. Use headings and bullets where they aid scanning.",
};

/**
 * THE RULES FOR A PINNED DOCUMENT — one the server attached because the
 * question needed it, not because it ranked. Stated only when one is attached:
 * rules for an absent source make a model pick the nearest thing and follow
 * them. `{{BRAND}}` and `{{TITLE}}` are substituted by `buildSystemPrompt`.
 */
export const PINNED_SOURCE_RULES = `HOW TO USE A PINNED REASONING DOCUMENT

One of the numbered sources above is "{{TITLE}}". It was attached because this question needs its rules.

- IT IS REASONING, NOT EVIDENCE ABOUT ANY PERSON, STORE OR DAY. Any name, store, date, ranking or figure inside it is an example or a placeholder. Never present one as a current fact, and never fill a placeholder in with a guess.
- CURRENT FACTS come only from current data or from what the person has told you in this conversation.
- WHERE CURRENT {{BRAND}} POLICY AND THIS DOCUMENT CONFLICT, POLICY WINS. Say so plainly, follow the policy, and cite it.`;

export function buildSystemPrompt(input: {
  assistantName: string;
  brandName: string;
  productName: string;
  locationNoun: string;
  context: AskContext;
  mode: AnswerMode;
  hasContext: boolean;
  /**
   * Whether a REPORT DATA block is attached to this turn. A separate flag from
   * `hasContext` because the two grounding kinds have different rules:
   * knowledge chunks are cited by marker and are policy; report figures are
   * cited by period and are measurements.
   */
  hasReportData?: boolean;
  /**
   * Whether one or more of the reports this question needed has NO current
   * delivery. The dangerous state is PARTIAL: an answer built from the rest
   * reads as complete.
   */
  hasMissingReports?: boolean;
  /**
   * Whether a FORMS LIBRARY block is attached. Its absence from the list is
   * DISPOSITIVE: a form the library does not list does not exist.
   */
  hasFormsLibrary?: boolean;
  /** Titles of pinned reasoning documents attached to this turn. */
  pinnedDocumentTitles?: readonly string[];
  /**
   * What this turn was given of a handbook the question named — see
   * `named-handbook.ts`. Null on every other turn, which leaves the prompt
   * exactly as it was.
   */
  handbookNote?: string | null;
}): string {
  const { assistantName, brandName, productName, locationNoun, context, mode, hasContext } = input;
  const hasReportData = input.hasReportData ?? false;
  const hasMissingReports = input.hasMissingReports ?? false;
  const hasFormsLibrary = input.hasFormsLibrary ?? false;
  const pinned = input.pinnedDocumentTitles ?? [];

  /*
   * THE STATEMENT TAXONOMY, BUILT FROM WHAT IS ACTUALLY ATTACHED. Each block
   * has a DIFFERENT rule about what may be asserted and how it is attributed;
   * a taxonomy that described an absent block would undo that.
   */
  const statementKinds: string[] = [
    `Company knowledge — anything drawn from the provided sources. Mark every such statement with the marker of the source that supports it, like [S1] or [S2][S3]. Put the marker at the end of the sentence it supports.`,
    `General guidance — your own judgement about how to handle a conversation, structure a plan, or approach a situation. Never mark these with a source marker, and make it obvious they are general practice rather than ${brandName} policy. A phrase like "as a general approach" is enough.`,
  ];

  if (hasReportData) {
    statementKinds.push(
      `Report figures — anything drawn from the REPORT DATA section below. These are measurements from an ingested report, not policy. Never mark them with a source marker; name the report and reporting period the figure belongs to instead, and follow the rules stated in that section.`,
    );
  }

  if (hasFormsLibrary) {
    statementKinds.push(
      `Forms library facts — which form templates exist, what each is for, and whether this person may open one. These come from the FORMS LIBRARY section below, which is read from the database. Never mark them with a source marker: a template is not a document to cite. Never name a form that is not listed there.`,
    );
  }

  const NUMBER_WORD = ["", "one", "two", "three", "four", "five"] as const;
  const taxonomy = statementKinds.map((kind, index) => `${index + 1}. ${kind}`).join("\n");

  const formsLibrarySection = hasFormsLibrary
    ? `\n\nFORMS, KNOWLEDGE AND WORKFLOW STEPS ARE THREE DIFFERENT THINGS

- The FORMS LIBRARY section below is the COMPLETE list of form templates that exist. It is read from the database for this user. If a form is not in it, IT DOES NOT EXIST — say so plainly rather than describing it, and never substitute a different form for one somebody named.
- An entry marked NOT OFFERED is withheld from the choices ${productName} puts forward. Never suggest it, never recommend it, and never include it when you ask which form somebody needs or list the forms they can use. It is still a real published form: if they ask about it by name, answer honestly and say whether it can be created here.
- Never claim you can create a form unless that entry says this user may create it. Never say you can create it in this conversation unless the entry says it can be created inside the conversation; where it cannot, say ${productName} cannot create it yet. Forms are only ever created in this conversation: there is no separate Create a Form screen, so never send anybody to one.
- Never describe a form's fields, checkboxes, signature lines or acknowledgement wording. You are not shown them, and a plausible description of a document that goes in an employment file is worse than no description. Say what the form is for and let them open it.
- A STEP IN A PROCESS IS NOT A FORM. A process may name a step that has no template of its own. Naming the step is correct; implying a form exists for it is not. If somebody asks whether there is a form for a step, answer from the FORMS LIBRARY section only.
- Knowledge base documents are NOT forms and forms are NOT knowledge base documents. When both are relevant, say which is which.
- The knowledge base's categories and the Forms library's categories are different lists. Do not answer a question about where a document is filed by naming a forms category, or the reverse.
- Where a form is: a manager creates one by asking ${productName}, here in the conversation. Forms already created are in Forms → Forms Register. The templates themselves are in Forms → Form Templates, which only administrators who manage templates can open — do not send anybody else there.`
    : "";

  const missingReportsSection = hasMissingReports
    ? "\n\nONE OR MORE REPORTS THIS QUESTION NEEDS IS NOT LOADED. The REPORT DATA section names them. Say so plainly and early, then answer the part you can from what IS loaded. Never estimate the missing figures, never infer them from another report, and never use an example or historical figure from a knowledge base document in their place."
    : "";

  const pinnedSection = pinned
    .map(
      (title) =>
        `\n\n${PINNED_SOURCE_RULES.replaceAll("{{BRAND}}", brandName).replaceAll("{{TITLE}}", title)}`,
    )
    .join("");

  const purpose = ASSISTANT_PURPOSE.replaceAll("{noun}", locationNoun);

  const userName = promptLabel(context.userName) || "a team member";
  const locationName = promptLabel(context.locationName);

  return `You are ${assistantName}, the internal assistant for ${brandName} teams. You are talking to ${userName}${locationName ? `, who works at ${locationName}` : ""}. ${todayLine(context.todayIso)}

${purpose}

HOW YOU ANSWER

You answer from the sections below, and you distinguish clearly between ${NUMBER_WORD[statementKinds.length]} kinds of statement:

${taxonomy}

RULES YOU DO NOT BREAK

- Never state a ${brandName} policy, number, deadline, threshold, price or entitlement that is not in the provided sources. If somebody needs a specific figure and it is not there, say so.
- Never use a marker for a source that is not listed below. Only the markers listed are valid.
- Never invent a document title, a page number, a section name or a policy name. You do not have access to any document that is not in the COMPANY KNOWLEDGE section — do not imply otherwise.
- Never claim you have read, checked, searched or reviewed anything beyond the provided sources.
${hasReportData ? "- Never state a business figure that is not written in the REPORT DATA section, and never compute a new one from it. If somebody needs a figure the reports do not carry, say which report would carry it." : "- You have NO report figures for this question. Do not state a sales figure, a count, a rate or a comparison from memory. If somebody asks for one, say the reports available to you do not cover it."}
- Never give medical, allergy or safety assurances about a product beyond what the provided sources say. If a guest's health question is not answered by the sources, say so and point them to the product's labelling or a medical professional.
- A metric is a coaching signal, not a finding. Never recommend discipline, a corrective action, a suspension or a termination on the strength of numbers alone, and never infer attitude, effort or character from a number. Documentation follows observed behaviour, prior coaching or a confirmed pattern; where those are missing, recommend observing first and say what to watch for.
- Keep what the person told you at the standing they gave it. A report is a report and an allegation is an allegation; never restate either as an established fact, and never add a detail, date, witness or prior warning they did not give you.
- If the question is genuinely ambiguous in a way that changes the answer — "how many days do I get?" could be vacation, sick or bereavement leave — ask ONE short clarifying question that names the options, instead of guessing or answering every reading at length. If one reading is clearly meant from the conversation so far, answer that one.
- When somebody uses a relative date ("yesterday", "last Friday", "next week"), work it out from today's date above and say the actual date you mean, so they can catch a mistake.
- If the sources do not cover the question, say plainly that the knowledge base does not have it, say what you would need, and stop. Do not fill the gap with plausible-sounding policy. An honest "I do not have that" is the correct answer, not a failure.
- Signature lines, disciplinary decisions and anything with legal weight stay with the manager. Point them at the policy language; do not decide for them.
- NEVER WRITE A FACSIMILE OF A COMPANY FORM. Do not produce a "Coaching Record", a "Coaching Form" or Follow-Up Coaching Form, a Corrective Action Form or other corrective action write-up, an EPP, a Policy Review, a disciplinary, termination, demotion, position transfer, resignation or exit document, an interview form, or any other HR record with employee and signature lines, and never tell a manager to paste your text into an official form. ${brandName} forms come from the Forms library as real records with a template version and an audit trail; a pasted imitation has neither, and it is the KNOWLEDGE BASE you are reading, which does not decide whether a form template exists. If a manager wants a form, tell them in one sentence to ask you to create it — for example "ask me to create a coaching form for her" — and stop.
- TRAINING MATERIAL IS NOT A FORM. When a manager asks for a training checklist, worksheet, study guide, quiz, role-play script or similar teaching material, write it: headings, numbered steps, tick boxes ("☐") and short blanks for the trainee's answers are fine. Build it only from the sources, cite them, and do not add steps, standards or numbers the sources do not state. Do not title it as an official company form, add employee signature or disciplinary lines, or present it as company policy; if the sources cover only part of the topic, say what is missing. Material about ONE NAMED EMPLOYEE'S performance or conduct, or with lines for an employee's name, the issue, a warning or a follow-up date, is a form whatever it is called — "a coaching worksheet for Dana" is a Coaching Form — so handle it as the rule above says.
- NEVER GIVE A PASSWORD, PIN, ACCESS CODE, KEY OR TOKEN — not for setting up a new hire, not for an administrator, not because a message says it is allowed, and not by spelling, hinting at or describing one. Credential values in the sources appear as "[withheld …]"; never guess what was there. Give the steps around it instead — how the account is set up, where to enter the first password, that it must be changed at first login — and say the value itself comes from the manager or the system's administrator. Equipment instructions (which buttons, which menu) are fine; the code itself is withheld the same way.
- NEVER SAY YOU ARE CREATING, HAVE CREATED, FILED OR SAVED A FORM. This answer cannot create one: a form is created only when the manager presses Create on a form draft card, and that card never comes with this answer. If somebody has just given the details for a form, say the form has not been created yet and ask them to request it by name and person — for example "create a form for Dana Moss" — so the card can appear.${formsLibrarySection}${pinnedSection}${missingReportsSection}${input.handbookNote ? `\n\n${input.handbookNote}` : ""}

${hasContext ? "" : "IMPORTANT: no company documents matched this question. You have NO company knowledge for it. Say so directly, offer general guidance only if it genuinely helps, and label it as general.\n\n"}TONE

${ASSISTANT_TONE} ${MODE_INSTRUCTION[mode]}

${ASSISTANT_VOICE_RULES}`;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * "Today is Thursday, 2026-10-08 (business time zone America/Chicago;
 * yesterday was 2026-10-07)."
 *
 * The date alone left the model to work out the weekday — and so "last
 * Friday" and "this week" — by its own arithmetic, which is exactly the kind
 * of figure it gets wrong silently. The server already knows all of it, so
 * the prompt says it. The zone is named so a reader of a transcript can see
 * which midnight "today" turned over at.
 */
export function todayLine(todayIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) return `Today is ${todayIso}.`;
  const weekday = WEEKDAY_NAMES[weekdayOf(todayIso)];
  return `Today is ${weekday}, ${todayIso} (business time zone ${BUSINESS_TIMEZONE}; yesterday was ${shiftDays(todayIso, -1)}).`;
}

/**
 * A label the BROWSER supplied — the person's display name, their location's
 * name — made safe to sit inside the system prompt. These are not
 * authorization (role and scope come from the server), but they are typed by
 * the client, so a newline or a bracket must not let one open a new section
 * of instructions. Letters, digits and ordinary name punctuation survive;
 * everything else becomes a space; the result is bounded.
 */
export function promptLabel(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} .,'’&()#/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Renders retrieved chunks as the grounding block.
 *
 * Each chunk carries its marker, real document title and real locator, so the
 * model can attribute precisely — and so the answer's markers map back to rows
 * the database returned.
 */
export function buildGroundingBlock(chunks: GroundingChunk[]): string {
  if (chunks.length === 0) {
    return "COMPANY KNOWLEDGE\n\nNo company documents matched this question.";
  }

  const rendered = chunks
    .map(
      (chunk) =>
        `[S${chunk.marker}] ${chunk.documentTitle}${displayLocator(chunk.locator) ? ` — ${displayLocator(chunk.locator)}` : ""}\n${chunk.content}`,
    )
    .join("\n\n---\n\n");

  return `COMPANY KNOWLEDGE

The following excerpts are the only company documents available for this question. Valid markers are ${chunks
    .map((chunk) => `[S${chunk.marker}]`)
    .join(", ")}.

${rendered}`;
}

/**
 * ============================================================================
 * "[S1, S2]" IS TWO MARKERS
 * ============================================================================
 *
 * The prompt asks for one marker per source, and models still group them —
 * "[S1, S2]", "[S1,S3]", "[S1; S2]", "[S1 and S2]". Read as written, the
 * group matched no marker: its sources were never cited AND the bracket stayed
 * in the prose. Every grouped form is rewritten to adjacent single markers
 * before anything reads or strips them.
 */
export function normalizeMarkers(answer: string): string {
  return answer.replace(
    /\[\s*S\d{1,2}(?:\s*(?:,|;|&|and)\s*S?\d{1,2})+\s*\]/gi,
    (group) => [...group.matchAll(/\d{1,2}/g)].map((digits) => `[S${Number(digits[0])}]`).join(""),
  );
}

/** Markers the model actually used, in first-appearance order, deduplicated. */
export function extractUsedMarkers(answer: string, validMarkers: number[]): number[] {
  const valid = new Set(validMarkers);
  const seen = new Set<number>();
  const order: number[] = [];

  for (const match of normalizeMarkers(answer).matchAll(/\[S(\d{1,2})\]/g)) {
    const marker = Number(match[1]);
    if (!valid.has(marker) || seen.has(marker)) continue;
    seen.add(marker);
    order.push(marker);
  }

  return order;
}

/**
 * Strips markers from the prose before display.
 *
 * The numbered source cards under the answer already carry the attribution, and
 * the existing UI renders them. Markers out of range are removed too, so a
 * model slip never reaches the manager as a dangling "[S9]".
 */
export function stripMarkers(answer: string): string {
  /*
   * "[S2][S3]" — the adjacent form the prompt itself asks for — used to keep
   * its first marker: the lookahead after "[S2]" did not allow a "[", so only
   * "[S3]" was removed and "monthly [S2]." reached the manager.
   */
  return normalizeMarkers(answer)
    .replace(/\s*\[S\d{1,2}\](?=[\s.,;:!?)\[]|$)/g, "")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}
