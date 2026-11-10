import { UPLOAD_LIMITS } from "@/lib/config/models";
import { wovenLargerFilesEnabled } from "@/lib/config/chat-quality-flags";

/**
 * ============================================================================
 * LARGER FILES FROM THE WOVEN SYNC (WOVEN_LARGER_FILES_ENABLED, default off)
 * ============================================================================
 *
 * QA, 10 Nov 2026: "Local Grassroots Marketing Playbook" and "Soap Troubleshooting & Quality Control" stop every sync
 * with "The file is larger than Ask Bubbles' upload limit." (woven_too_large): Woven declares them over the 50 MB upload
 * cap, and their real sizes were recorded nowhere. Pau's project is on a plan whose storage can take larger files.
 *
 * With the flag on, a file the SYNC downloads may be up to `LARGER_SYNCED_FILE_MAX_BYTES` (a manager's upload keeps the
 * 50 MB cap), and a file still over it is reported with its size ("…is 73.4 MB; the limit is 200 MB.") so the next sync
 * says what it found. The storage bucket's own `file_size_limit` must be raised to the same number before the flag is
 * switched on (QA's release step), or the store refuses the file. Extraction needs the whole file in memory, so a
 * larger cap needs that memory in the sync's function; 200 MB fits the default.
 */
export const LARGER_SYNCED_FILE_MAX_BYTES = 200 * 1024 * 1024;

/** The most a Woven-synced file may be: the larger cap with the flag on, the upload cap otherwise. */
export function syncedFileMaxBytes(): number {
  return wovenLargerFilesEnabled() ? LARGER_SYNCED_FILE_MAX_BYTES : UPLOAD_LIMITS.maxBytes;
}

/** "73.4" for 76,960,000 bytes: megabytes to one decimal. */
export function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
}
