import type { SourceRecord } from "../../../types";
import {
  attr,
  blockText,
  byId,
  childrenByTag,
  closest,
  elementsByClass,
  elementsByTag,
  elementsWithAttr,
  hasClass,
  parseHtmlDocument,
  parseHtmlFragment,
  textOf,
  walk,
} from "../../html";
import {
  BCS_CAPABILITY,
  POLICY_CARD,
  POLICY_DETAIL,
  POLICY_MANAGEMENT_HEADERS,
  POLICY_MANAGEMENT_ROW,
  POLICY_MANAGEMENT_STATUSES,
  POLICY_PUBLICATION_REASON,
} from "../contract";
import { WovenShapeError, assertUnique, blockedPart, digest, requireSuccessHtml, textPart, usDateToIso, validId } from "./shared";

/**
 * ============================================================================
 * POLICIES — `POST /KnowledgeCenter/_Policies_List`, `GET _Policy_Detail`
 * ============================================================================
 *
 * VERIFIED for Buff City Soap: the card list (id, title, "Version N", "Last
 * Update M/D/YYYY") and the detail fragment's structure.
 *
 * NOT VERIFIED: whether a policy is published, and who it is for. Every
 * policy therefore reads as publication UNKNOWN (`publication_unverified`)
 * with no audience stated, and none is synced. The listing still runs in full,
 * so the dry run inventories every policy and the ownership check sees them.
 */

export interface PolicyCard {
  id: string;
  title: string;
  version: string | null;
  updatedAt: string | null;
  /** Badge texts that are not "Version N" — counted, never interpreted. */
  otherBadges: string[];
}

export function parsePolicyCards(body: unknown): PolicyCard[] {
  const fragment = parseHtmlFragment(requireSuccessHtml(body, "policy"));
  const cards: PolicyCard[] = [];
  /* The card is the `div.woven-summary-container` carrying the id; a link or button inside it may carry it too. */
  const marked = elementsWithAttr(fragment, POLICY_CARD.idAttr);
  const containers = marked.filter((el) => el.tagName === "div" && hasClass(el, POLICY_CARD.containerClass));
  if (marked.length > 0 && containers.length === 0) {
    throw new WovenShapeError("schema_drift", "Woven's policy list no longer uses the verified card markup.");
  }
  for (const card of containers) {
    const id = validId(attr(card, POLICY_CARD.idAttr));
    if (!id) throw new WovenShapeError("schema_drift", "A policy card had no usable policy id.");
    const titleEl = elementsByClass(card, POLICY_CARD.titleClass)[0];
    const title = titleEl ? textOf(titleEl) : "";
    if (!title) throw new WovenShapeError("schema_drift", "A policy card had no title: Woven's policy list has changed shape.");

    let version: string | null = null;
    const otherBadges: string[] = [];
    for (const badge of elementsByTag(card, POLICY_CARD.badgeTag).filter((el) => hasClass(el, POLICY_CARD.badgeClass))) {
      const text = textOf(badge);
      const v = POLICY_CARD.version.exec(text);
      if (v) version = version ?? `Version ${v[1]}`;
      else if (text) otherBadges.push(text.slice(0, 60));
    }
    const updated = POLICY_CARD.updated.exec(textOf(card));
    cards.push({ id, title, version, updatedAt: updated ? usDateToIso(updated[1]!) : null, otherBadges });
  }
  assertUnique(
    cards.map((c) => c.id),
    "policy",
  );
  return cards;
}

/**
 * One policy as a source record. Publication is UNVERIFIED for this company,
 * so the record is never `published` — its text part exists so that, once
 * publication is established, the body is read from the verified detail
 * fragment without another adapter change.
 */
export function policyRecord(card: PolicyCard): SourceRecord {
  return {
    source: "woven",
    contentType: "policy",
    entityId: card.id,
    title: card.title,
    status: card.version,
    publication: "unknown",
    publicationReason: POLICY_PUBLICATION_REASON,
    audience: null,
    version: card.version,
    versionId: null,
    updatedAt: card.updatedAt,
    documentIds: [],
    attachmentIds: [],
    contentFingerprint: null,
    sourceMetadata: { otherBadges: card.otherBadges.length },
    parts: [textPart("content", card.title, null, { policyId: card.id })],
  };
}

export interface PolicyDetail {
  version: string | null;
  updatedAt: string | null;
  /** Null when the fragment has no `div.mb-md` body: the text is then BLOCKED, never guessed. */
  body: string | null;
}

/** The value of a `div.col-md-4` field whose own text starts with `label`. */
function fieldValue(root: ReturnType<typeof parseHtmlFragment>, label: RegExp): string | null {
  for (const field of elementsByClass(root, POLICY_DETAIL.fieldClass)) {
    if (!label.test(textOf(field))) continue;
    const value = [...walk(field)].find((el) => POLICY_DETAIL.valueClasses.every((c) => hasClass(el, c)));
    if (value) return textOf(value) || null;
  }
  return null;
}

/**
 * `GET /KnowledgeCenter/_Policy_Detail?pPolicyID=<id>` — the fragment whose
 * root is `div#policy-<id>`. A fragment for another policy, or without that
 * root, is a changed page and throws.
 */
export function parsePolicyDetail(html: string, policyId: string): PolicyDetail {
  const fragment = parseHtmlFragment(html);
  const root = byId(fragment, `${POLICY_DETAIL.rootIdPrefix}${policyId}`) ?? findRootCaseInsensitive(fragment, policyId);
  if (!root) throw new WovenShapeError("schema_drift", "A policy detail page was not the policy Ask Bubbles asked for.");

  /* The body: every outermost `div.mb-md` that is not one of the field blocks. */
  const blocks = elementsByClass(root, POLICY_DETAIL.bodyClass).filter(
    (el, _i, all) => el.tagName === "div" && !all.some((other) => other !== el && [...walk(other)].includes(el)),
  );
  const body = blocks.length === 0 ? null : blocks.map((b) => blockText(b)).filter((t) => t.length > 0).join("\n\n");

  const version = fieldValue(root, POLICY_DETAIL.versionLabel);
  const updated = fieldValue(root, POLICY_DETAIL.updatedLabel);
  return {
    version: version ? (/^\d+$/.test(version) ? `Version ${version}` : version) : null,
    updatedAt: updated ? (usDateToIso(updated) ?? null) : null,
    body,
  };
}

function findRootCaseInsensitive(fragment: ReturnType<typeof parseHtmlFragment>, policyId: string) {
  const want = `${POLICY_DETAIL.rootIdPrefix}${policyId}`.toLowerCase();
  return [...walk(fragment)].find((el) => (attr(el, "id") ?? "").toLowerCase() === want) ?? null;
}

/** A published policy's record, with its body read: a text part, or BLOCKED when the body is not there. */
export function withPolicyDetail(record: SourceRecord, detail: PolicyDetail): SourceRecord {
  const part =
    detail.body === null
      ? blockedPart("content", record.title, BCS_CAPABILITY.policyBody)
      : textPart("content", record.title, digest(detail.body), { policyId: record.entityId });
  return {
    ...record,
    version: detail.version ?? record.version,
    updatedAt: detail.updatedAt ?? record.updatedAt,
    parts: detail.body === "" ? [] : [part],
  };
}

/* ----------------------------------------------- the management table -- */

export interface PolicyManagementRow {
  id: string;
  title: string;
  status: string;
  publication: "published" | "unpublished";
  /** The Audience cell's text as one label ("Public", "All Teams 8 Positions"); null when empty or no such column. */
  audience: string[] | null;
  updatedAt: string | null;
}

/**
 * `GET /Policy` — Woven's policy management table (the sibling app's verified
 * shape; see `POLICY_MANAGEMENT_LIST_PATH`). Unlike the Knowledge Center
 * cards it says whether each policy is published and who it is for.
 *
 * A page without the table, a row without a usable id or title, a repeated
 * id, or a status not in `POLICY_MANAGEMENT_STATUSES` throws: the policy
 * listing fails rather than guess.
 */
export function parsePolicyManagementList(html: string): { rows: PolicyManagementRow[]; headers: string[] } {
  const doc = parseHtmlDocument(html);
  const marked = elementsWithAttr(doc, POLICY_MANAGEMENT_ROW.id).filter((el) => el.tagName === "tr");
  const table = marked[0] ? closest(marked[0], "table") : (elementsByTag(doc, "table")[0] ?? null);
  if (!table) throw new WovenShapeError("unexpected_shape", "Woven's policy page did not contain the policy table.");

  const headers = elementsByTag(table, "th").map((th) => textOf(th));
  const audienceIndex = headers.findIndex((h) => POLICY_MANAGEMENT_HEADERS.audience.test(h));
  const updatedIndex = headers.findIndex((h) => POLICY_MANAGEMENT_HEADERS.updated.test(h));

  const rows: PolicyManagementRow[] = [];
  for (const row of marked) {
    const id = validId(attr(row, POLICY_MANAGEMENT_ROW.id));
    if (!id) throw new WovenShapeError("schema_drift", "A policy row had no usable policy id.");
    const link = elementsByTag(row, "a").find((a) => (attr(a, "href") ?? "").toLowerCase().includes(`/policy/details/${id.toLowerCase()}`));
    const title = link ? textOf(link) : "";
    if (!title) throw new WovenShapeError("schema_drift", "A policy row had no title: Woven's policy table has changed shape.");

    const status = (attr(row, POLICY_MANAGEMENT_ROW.status) ?? "").trim().toLowerCase();
    const listed = POLICY_MANAGEMENT_STATUSES[status];
    if (!listed) {
      throw new WovenShapeError(
        "unknown_publication_state",
        `A policy has a status Ask Bubbles has not verified ("${status.slice(0, 60)}"), so the policy list was not used.`,
      );
    }
    const disabled = (attr(row, POLICY_MANAGEMENT_ROW.disabled) ?? "").trim().toLowerCase() === "true";

    const cells = childrenByTag(row, "td");
    const audienceText = audienceIndex >= 0 && cells[audienceIndex] ? textOf(cells[audienceIndex]!).replace(/\s+/g, " ").trim() : "";
    const updatedText = updatedIndex >= 0 && cells[updatedIndex] ? textOf(cells[updatedIndex]!).trim() : "";
    rows.push({
      id,
      title,
      status,
      publication: disabled ? "unpublished" : listed,
      audience: audienceText ? [audienceText] : null,
      updatedAt: usDateToIso(updatedText),
    });
  }
  assertUnique(
    rows.map((r) => r.id),
    "policy",
  );
  return { rows, headers };
}

/**
 * One policy from the management table as a source record. Its text is read
 * from the verified Knowledge Center detail fragment (`fetchPart`), keyed by
 * the same policy id.
 */
export function policyManagementRecord(row: PolicyManagementRow): SourceRecord {
  return {
    source: "woven",
    contentType: "policy",
    entityId: row.id,
    title: row.title,
    status: row.status,
    publication: row.publication,
    audience: row.audience,
    version: null,
    versionId: null,
    updatedAt: row.updatedAt,
    documentIds: [],
    attachmentIds: [],
    contentFingerprint: null,
    sourceMetadata: { listedFrom: "policy_management" },
    parts: [textPart("content", row.title, null, { policyId: row.id })],
  };
}
