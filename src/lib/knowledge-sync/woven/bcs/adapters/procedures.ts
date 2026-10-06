import type { SourcePart, SourceRecord } from "../../../types";
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
 * PROCEDURES — `POST /KnowledgeCenter/_Search_Procedures`, ONE request
 * ============================================================================
 *
 * VERIFIED for Buff City Soap (live structure diagnostic, 2026-10-06):
 *
 *   * the search with no category answers BOTH the category cards (each with
 *     one indicator count) and every procedure card, the latter in a hidden
 *     `.procedure-grid`. A search naming one category answers no procedures,
 *     so it is not used.
 *   * drafts ARE returned to the admin session: 46 of 51 carry the
 *     "Unpublished" badge. A card without it reads as published (the
 *     handoff's enumeration plan).
 *   * the position line: "All Positions", or the positions it is limited to.
 *
 * COMPLETENESS IS PROVED. The procedure cards must number exactly the SUM of
 * the category indicators (`procedure_count_mismatch` otherwise): a partial
 * list is never read as the collection. A procedure listed under two
 * categories would make the sum larger than the cards and fail the listing —
 * the verified data has none, and the listing does not guess.
 *
 * EVERY `data-procedure-id` element must be a `.woven-summary-container`
 * outside the category cards, and each id must appear once. Anything else is
 * a changed page (`schema_drift` / `duplicate_source_id`).
 *
 * A BADGE THAT IS NEITHER "Unpublished" NOR A FREQUENCY is an unknown
 * publication state: the listing fails rather than guess what it means.
 *
 * A card does not say which category it belongs to, so none is recorded.
 *
 * DETAIL: the full procedure page (`/KnowledgeCenter/Procedure/<id>`), read
 * only for published procedures. Steps carry `data-procedure-step-id` and
 * `#procedure-step-content`. A page without them leaves the text BLOCKED
 * (`procedure_content`). Step attachments are not read: neither their markup
 * nor their download has been verified for this company.
 */

export interface ProcedureCategory {
  name: string;
  count: number;
}

export interface ProcedureCard {
  id: string;
  title: string;
  /** Every badge text, split on "|", for the record. */
  badges: string[];
  unpublished: boolean;
  frequency: string | null;
  /** "All Positions", the positions it is limited to, or null when the card states none. */
  positions: string[] | null;
}

export interface ProcedureListing {
  categories: ProcedureCategory[];
  cards: ProcedureCard[];
}

function parseCategories(fragment: ReturnType<typeof parseHtmlFragment>): { categories: ProcedureCategory[]; cardElements: HtmlElement[] } {
  const cardElements = elementsWithAttr(fragment, PROCEDURE_CATEGORY_ATTR);
  const categories: ProcedureCategory[] = [];
  for (const card of cardElements) {
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
  return { categories, cardElements };
}

/** Every element with the badge class (the tag is not relied on), split on "|". */
function badgesOf(card: HtmlElement): string[] {
  return [...walk(card)]
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

function insideAny(element: HtmlElement, containers: readonly HtmlElement[]): boolean {
  for (let node = element.parentNode as HtmlElement | undefined; node; node = node.parentNode as HtmlElement | undefined) {
    if (containers.includes(node)) return true;
  }
  return false;
}

function parseCard(card: HtmlElement): ProcedureCard {
  const id = validId(attr(card, PROCEDURE_CARD.idAttr));
  if (!id) throw new WovenShapeError("schema_drift", "A procedure card had no usable id.");
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
  return { id, title, badges, unpublished, frequency, positions: positionsOf(card) };
}

/**
 * The whole procedure listing from the one empty-category search: the
 * categories, and every procedure card — proved complete against the sum of
 * the category counts.
 */
export function parseProcedureListing(body: unknown): ProcedureListing {
  const fragment = parseHtmlFragment(requireSuccessHtml(body, "procedure"));
  const { categories, cardElements } = parseCategories(fragment);

  const procedureElements = elementsWithAttr(fragment, PROCEDURE_CARD.idAttr);
  for (const el of procedureElements) {
    if (!hasClass(el, PROCEDURE_CARD.containerClass) || insideAny(el, cardElements)) {
      throw new WovenShapeError("schema_drift", "Woven's procedure list carried a procedure id outside the verified procedure cards.");
    }
  }
  const cards = procedureElements.map(parseCard);
  assertUnique(
    cards.map((c) => c.id),
    "procedure",
  );

  const expected = categories.reduce((sum, c) => sum + c.count, 0);
  if (cards.length !== expected) {
    throw new WovenShapeError(
      "procedure_count_mismatch",
      `Woven's procedure list held ${cards.length} procedures, not the ${expected} its categories show, so the procedure list was not used.`,
    );
  }
  return { categories, cards };
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
  if (detailHtml !== null) {
    const detail = parseProcedureDetail(detailHtml);
    if (detail.title === null) throw new WovenShapeError("schema_drift", "A procedure page was not the verified procedure page.");
    steps = detail.steps;
    const text = steps ? procedureText(steps) : "";
    if (!steps) parts.push(blockedPart("content", card.title, BCS_CAPABILITY.procedureContent));
    else if (text) parts.push(textPart("content", card.title, digest(text), { procedureId: card.id }));
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
    sourceMetadata: { frequency: card.frequency, steps: steps?.length ?? null },
    parts,
  };
}
