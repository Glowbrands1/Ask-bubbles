import type { SourceRecord } from "../../../types";
import { htmlText, parseHtmlDocument, readInlineVar } from "../../html";
import { BCS_CAPABILITY, HANDBOOK_COLUMNS, HANDBOOK_MANAGE_HREF, HANDBOOK_STATUS, HANDBOOK_VARS } from "../contract";
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
 * VERIFIED for Buff City Soap on 8 Oct 2026: the manage page's version
 * variables and the version download (`contract.ts`). A handbook's current
 * version is a downloadable part. Whether it is ever ingested is still
 * decided elsewhere: a title naming another company is held for ownership
 * review until its id is confirmed (`WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW`), and
 * the audience rules apply as to every other item.
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

export interface HandbookManage {
  currentVersionId: string | null;
  draftVersionId: string | null;
  updatedOn: string | null;
  name: string | null;
}

/** `GET /KnowledgeCenter/Handbooks/{id}/manage` — the inline version variables. */
export function parseHandbookManage(html: string, expectedId: string): HandbookManage {
  const doc = parseHtmlDocument(html);
  const id = validId(readInlineVar(doc, HANDBOOK_VARS.id));
  if (!id) throw new WovenShapeError("unexpected_shape", "A handbook page did not carry its handbook id.");
  if (id.toLowerCase() !== expectedId.toLowerCase()) throw new WovenShapeError("unexpected_shape", "A handbook page was for a different handbook.");
  const text = (name: string) => {
    const value = readInlineVar(doc, name);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const updated = text(HANDBOOK_VARS.updatedOn);
  return {
    currentVersionId: validId(readInlineVar(doc, HANDBOOK_VARS.currentVersionId)),
    draftVersionId: validId(readInlineVar(doc, HANDBOOK_VARS.draftVersionId)),
    updatedOn: updated ? (/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(updated)?.[1] ?? null) : null,
    name: text(HANDBOOK_VARS.name),
  };
}

/** `POST /KnowledgeCenter/_Handbook_DownloadVersion` — a fresh, short-lived download link. */
export function parseHandbookDownload(body: unknown): { url: string; fileName: string } {
  const record = body as { Success?: unknown; Download?: { DownloadURL?: unknown; FileName?: unknown } } | null;
  if (!record || record.Success !== true || !record.Download || typeof record.Download.DownloadURL !== "string") {
    throw new WovenShapeError("download_refused", "Woven did not provide a download for this handbook version.");
  }
  const fileName = typeof record.Download.FileName === "string" && record.Download.FileName.trim() ? record.Download.FileName.trim() : "handbook.pdf";
  return { url: record.Download.DownloadURL, fileName };
}

/**
 * One handbook. Its current version is the part to download. A handbook that
 * was opened and has no current version has nothing to read; one that was
 * never opened (unpublished, or held for ownership review) keeps its listed
 * publication and a blocked part.
 */
export function handbookRecord(row: HandbookRow, manage: HandbookManage | null): SourceRecord {
  const versionId = manage?.currentVersionId ?? null;
  const noVersion = manage !== null && versionId === null && row.publication === "published";
  const publication: SourceRecord["publication"] = noVersion ? "unpublished" : row.publication;
  return {
    source: "woven",
    contentType: "handbook",
    entityId: row.id,
    title: row.title,
    status: row.status,
    publication,
    publicationReason: noVersion ? BCS_CAPABILITY.handbookNoCurrentVersion : row.publicationReason,
    audience: row.audience,
    version: null,
    versionId,
    updatedAt: manage?.updatedOn ?? row.updatedAt,
    documentIds: [],
    attachmentIds: [],
    contentFingerprint: null,
    sourceMetadata: manage ? { hasDraft: manage.draftVersionId !== null } : {},
    parts: [
      versionId
        ? {
            partKey: "current-version",
            title: row.title,
            fileName: null,
            documentId: null,
            versionId,
            mimeType: null,
            sizeBytes: null,
            retrieval: { kind: "available", locator: { handbookId: row.id, versionId } },
          }
        : blockedPart("current-version", row.title, manage ? BCS_CAPABILITY.handbookNoCurrentVersion : BCS_CAPABILITY.handbookNotOpened),
    ],
  };
}
