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
 * NOT VERIFIED for Buff City Soap: how a handbook's content is downloaded.
 * The reference platform verified a manage page + download-link request for
 * another company; that flow is used only when WOVEN_HANDBOOK_DOWNLOAD_ENABLED
 * is on (the connector supplies the version). Otherwise the handbook part is
 * BLOCKED (`handbook_download_unverified`).
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
 * One handbook. `currentVersionId` is supplied only when handbook downloads
 * are switched on and the manage page named one; otherwise the part is
 * BLOCKED, tracked and reported, never fetched.
 */
export function handbookRecord(row: HandbookRow, download: { currentVersionId: string | null } | null): SourceRecord {
  const part =
    download && download.currentVersionId
      ? {
          partKey: "current-version",
          title: row.title,
          fileName: null,
          documentId: null,
          versionId: download.currentVersionId,
          mimeType: null,
          sizeBytes: null,
          retrieval: { kind: "available" as const, locator: { handbookId: row.id, versionId: download.currentVersionId } },
        }
      : blockedPart("current-version", row.title, download ? "handbook_no_current_version" : BCS_CAPABILITY.handbookDownload);
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
    versionId: download?.currentVersionId ?? null,
    updatedAt: row.updatedAt,
    documentIds: [],
    attachmentIds: [],
    contentFingerprint: null,
    sourceMetadata: {},
    parts: [part],
  };
}
