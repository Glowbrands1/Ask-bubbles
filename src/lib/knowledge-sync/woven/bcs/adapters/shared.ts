import { createHash } from "node:crypto";

import type { Publication, SourcePart } from "../../../types";
import { WovenShapeError } from "../../shared";
import { attr, hasClass, htmlText, parseHtmlFragment, shownText, textOf, walk } from "../../html";

/**
 * Helpers shared by the Buff City Soap adapters. PURE: strings in, values out.
 *
 * EVERY SHAPE CHECK FAILS CLOSED. A cell that does not read the way the
 * handoff recorded it throws `WovenShapeError`; the connector turns that into
 * a failed listing, and a failed listing changes nothing in Ask Bubbles.
 */

export { WovenShapeError };

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,199}$/;

export function validId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value).trim();
  return ID_PATTERN.test(id) ? id : null;
}

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** `{ Success: true, HTML: "..." }`, the verified card-list shape. */
export function requireSuccessHtml(body: unknown, what: string): string {
  const record = body as { Success?: unknown; HTML?: unknown } | null;
  if (!record || typeof record !== "object" || record.Success !== true || typeof record.HTML !== "string") {
    throw new WovenShapeError("unexpected_shape", `Woven's ${what} response was not a successful list.`);
  }
  return record.HTML;
}

/** `{ list: [...] }`, the verified DataTables shape, with every row an object. */
export function requireList(body: unknown, what: string): Record<string, unknown>[] {
  if (typeof body !== "object" || body === null || !Array.isArray((body as { list?: unknown }).list)) {
    throw new WovenShapeError("unexpected_shape", `Woven's ${what} response did not contain the expected list.`);
  }
  const list = (body as { list: unknown[] }).list;
  if (list.some((row) => typeof row !== "object" || row === null || Array.isArray(row))) {
    throw new WovenShapeError("unexpected_shape", `Woven's ${what} list contained rows Ask Bubbles could not read.`);
  }
  return list as Record<string, unknown>[];
}

/** Every listed column must be present as a string on every row: a missing column is schema drift. */
export function requireColumns(row: Record<string, unknown>, columns: readonly string[], what: string): void {
  const missing = columns.filter((c) => typeof row[c] !== "string");
  if (missing.length > 0) {
    throw new WovenShapeError("schema_drift", `A ${what} row was missing ${missing.join(", ")}: Woven's list has changed shape.`);
  }
}

/** Each Woven id may appear once per listing. A repeat means the list is not what it was verified to be. */
export function assertUnique(ids: readonly string[], what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    const key = id.toLowerCase();
    if (seen.has(key)) throw new WovenShapeError("duplicate_source_id", `Woven's ${what} list named the same item twice.`);
    seen.add(key);
  }
}

/**
 * A DataTables cell carrying a hidden sort key before its label
 * (`<span class="hidden">2</span><span class="badge">Published</span>`).
 * The key is the first `.hidden` element's text; the label is what is shown.
 * A cell flattened to "2 Published" is read the same way.
 */
export function keyedCell(value: unknown): { key: string | null; label: string } {
  if (typeof value !== "string") return { key: null, label: "" };
  if (value.includes("<")) {
    const fragment = parseHtmlFragment(value);
    for (const el of walk(fragment)) {
      if (hasClass(el, "hidden")) {
        const key = textOf(el).trim();
        return { key: key || null, label: shownText(value) };
      }
    }
  }
  const text = htmlText(value);
  const flat = /^(\d+)\s+(.+)$/.exec(text);
  return flat ? { key: flat[1]!, label: flat[2]!.trim() } : { key: null, label: text };
}

export type StatusTable = Record<string, { label: RegExp; publication: "published" | "unpublished"; reason: string | null }>;

/**
 * A status cell resolved against the statuses VERIFIED for that list. A key
 * not in the table, or a label that does not match its key, is an UNKNOWN
 * PUBLICATION STATE — the listing fails rather than guess.
 */
export function resolveStatus(
  value: unknown,
  table: StatusTable,
  what: string,
): { label: string; publication: Publication; reason: string | null } {
  const { key, label } = keyedCell(value);
  const known = key !== null ? table[key] : undefined;
  const normalized = label.replace(/\s+/g, " ").trim();
  if (!known || !known.label.test(normalized)) {
    throw new WovenShapeError(
      "unknown_publication_state",
      `A ${what} item has a status Ask Bubbles has not verified ("${normalized.slice(0, 60)}"), so the ${what} list was not used.`,
    );
  }
  return { label: normalized, publication: known.publication, reason: known.reason };
}

/** .NET ticks (100 ns since 0001-01-01) → ISO date-time, or null when not a plausible date. */
export function ticksToIso(ticks: string): string | null {
  if (!/^\d{15,20}$/.test(ticks)) return null;
  /* BigInt: ticks exceed Number's exact range. 621355968000000000 = ticks at the Unix epoch. */
  const ms = (BigInt(ticks) - BigInt("621355968000000000")) / BigInt(10000);
  const date = new Date(Number(ms));
  const year = date.getUTCFullYear();
  if (Number.isNaN(date.getTime()) || year < 2000 || year > 2100) return null;
  return date.toISOString();
}

/** "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DDTHH:mm:ss", or null. */
export function sortableTimestampToIso(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/.exec(value.trim());
  if (!m) return null;
  return m[2] ? `${m[1]}T${m[2]}` : m[1]!;
}

/** "5/13/2026" → "2026-05-13". */
export function usDateToIso(value: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  return m ? `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}` : null;
}

/** An `<a href>` inside a cell, or null. */
export function cellHref(value: unknown): string | null {
  if (typeof value !== "string" || !value.includes("<")) return null;
  for (const el of walk(parseHtmlFragment(value))) {
    if (el.tagName === "a") return attr(el, "href");
  }
  return null;
}

/** A part whose bytes are not obtainable (yet). */
export function blockedPart(partKey: string, title: string, capability: string, extra: Partial<SourcePart> = {}): SourcePart {
  return {
    partKey,
    title,
    fileName: null,
    documentId: null,
    versionId: null,
    mimeType: null,
    sizeBytes: null,
    ...extra,
    retrieval: { kind: "blocked", capability },
  };
}

/** A text part: the bytes are built from the page at download time. */
export function textPart(partKey: string, title: string, contentDigest: string | null, locator: Record<string, string>): SourcePart {
  return {
    partKey,
    title,
    fileName: null,
    documentId: null,
    versionId: null,
    mimeType: "text/plain",
    sizeBytes: null,
    contentDigest,
    retrieval: { kind: "available", locator },
  };
}

/** The labels of a cell of badges ("Safety", "Training"); a plain cell is split on commas. */
export function badgeLabels(value: unknown): string[] {
  if (typeof value === "string" && value.includes("<")) {
    const badges = [...walk(parseHtmlFragment(value))].filter((el) => hasClass(el, "badge")).map((el) => textOf(el)).filter(Boolean);
    if (badges.length > 0) return [...new Set(badges)];
  }
  return htmlText(value)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
