import { SUPPORTED_KINDS, extensionOf, normalizeMimeType } from "@/lib/ingestion/validation";
import { PartFetchError, type FetchedFile } from "../types";

/**
 * Tenant-neutral helpers for reading Woven content: the shape error every
 * adapter throws, the plain-text document a page's text becomes, and the
 * checks a downloaded file must pass before it is indexed.
 */

/** A Woven response that does not have the verified shape: the listing fails, it is never read as empty. */
export class WovenShapeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WovenShapeError";
    this.code = code;
  }
}

/** A synced text document: the title, then the body. */
export function textDocument(title: string, body: string): Uint8Array {
  return new TextEncoder().encode(`${title.trim()}\n\n${body.trim()}\n`);
}

/** The leading bytes each indexable binary format must start with. */
const MAGIC: Record<string, readonly number[][]> = {
  pdf: [[0x25, 0x50, 0x44, 0x46]],
  docx: [[0x50, 0x4b, 0x03, 0x04]],
};

/**
 * A downloaded file's bytes must BE the file its name claims: a PDF starts
 * "%PDF", a Word document is a zip. An error or sign-in page served with a
 * file's name is refused here — per item, retryable — and never indexed.
 */
export function verifiedFile(file: FetchedFile): FetchedFile {
  const signatures = MAGIC[extensionOf(file.fileName)];
  if (signatures && !signatures.some((sig) => sig.every((b, i) => file.bytes[i] === b))) {
    throw new PartFetchError("woven_not_a_file", "Woven did not return the file for this item.", true);
  }
  return file;
}

/**
 * Settles the file name and MIME type Ask Bubbles' validator will accept, from
 * the extension first and the declared type second. A file Ask Bubbles cannot
 * index is a permanent, per-item outcome, not a retry.
 */
export function indexableFile(bytes: Uint8Array, fileName: string, declaredMime: string): FetchedFile {
  const ext = extensionOf(fileName);
  const mime = normalizeMimeType(declaredMime);
  const byExt = SUPPORTED_KINDS.find((k) => k.extensions.includes(ext));
  const byMime = SUPPORTED_KINDS.find((k) => k.mimeTypes.includes(mime));
  const kind = byExt ?? byMime;
  if (!kind) {
    throw new PartFetchError("unsupported_format", "This Woven file is not a format Ask Bubbles can read.", false);
  }
  if (bytes.byteLength === 0) throw new PartFetchError("empty_file", "Woven returned an empty file.", true);
  return {
    bytes,
    fileName: byExt ? fileName : `${fileName.replace(/\.[^.]*$/, "")}.${kind.extensions[0]}`,
    mimeType: kind.mimeTypes.includes(mime) ? mime : kind.mimeTypes[0]!,
  };
}
