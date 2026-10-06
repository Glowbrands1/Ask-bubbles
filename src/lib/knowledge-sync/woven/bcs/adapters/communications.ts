import type { SourceRecord } from "../../../types";
import { htmlText } from "../../html";
import { BCS_CAPABILITY, COMMUNICATION_COLUMNS, COMMUNICATION_STATUS, TEAM_POSITION_AUDIENCE } from "../contract";
import { WovenShapeError, assertUnique, blockedPart, requireColumns, requireList, resolveStatus, validId } from "./shared";

/**
 * ============================================================================
 * COMMUNICATIONS — `POST /Communication/_List_ForDataTable`
 * ============================================================================
 *
 * VERIFIED for Buff City Soap: the list (133 rows) and its columns. Statuses
 * seen: 1 Draft, 3 "Published – Not Visible". The published-and-visible
 * status has not been observed, so it is not mapped: a row carrying it fails
 * the listing until it is verified.
 *
 * INVENTORY ONLY. The detail page and attachments are UNVERIFIED, so the
 * content part is BLOCKED (`communication_detail_unverified`). Drafts and
 * "Published – Not Visible" items (outside their visibility window) are held
 * out by status before that matters. Whether expired communications belong in
 * Ask Bubbles at all is a product decision recorded in docs/woven.md.
 *
 * NO PERSONAL DATA: "Created By" (Column6) is never read.
 */

export interface CommunicationRow {
  id: string;
  title: string;
  status: string;
  publication: SourceRecord["publication"];
  publicationReason: string | null;
  audience: string[] | null;
  visibleRange: string | null;
  publishedOn: string | null;
}

export function parseCommunicationRows(body: unknown): CommunicationRow[] {
  const rows: CommunicationRow[] = [];
  const columns = Object.values(COMMUNICATION_COLUMNS).filter((c) => c !== COMMUNICATION_COLUMNS.id);
  for (const row of requireList(body, "communication")) {
    requireColumns(row, columns, "communication");
    const id = validId(row[COMMUNICATION_COLUMNS.id]);
    if (!id) throw new WovenShapeError("schema_drift", "A communication row had no usable id.");
    const title = htmlText(row[COMMUNICATION_COLUMNS.title]);
    if (!title) throw new WovenShapeError("schema_drift", "A communication row had no title.");

    const status = resolveStatus(row[COMMUNICATION_COLUMNS.status], COMMUNICATION_STATUS, "communication");
    const audience = htmlText(row[COMMUNICATION_COLUMNS.audience]);
    if (audience && !TEAM_POSITION_AUDIENCE.test(audience) && !/^n\/?a$/i.test(audience)) {
      throw new WovenShapeError("schema_drift", "A communication row's audience was not in a verified form.");
    }
    rows.push({
      id,
      title,
      status: status.label,
      publication: status.publication,
      publicationReason: status.reason,
      audience: audience ? [audience] : null,
      visibleRange: htmlText(row[COMMUNICATION_COLUMNS.visibleRange]).slice(0, 80) || null,
      publishedOn: htmlText(row[COMMUNICATION_COLUMNS.publishedOn]).slice(0, 40) || null,
    });
  }
  assertUnique(
    rows.map((r) => r.id),
    "communication",
  );
  return rows;
}

export function communicationRecord(row: CommunicationRow): SourceRecord {
  return {
    source: "woven",
    contentType: "communication",
    entityId: row.id,
    title: row.title,
    status: row.status,
    publication: row.publication,
    publicationReason: row.publicationReason,
    audience: row.audience,
    version: null,
    versionId: null,
    updatedAt: null,
    documentIds: [],
    attachmentIds: [],
    contentFingerprint: null,
    sourceMetadata: { visibleRange: row.visibleRange, publishedOn: row.publishedOn },
    parts: [blockedPart("content", row.title, BCS_CAPABILITY.communicationDetail)],
  };
}
