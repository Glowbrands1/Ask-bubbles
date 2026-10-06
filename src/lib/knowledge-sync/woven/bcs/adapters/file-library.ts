import { SUPPORTED_KINDS } from "@/lib/ingestion/validation";
import type { SourcePart, SourceRecord } from "../../../types";
import { htmlText } from "../../html";
import { BCS_CAPABILITY, FILE_LIBRARY_COLUMNS, FILE_LIBRARY_LEVELS, FILE_LIBRARY_STATUS, PUBLIC_AUDIENCE, TEAM_POSITION_AUDIENCE } from "../contract";
import { WovenShapeError, assertUnique, badgeLabels, digest, keyedCell, requireColumns, requireList, resolveStatus, ticksToIso, validId } from "./shared";

/**
 * ============================================================================
 * FILE LIBRARY — `POST /FileLibrary/_FileLibrary_Management_List_ForDataTable`
 * ============================================================================
 *
 * VERIFIED for Buff City Soap: the whole collection in one response (264
 * rows), its column mapping from a sample row, status keys 1 Unpublished /
 * 2 Published, Brand/Account library levels and team/position audiences.
 *
 * THE MAPPING IS PROVED ON EVERY ROW, because the UI's header order differs
 * from the JSON's columns: the status must be a verified key/label pair, the
 * updated cell must carry .NET ticks, the library must be Brand or Account and
 * the audience must read as an audience. Any row that does not is schema
 * drift, and the listing fails — it is never read with shifted columns.
 *
 * DOWNLOAD UNVERIFIED. The route is known from page script, but its response
 * was never observed, and it may log a download in Woven's engagement data.
 * Off (default), every file part is BLOCKED (`file_library_download_unverified`)
 * — still inventoried, and reported by the dry run as "would download".
 */

export interface FileLibraryRow {
  id: string;
  title: string;
  extension: string | null;
  status: string;
  publication: SourceRecord["publication"];
  publicationReason: string | null;
  audience: string[];
  sizeMb: string | null;
  updatedAt: string;
  tags: string[];
  libraryLevel: (typeof FILE_LIBRARY_LEVELS)[number];
}

const AUDIENCE_SHAPES = [TEAM_POSITION_AUDIENCE, PUBLIC_AUDIENCE, /^n\/?a$/i];

export function parseFileLibraryRows(body: unknown): FileLibraryRow[] {
  const rows: FileLibraryRow[] = [];
  const columns = Object.values(FILE_LIBRARY_COLUMNS).filter((c) => c !== FILE_LIBRARY_COLUMNS.id);
  for (const row of requireList(body, "File Library")) {
    requireColumns(row, columns, "File Library");
    const id = validId(row[FILE_LIBRARY_COLUMNS.id]);
    if (!id) throw new WovenShapeError("schema_drift", "A File Library row had no usable id.");

    const title = htmlText(row[FILE_LIBRARY_COLUMNS.title]);
    if (!title) throw new WovenShapeError("schema_drift", "A File Library row had no title.");

    const status = resolveStatus(row[FILE_LIBRARY_COLUMNS.status], FILE_LIBRARY_STATUS, "File Library");

    const updated = keyedCell(row[FILE_LIBRARY_COLUMNS.updated]);
    const updatedAt = updated.key ? ticksToIso(updated.key) : null;
    if (!updatedAt) throw new WovenShapeError("schema_drift", "A File Library row's updated date was not in the verified form.");

    const library = htmlText(row[FILE_LIBRARY_COLUMNS.library]);
    const libraryLevel = FILE_LIBRARY_LEVELS.find((l) => l.toLowerCase() === library.toLowerCase());
    if (!libraryLevel) throw new WovenShapeError("schema_drift", "A File Library row's library was neither Brand nor Account.");

    const audience = htmlText(row[FILE_LIBRARY_COLUMNS.audience]);
    if (!AUDIENCE_SHAPES.some((shape) => shape.test(audience))) {
      throw new WovenShapeError("schema_drift", "A File Library row's audience was not in a verified form.");
    }

    /* The type cell's hidden text ("Document-.pdf") is a hint, not the file's name. */
    const type = keyedCell(row[FILE_LIBRARY_COLUMNS.type]);
    const extension = /\.([A-Za-z0-9]{2,5})\s*$/.exec(type.key ?? type.label)?.[1]?.toLowerCase() ?? null;

    rows.push({
      id,
      title,
      extension,
      status: status.label,
      publication: status.publication,
      publicationReason: status.reason,
      audience: [audience],
      sizeMb: htmlText(row[FILE_LIBRARY_COLUMNS.size]) || null,
      updatedAt,
      tags: badgeLabels(row[FILE_LIBRARY_COLUMNS.tags]),
      libraryLevel,
    });
  }
  assertUnique(
    rows.map((r) => r.id),
    "File Library",
  );
  return rows;
}

/** The kinds Ask Bubbles' pipeline indexes, by extension. */
function indexableKind(extension: string | null) {
  return extension ? SUPPORTED_KINDS.find((k) => k.extensions.includes(extension)) : undefined;
}

export function fileLibraryRecord(row: FileLibraryRow, options: { downloadEnabled: boolean }): SourceRecord {
  const kind = indexableKind(row.extension);
  const fileName = kind ? (/\.[A-Za-z0-9]{2,5}$/.test(row.title) ? row.title : `${row.title}.${row.extension}`) : null;
  const base = { partKey: "file", title: row.title, fileName, documentId: row.id, versionId: null, sizeBytes: null };
  const part: SourcePart = !kind
    ? { ...base, mimeType: null, retrieval: { kind: "unsupported_format", detail: row.extension ?? "unknown" } }
    : options.downloadEnabled
      ? { ...base, mimeType: kind.mimeTypes[0]!, retrieval: { kind: "available", locator: { fileLibraryId: row.id } } }
      : { ...base, mimeType: kind.mimeTypes[0]!, retrieval: { kind: "blocked", capability: BCS_CAPABILITY.fileLibraryDownload } };
  return {
    source: "woven",
    contentType: "file_library",
    entityId: row.id,
    title: row.title,
    status: row.status,
    publication: row.publication,
    publicationReason: row.publicationReason,
    audience: row.audience,
    version: null,
    versionId: null,
    updatedAt: row.updatedAt,
    documentIds: [row.id],
    attachmentIds: [],
    /* Woven's own UpdatedOn ticks are in `updatedAt`; size and type complete the change evidence. */
    contentFingerprint: digest(`${row.extension ?? ""}|${row.sizeMb ?? ""}`),
    sourceMetadata: {
      libraryLevel: row.libraryLevel,
      extension: row.extension,
      sizeMb: row.sizeMb,
      tags: row.tags.join(", ").slice(0, 300) || null,
    },
    parts: [part],
  };
}
