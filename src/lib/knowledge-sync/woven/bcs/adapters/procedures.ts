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
 * PROCEDURES — `POST /KnowledgeCenter/_Search_Procedures`, ONE response
 * ============================================================================
 *
 * VERIFIED_LIVE for Midwest Soap Makers (sanitized structure probe):
 *
 *   * the empty-`Categories` search answers BOTH halves of the page in one
 *     `{ Success, HTML }`: 12 category cards (`data-procedure-category-name`,
 *     a slug such as "general-operations", with one `.indicator` count) and,
 *     after them in `#procedures-container`, all 51 procedure cards
 *     (`data-procedure-id`). Each procedure card names its category as one of
 *     its classes (the isotope filter). The indicators sum to 51.
 *   * a one-category search with that slug answers NO procedure cards, so the
 *     earlier per-category enumeration cannot prove anything and is not used.
 *   * drafts ARE returned to the admin session: 46 of 51 carry the
 *     "Unpublished" badge. A card without it reads as published.
 *   * the position line: `<div><img id="positions-assigned-image"></div>`
 *     followed by a sibling `<div>` with "All Positions" or the positions it
 *     is limited to.
 *
 * COMPLETENESS IS PROVED, OR THE LISTING FAILS. Every procedure card must
 * carry exactly one known category class; every category's cards must number
 * exactly its indicator; the distinct procedures must number the indicators'
 * sum. A missing or unreadable indicator, a card in no category or in two, a
 * repeated procedure, a card nested in a category card (or the reverse), or
 * any disagreement fails the whole listing: a partial or ambiguous list is
 * never read as the collection.
 *
 * A BADGE THAT IS NEITHER "Unpublished" NOR A FREQUENCY is an unknown
 * publication state: the listing fails rather than guess what it means.
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
  category: string;
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

function isInside(element: HtmlElement, ancestor: HtmlElement): boolean {
  for (let node = element.parentNode ?? null; node; node = node.parentNode ?? null) if (node === ancestor) return true;
  return false;
}

function readCategory(card: HtmlElement): ProcedureCategory {
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
  return { name, count: Number(indicators[0]) };
}

function badgesOf(card: HtmlElement): string[] {
  return elementsByTag(card, PROCEDURE_CARD.badgeTag)
    .filter((el) => hasClass(el, PROCEDURE_CARD.badgeClass))
    .flatMap((el) => textOf(el).split("|"))
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * The text beside `#positions-assigned-image`. VERIFIED_LIVE: the image sits
 * alone in a wrapper and the text in that wrapper's sibling, so an empty
 * wrapper reads its row instead — never further up than the row, and never
 * the card itself.
 */
function positionsOf(card: HtmlElement): string[] | null {
  const image = byId(card, PROCEDURE_CARD.positionsImageId);
  const holder = image?.parentNode as HtmlElement | undefined;
  if (!image || !holder || !(holder as { tagName?: string }).tagName) return null;
  let text = textOf(holder).trim();
  if (!text && holder !== card) {
    const row = holder.parentNode as HtmlElement | undefined;
    if (row && (row as { tagName?: string }).tagName && row !== card && isInside(row, card)) text = textOf(row).trim();
  }
  if (!text) return null;
  if (PROCEDURE_ALL_POSITIONS.test(text)) return ["All Positions"];
  return text
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function readCard(card: HtmlElement, id: string, category: string): ProcedureCard {
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
  return { id, title, category, badges, unpublished, frequency, positions: positionsOf(card) };
}

/**
 * The whole procedure listing from the one search response: its categories
 * and every procedure card, reconciled against the category counts.
 */
export function parseProcedureSearch(body: unknown): ProcedureListing {
  const fragment = parseHtmlFragment(requireSuccessHtml(body, "procedure"));

  const categoryCards = elementsWithAttr(fragment, PROCEDURE_CATEGORY_ATTR);
  const categories = categoryCards.map(readCategory);
  if (categories.length === 0) {
    throw new WovenShapeError("procedure_categories_missing", "Woven's procedure search returned no categories, so no procedure could be listed.");
  }
  assertUnique(
    categories.map((c) => c.name),
    "procedure category",
  );
  const categoryByKey = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  /* One element per procedure: an inner link repeating its card's id is the same card. */
  const procedureCards: { element: HtmlElement; id: string }[] = [];
  for (const element of elementsWithAttr(fragment, PROCEDURE_CARD.idAttr)) {
    const id = validId(attr(element, PROCEDURE_CARD.idAttr));
    if (!id) throw new WovenShapeError("schema_drift", "A procedure card had no usable id.");
    const outer = procedureCards.find((c) => isInside(element, c.element));
    if (outer) {
      if (outer.id.toLowerCase() !== id.toLowerCase()) throw ambiguous("A procedure card held another procedure's card.");
      continue;
    }
    procedureCards.push({ element, id });
  }
  assertUnique(
    procedureCards.map((c) => c.id),
    "procedure",
  );

  for (const { element } of procedureCards) {
    if (attr(element, PROCEDURE_CATEGORY_ATTR) !== null || categoryCards.some((c) => isInside(element, c) || isInside(c, element))) {
      throw ambiguous("A procedure card and a category card were mixed together.");
    }
  }

  const perCategory = new Map<string, number>();
  const cards = procedureCards.map(({ element, id }) => {
    const classes = new Set((attr(element, "class") ?? "").split(/\s+/).filter(Boolean).map((c) => c.toLowerCase()));
    const memberOf = [...classes].map((c) => categoryByKey.get(c)).filter((c): c is ProcedureCategory => c !== undefined);
    if (memberOf.length !== 1) {
      throw ambiguous(memberOf.length === 0 ? "A procedure card named none of the listed categories." : "A procedure card named more than one category.");
    }
    const category = memberOf[0]!;
    perCategory.set(category.name, (perCategory.get(category.name) ?? 0) + 1);
    return readCard(element, id, category.name);
  });

  for (const category of categories) {
    const found = perCategory.get(category.name) ?? 0;
    if (found !== category.count) {
      throw new WovenShapeError(
        "procedure_count_mismatch",
        `Woven's "${category.name.slice(0, 60)}" procedures numbered ${found}, not the ${category.count} its category shows, so the procedure list was not used.`,
      );
    }
  }
  const total = categories.reduce((sum, c) => sum + c.count, 0);
  if (cards.length !== total) {
    throw new WovenShapeError(
      "procedure_count_mismatch",
      `Woven listed ${cards.length} procedures, not the ${total} its categories show, so the procedure list was not used.`,
    );
  }
  return { categories, cards };
}

function ambiguous(what: string): WovenShapeError {
  return new WovenShapeError("procedure_listing_ambiguous", `${what} The procedure list could not be proved complete, so it was not used.`);
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
    sourceMetadata: { category: card.category, frequency: card.frequency, steps: steps?.length ?? null },
    parts,
  };
}
