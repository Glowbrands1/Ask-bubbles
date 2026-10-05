import type { ParsedReport } from "../types";

/**
 * ============================================================================
 * THE INGESTION CONTRACT
 * ============================================================================
 *
 * Every report family is stored the same way: the source file is kept
 * (private bucket, sha256-addressed, idempotent on `external_message_id`), an
 * ingestion row is opened, the family's facts are written, and the ingestion
 * is completed or failed. The generic tables (`report_sources`,
 * `report_files`, `report_periods`, `report_ingestions`) and RPCs
 * (`begin_report_ingestion`, `fail_report_ingestion`) are platform; a family
 * adds its own fact table and `complete_<family>_ingestion` RPC.
 */
export interface SourceFileRecord {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storagePath: string;
  storageBucket: string;
  externalMessageId: string | null;
  externalArchiveUrl: string | null;
  senderEmail?: string | null;
  receivedAt?: string | null;
  inboundEmailId?: string | null;
}

export type IngestionOutcome = "succeeded" | "already_ingested" | "failed";

export interface IngestionResult {
  outcome: IngestionOutcome;
  ingestionId: string;
  fileId: string;
  periodId: string | null;
  factCount: number;
  locationCount: number;
  fileCreated: boolean;
  failureReason: string | null;
}

export interface ReportingRepository<TReport extends ParsedReport = ParsedReport> {
  ingest(input: { sourceCode: string; file: SourceFileRecord; report: TReport }): Promise<IngestionResult>;
}

/** The private bucket report source files are kept in. */
export const REPORTING_BUCKET = "reporting-sources";
