import type { SourceRecord } from "../../../types";
import { htmlText } from "../../html";
import { BCS_CAPABILITY, HANDBOOK_COLUMNS, HANDBOOK_MANAGE_HREF, HANDBOOK_STATUS } from "../contract";
import {
  WovenShapeError,
  assertUnique,
  blockedPart,
  cellHref,
  keyedCell,
  requireColumns,
  requireList,
  resolveStatus,
  sortableTimestampToIso,
  validId,
} from "./shared";

/**
 * ============================================================================
 * HANDBOOKS — `POST /KnowledgeCenter/_Handbooks_List_ForDataTable`
 * ============================================================================
 *
 * VERIFIED for Buff City Soap: the list and its four columns. Column1's link
 * must carry the row's own `EntityID` — a mismatch is schema drift.
 *
 * NOT VERIFIED for Buff City Soap: how a handbook's content is read or
 * downloaded. No route is borrowed from another company's integration; the
 * handbook part is BLOCKED (`handbook_download_unverified`) until one is
 * verified for Midwest Soap Makers.
 */

export interface HandbookRow {
  id: string;
  title: string;
  status: string;
  publication: SourceRecord["publication"];
  publicationReason: string | null;
  audience: string[] | null;
  updatedAt: string | null;
}

export function parseHandbookRows(body: unknown): HandbookRow[] {
  const rows: HandbookRow[] = [];
  for (const row of requireList(body, "handbook")) {
    requireColumns(row, [HANDBOOK_COLUMNS.name, HANDBOOK_COLUMNS.status, HANDBOOK_COLUMNS.audience, HANDBOOK_COLUMNS.updated], "handbook");
    const id = validId(row[HANDBOOK_COLUMNS.id]);
    if (!id) throw new WovenShapeError("schema_drift", "A handbook row had no usable id.");

    const href = cellHref(row[HANDBOOK_COLUMNS.name]);
    const linked = href ? HANDBOOK_MANAGE_HREF.exec(href)?.[1] : undefined;
    if (!linked || linked.toLowerCase() !== id.toLowerCase()) {
      throw new WovenShapeError("schema_drift", "A handbook row's link did not match its id: Woven's handbook list has changed shape.");
    }
    const title = htmlText(row[HANDBOOK_COLUMNS.name]);
    if (!title) throw new WovenShapeError("schema_drift", "A handbook row had no name.");

    const status = resolveStatus(row[HANDBOOK_COLUMNS.status], HANDBOOK_STATUS, "handbook");
    const audience = htmlText(row[HANDBOOK_COLUMNS.audience]);
    const updated = keyedCell(row[HANDBOOK_COLUMNS.updated]);
    rows.push({
      id,
      title,
      status: status.label,
      publication: status.publication,
      publicationReason: status.reason,
      audience: audience ? [audience] : null,
      updatedAt: updated.key ? sortableTimestampToIso(updated.key) : null,
    });
  }
  assertUnique(
    rows.map((r) => r.id),
    "handbook",
  );
  return rows;
}

/**
 * One handbook. Its content is NOT readable yet: no handbook detail or
 * download route has been verified for this company, so the part is BLOCKED
 * (`handbook_download_unverified`) — tracked, reported, never fetched.
 */
export function handbookRecord(row: HandbookRow): SourceRecord {
  return {
    source: "woven",
    contentType: "handbook",
    entityId: row.id,
    title: row.title,
    status: row.status,
    publication: row.publication,
    publicationReason: row.publicationReason,
    audience: row.audience,
    version: null,
    versionId: null,
    updatedAt: row.updatedAt,
    documentIds: [],
    attachmentIds: [],
    contentFingerprint: null,
    sourceMetadata: {},
    parts: [blockedPart("current-version", row.title, BCS_CAPABILITY.handbookDownload)],
  };
}
