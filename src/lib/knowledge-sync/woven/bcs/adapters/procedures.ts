import type { SourcePart, SourceRecord } from "../../../types";
import { parseProcedureStepAttachments } from "../../adapters";
import {
  attr,
  blockText,
  byId,
  elementsByClass,
  elementsByTag,
  elementsWithAttr,
  hasClass,
  parseHtmlDocument,
  parseHtmlFragment,
  textOf,
  walk,
  type HtmlElement,
} from "../../html";
import {
  BCS_CAPABILITY,
  PROCEDURE_ALL_POSITIONS,
  PROCEDURE_CARD,
  PROCEDURE_CATEGORY_ATTR,
  PROCEDURE_CATEGORY_INDICATOR_CLASS,
  PROCEDURE_DETAIL,
  PROCEDURE_FREQUENCY_BADGES,
  PROCEDURE_UNPUBLISHED_BADGE,
} from "../contract";
import { WovenShapeError, assertUnique, blockedPart, digest, requireSuccessHtml, textPart, validId } from "./shared";

/**
 * ============================================================================
 * PROCEDURES — `POST /KnowledgeCenter/_Search_Procedures`, by category
 * ============================================================================
 *
 * VERIFIED for Buff City Soap:
 *
 *   * an empty `Categories` search answers CATEGORY cards, each with its
 *     indicator count; a one-category search answers that category's
 *     procedure cards. All 12 categories gave 51 unique procedures, and every
 *     category's count matched its indicator.
 *   * drafts ARE returned to the admin session: 46 of 51 carry the
 *     "Unpublished" badge. A card without it reads as published (the
 *     handoff's enumeration plan).
 *   * the position line: "All Positions", or the positions it is limited to.
 *
 * COMPLETENESS IS PROVED. A category whose cards do not number exactly its
 * indicator count fails the whole listing (`procedure_count_mismatch`): a
 * partial list is never read as the collection.
 *
 * A BADGE THAT IS NEITHER "Unpublished" NOR A FREQUENCY is an unknown
 * publication state: the listing fails rather than guess what it means.
 *
 * DETAIL: the full procedure page (`/KnowledgeCenter/Procedure/<id>`), read
 * only for published procedures. Steps carry `data-procedure-step-id` and
 * `#procedure-step-content`. A page without them leaves the text BLOCKED
 * (`procedure_content`). Step attachments are inventoried as BLOCKED: their
 * download is unverified for this company.
 */

export interface ProcedureCategory {
  name: string;
  count: number;
}

export function parseProcedureCategories(body: unknown): ProcedureCategory[] {
  const fragment = parseHtmlFragment(requireSuccessHtml(body, "procedure category"));
  if (elementsWithAttr(fragment, PROCEDURE_CARD.idAttr).length > 0) {
    throw new WovenShapeError("schema_drift", "Woven's procedure search answered procedures where categories were expected.");
  }
  const categories: ProcedureCategory[] = [];
  for (const card of elementsWithAttr(fragment, PROCEDURE_CATEGORY_ATTR)) {
    const name = (attr(card, PROCEDURE_CATEGORY_ATTR) ?? "").trim();
    if (!name || name.length > 120) throw new WovenShapeError("schema_drift", "A procedure category had no usable name.");
    const indicators = [...walk(card)]
      .filter((el) => (attr(el, "class") ?? "").split(/\s+/).some((c) => PROCEDURE_CATEGORY_INDICATOR_CLASS.test(c)))
      .map((el) => textOf(el))
      .filter((t) => /^\d+$/.test(t));
    if (indicators.length !== 1) {
      throw new WovenShapeError(
        "procedure_category_count_unreadable",
        `The procedure category "${name.slice(0, 60)}" did not show one readable count, so the procedure list could not be proved complete.`,
      );
    }
    categories.push({ name, count: Number(indicators[0]) });
  }
  if (categories.length === 0) {
    throw new WovenShapeError("procedure_categories_missing", "Woven's procedure search returned no categories, so no procedure could be listed.");
  }
  assertUnique(
    categories.map((c) => c.name),
    "procedure category",
  );
  return categories;
}

export interface ProcedureCard {
  id: string;
  title: string;
  category: string;
  /** Every badge text, split on "|", for the record. */
  badges: string[];
  unpublished: boolean;
  frequency: string | null;
  /** "All Positions", the positions it is limited to, or null when the card states none. */
  positions: string[] | null;
}

function badgesOf(card: HtmlElement): string[] {
  return elementsByTag(card, PROCEDURE_CARD.badgeTag)
    .filter((el) => hasClass(el, PROCEDURE_CARD.badgeClass))
    .flatMap((el) => textOf(el).split("|"))
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** The text beside `#positions-assigned-image`: its parent's own text. */
function positionsOf(card: HtmlElement): string[] | null {
  const image = byId(card, PROCEDURE_CARD.positionsImageId);
  const holder = image?.parentNode as HtmlElement | undefined;
  if (!image || !holder || !(holder as { tagName?: string }).tagName) return null;
  const text = textOf(holder).trim();
  if (!text) return null;
  if (PROCEDURE_ALL_POSITIONS.test(text)) return ["All Positions"];
  return text
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** One category's procedure cards. The count must equal the category's indicator. */
export function parseProcedureCards(body: unknown, category: ProcedureCategory): ProcedureCard[] {
  const fragment = parseHtmlFragment(requireSuccessHtml(body, "procedure"));
  const cards: ProcedureCard[] = [];
  const seen = new Set<string>();
  for (const card of elementsWithAttr(fragment, PROCEDURE_CARD.idAttr)) {
    const id = validId(attr(card, PROCEDURE_CARD.idAttr));
    if (!id) throw new WovenShapeError("schema_drift", "A procedure card had no usable id.");
    /* A link or button inside a card may repeat the id; one card per procedure. */
    if (seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    const titleEl = elementsByClass(card, PROCEDURE_CARD.titleClass)[0];
    const title = titleEl ? textOf(titleEl) : "";
    if (!title) throw new WovenShapeError("schema_drift", "A procedure card had no title: Woven's procedure list has changed shape.");

    const badges = badgesOf(card);
    let unpublished = false;
    let frequency: string | null = null;
    for (const badge of badges) {
      if (PROCEDURE_UNPUBLISHED_BADGE.test(badge)) unpublished = true;
      else if (PROCEDURE_FREQUENCY_BADGES.test(badge)) frequency = frequency ?? badge;
      else {
        throw new WovenShapeError(
          "unknown_publication_state",
          `A procedure carries a badge Ask Bubbles has not verified ("${badge.slice(0, 40)}"), so the procedure list was not used.`,
        );
      }
    }
    cards.push({ id, title, category: category.name, badges, unpublished, frequency, positions: positionsOf(card) });
  }
  if (cards.length !== category.count) {
    throw new WovenShapeError(
      "procedure_count_mismatch",
      `Woven's "${category.name.slice(0, 60)}" procedures numbered ${cards.length}, not the ${category.count} its category shows, so the procedure list was not used.`,
    );
  }
  return cards;
}

/** Cards of every category, one per procedure (a procedure in two categories keeps its first). */
export function unionProcedureCards(perCategory: ProcedureCard[][]): ProcedureCard[] {
  const byId = new Map<string, ProcedureCard>();
  for (const cards of perCategory) for (const card of cards) if (!byId.has(card.id.toLowerCase())) byId.set(card.id.toLowerCase(), card);
  return [...byId.values()];
}

export interface ProcedureStep {
  stepId: string;
  text: string;
}

/**
 * The detail page's steps: elements carrying `data-procedure-step-id` with a
 * `#procedure-step-content` inside, deduplicated by step id (a carousel may
 * repeat them). Null when there is none — the text is then BLOCKED.
 */
export function parseProcedureDetail(html: string): { title: string | null; steps: ProcedureStep[] | null } {
  const doc = parseHtmlDocument(html);
  const titleTag = elementsByTag(doc, "title")[0];
  const titleText = titleTag ? textOf(titleTag) : "";
  const title = PROCEDURE_DETAIL.title.test(titleText) ? titleText.replace(PROCEDURE_DETAIL.title, "").trim() || null : null;

  const steps: ProcedureStep[] = [];
  const seen = new Set<string>();
  for (const el of elementsWithAttr(doc, PROCEDURE_DETAIL.stepIdAttr)) {
    const stepId = validId(attr(el, PROCEDURE_DETAIL.stepIdAttr));
    const content = byId(el, PROCEDURE_DETAIL.stepContentId);
    if (!stepId || !content || seen.has(stepId.toLowerCase())) continue;
    seen.add(stepId.toLowerCase());
    const text = blockText(content).trim();
    steps.push({ stepId, text: PROCEDURE_DETAIL.placeholderBody.test(text) ? "" : text });
  }
  return { title, steps: steps.length > 0 ? steps : null };
}

/** The procedure's text: its steps in page order. */
export function procedureText(steps: ProcedureStep[]): string {
  return steps
    .map((s, i) => (s.text ? `Step ${i + 1}\n${s.text}` : ""))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * One procedure. `detailHtml` is given only for a published procedure: a
 * draft's page is never fetched, since a draft is never synced.
 */
export function procedureRecord(card: ProcedureCard, detailHtml: string | null): SourceRecord {
  const parts: SourcePart[] = [];
  let steps: ProcedureStep[] | null = null;
  let attachments = 0;
  if (detailHtml !== null) {
    const detail = parseProcedureDetail(detailHtml);
    if (detail.title === null) throw new WovenShapeError("schema_drift", "A procedure page was not the verified procedure page.");
    steps = detail.steps;
    const text = steps ? procedureText(steps) : "";
    if (!steps) parts.push(blockedPart("content", card.title, BCS_CAPABILITY.procedureContent));
    else if (text) parts.push(textPart("content", card.title, digest(text), { procedureId: card.id }));
    /* Attachments are inventoried, not fetched: the download is unverified for this company. */
    for (const a of parseProcedureStepAttachments(detailHtml)) {
      attachments += 1;
      parts.push(
        blockedPart(`attachment:${a.stepId ?? "none"}:${a.storedFileName}`.slice(0, 240), `${card.title} — ${a.fileName ?? "attachment"}`, BCS_CAPABILITY.procedureAttachment, {
          fileName: a.fileName,
          versionId: a.stepId,
        }),
      );
    }
  } else {
    parts.push(textPart("content", card.title, null, { procedureId: card.id }));
  }

  return {
    source: "woven",
    contentType: "procedure",
    entityId: card.id,
    title: card.title,
    status: card.unpublished ? "Unpublished" : "Published",
    publication: card.unpublished ? "unpublished" : "published",
    publicationReason: card.unpublished ? "unpublished" : null,
    audience: card.positions,
    version: null,
    versionId: null,
    /* No dependable updated date in the list: the step text's own digest is the change evidence. */
    updatedAt: null,
    documentIds: [],
    attachmentIds: [],
    contentFingerprint: null,
    sourceMetadata: { category: card.category, frequency: card.frequency, steps: steps?.length ?? null, attachments },
    parts,
  };
}
