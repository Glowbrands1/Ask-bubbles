import "server-only";

import { UPLOAD_LIMITS } from "@/lib/config/models";
import {
  PartFetchError,
  type ConnectionInfo,
  type ContentType,
  type FetchedFile,
  type KnowledgeSourceConnector,
  type ListingResult,
  type SourceRecord,
} from "../../types";
import { WOVEN_TENANT } from "@/config/company/woven";
import type { WovenTeamCredentials } from "../config";
import { HtmlShapeError } from "../html";
import { WovenTeamClient, WovenTeamError } from "../http";
import { establishSession } from "../session";
import { WovenShapeError, indexableFile, textDocument, verifiedFile } from "../shared";
import { communicationRecord, parseCommunicationRows } from "./adapters/communications";
import { fileLibraryRecord, parseFileLibraryRows } from "./adapters/file-library";
import { handbookRecord, parseHandbookRows } from "./adapters/handbooks";
import { parsePolicyCards, parsePolicyDetail, policyRecord } from "./adapters/policies";
import { parseProcedureCards, parseProcedureCategories, parseProcedureDetail, procedureRecord, procedureText, unionProcedureCards } from "./adapters/procedures";
import { CompanyGuardError, companyIdSelector, deferToCompanyPage, verifyCompany } from "./company-guard";
import {
  COMMUNICATION_LIST_BODY,
  COMMUNICATION_LIST_PATH,
  FILE_LIBRARY_LIST_BODY,
  FILE_LIBRARY_LIST_PATH,
  HANDBOOK_LIST_PATH,
  POLICY_LIST_BODY,
  POLICY_LIST_PATH,
  PROCEDURE_SEARCH_PATH,
  fileLibraryDownloadPath,
  policyDetailPath,
  procedureDetailPath,
  procedureSearchBody,
} from "./contract";

/**
 * ============================================================================
 * THE BUFF CITY SOAP WOVEN CONNECTOR
 * ============================================================================
 *
 *   Woven session (sign in; account chosen BY COMPANY ID)
 *        ↓
 *   company guard (`/Company` shows 55839F24-…; else nothing is read)
 *        ↓
 *   source adapters (Policies, Handbooks, Procedures, File Library, Communications)
 *        ↓
 *   publication / audience / ownership — in the engine's `reconcile`
 *        ↓
 *   normalize → SHA-256 change detection → Ask Bubbles ingestion (the engine)
 *
 * It implements the engine's `KnowledgeSourceConnector`, so the engine,
 * manifest, reconciliation, dry run and ingestion are Ask Bubbles' existing
 * ones. The transport (`WovenTeamClient`, Woven's internal web-app routes)
 * sits behind this class: an official Woven API, once verified for this
 * account, replaces the class without touching anything downstream.
 *
 * READ-ONLY. Only the reads in `./contract.ts`. No form is ever submitted
 * except the sign-in and account chooser.
 *
 * FAILS CLOSED, PER CONTENT TYPE. A login page, 401/403, anti-forgery
 * refusal, HTML where JSON was expected, a missing property, schema drift, an
 * unknown status, an incomplete procedure list — each fails THAT listing with
 * a code. The engine reconciles nothing for a failed listing and, while any
 * listing failed, removes nothing for being absent.
 */

/**
 * What the connector is given. There is NO company here: the connector reads
 * exactly one Woven company, `WOVEN_TENANT` (`src/config/company/woven.ts`),
 * and cannot be pointed at another.
 */
export interface BcsConnectorOptions {
  client: WovenTeamClient;
  credentials: WovenTeamCredentials;
  downloads: { fileLibrary: boolean };
  maxBytes?: number;
}

/** A connector-level failure with a `woven_` code the run ledger and admin screen understand. */
export class BcsConnectorError extends Error {
  readonly code: string;
  readonly sessionLost: boolean;
  constructor(code: string, message: string, sessionLost = false) {
    super(message);
    this.name = "BcsConnectorError";
    this.code = code;
    this.sessionLost = sessionLost;
  }
}

function codeOf(error: unknown): string {
  if (error instanceof BcsConnectorError || error instanceof CompanyGuardError) return error.code;
  if (error instanceof WovenTeamError || error instanceof WovenShapeError) return `woven_${error.code}`;
  if (error instanceof HtmlShapeError) return "woven_unexpected_shape";
  return "woven_unexpected";
}

function messageOf(error: unknown): string {
  if (
    error instanceof BcsConnectorError ||
    error instanceof CompanyGuardError ||
    error instanceof WovenTeamError ||
    error instanceof WovenShapeError ||
    error instanceof HtmlShapeError
  ) {
    return error.message;
  }
  return "Woven returned something Ask Bubbles did not expect.";
}

const NOT_RETRYABLE = new Set(["too_large", "download_host_not_allowed", "not_found"]);

export class BuffCitySoapWovenConnector implements KnowledgeSourceConnector {
  readonly source = "woven" as const;
  private readonly options: BcsConnectorOptions;
  private connection: ConnectionInfo | null = null;

  constructor(options: BcsConnectorOptions) {
    this.options = options;
  }

  get requestsMade(): number {
    return this.options.client.requestsMade;
  }

  /** Signs in (choosing the account by id) and proves the company. Throws on any doubt. */
  private async signIn(): Promise<ConnectionInfo> {
    const { client, credentials } = this.options;
    await establishSession(client, { credentials, company: WOVEN_TENANT.companyName, selector: companyIdSelector, verifier: deferToCompanyPage });
    await verifyCompany(client);
    return { companyLabel: WOVEN_TENANT.companyName, companyVerified: true, companyId: WOVEN_TENANT.companyId };
  }

  async connect(): Promise<ConnectionInfo> {
    this.connection = null;
    try {
      this.connection = await this.signIn();
      return this.connection;
    } catch (error) {
      throw new BcsConnectorError(codeOf(error), messageOf(error));
    }
  }

  /** The guard again: after the listings, before the engine reconciles or applies anything. */
  async assertTenant(): Promise<ConnectionInfo> {
    if (!this.connection) throw new BcsConnectorError("woven_not_connected", "Not signed in to Woven.");
    try {
      await this.withSession(() => verifyCompany(this.options.client));
      return this.connection;
    } catch (error) {
      this.connection = null;
      throw error instanceof BcsConnectorError ? error : new BcsConnectorError(codeOf(error), messageOf(error));
    }
  }

  /** Runs a read; if the session expired, signs in once more — company guard included — and repeats it. */
  private async withSession<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      if (!(error instanceof WovenTeamError) || error.code !== "session_expired") throw error;
      try {
        this.connection = await this.signIn();
      } catch (again) {
        this.connection = null;
        throw new BcsConnectorError(codeOf(again), messageOf(again), true);
      }
      return read();
    }
  }

  async list(contentType: ContentType): Promise<ListingResult> {
    if (!this.connection) return { ok: false, contentType, code: "woven_not_connected", message: "Not signed in to Woven." };
    try {
      const { records, diagnostics } = await this.read(contentType);
      return { ok: true, contentType, records, diagnostics };
    } catch (error) {
      return { ok: false, contentType, code: codeOf(error), message: messageOf(error) };
    }
  }

  private async read(contentType: ContentType): Promise<{ records: SourceRecord[]; diagnostics: Record<string, unknown> }> {
    const client = this.options.client;
    switch (contentType) {
      case "policy": {
        const cards = parsePolicyCards(await this.withSession(() => client.postJson(POLICY_LIST_PATH, POLICY_LIST_BODY)));
        /* Publication is unverified, so no policy is published and no detail page is needed to decide anything. */
        const records = cards.map(policyRecord);
        return { records, diagnostics: { cards: cards.length } };
      }
      case "handbook": {
        const rows = parseHandbookRows(await this.withSession(() => client.postJson(HANDBOOK_LIST_PATH, undefined)));
        /* Inventory only: the handbook download is not verified for this company, so each part is BLOCKED. */
        return { records: rows.map(handbookRecord), diagnostics: { rows: rows.length } };
      }
      case "procedure": {
        const categories = parseProcedureCategories(await this.withSession(() => client.postJson(PROCEDURE_SEARCH_PATH, procedureSearchBody([]))));
        const perCategory = [];
        for (const category of categories) {
          perCategory.push(parseProcedureCards(await this.withSession(() => client.postJson(PROCEDURE_SEARCH_PATH, procedureSearchBody([category.name]))), category));
        }
        const cards = unionProcedureCards(perCategory);
        const records: SourceRecord[] = [];
        let unpublished = 0;
        for (const card of cards) {
          if (card.unpublished) {
            unpublished += 1;
            records.push(procedureRecord(card, null));
            continue;
          }
          records.push(procedureRecord(card, await this.withSession(() => client.getHtml(procedureDetailPath(card.id)))));
        }
        return { records, diagnostics: { categories: categories.length, cards: cards.length, unpublished } };
      }
      case "file_library": {
        const rows = parseFileLibraryRows(await this.withSession(() => client.postJson(FILE_LIBRARY_LIST_PATH, FILE_LIBRARY_LIST_BODY)));
        const records = rows.map((row) => fileLibraryRecord(row, { downloadEnabled: this.options.downloads.fileLibrary }));
        const brand = rows.filter((r) => r.libraryLevel === "Brand").length;
        return { records, diagnostics: { rows: rows.length, brandLibrary: brand, accountLibrary: rows.length - brand } };
      }
      case "communication": {
        const rows = parseCommunicationRows(await this.withSession(() => client.postJson(COMMUNICATION_LIST_PATH, COMMUNICATION_LIST_BODY)));
        return { records: rows.map(communicationRecord), diagnostics: { rows: rows.length } };
      }
      case "knowledge_element":
      case "course":
        /* NOT_FOUND in this company's Woven navigation: never requested. */
        throw new BcsConnectorError("woven_not_available", "This Woven company has no such content.");
    }
  }

  /* ------------------------------------------------------------ parts -- */

  async fetchPart(item: Parameters<KnowledgeSourceConnector["fetchPart"]>[0]): Promise<FetchedFile> {
    try {
      if (item.partKey === "content" && item.contentType === "procedure") return await this.fetchProcedureText(item.locator, item.entityId, item.title);
      if (item.partKey === "content" && item.contentType === "policy") return await this.fetchPolicyText(item.locator, item.entityId, item.title);
      if (item.partKey === "file" && item.contentType === "file_library") return await this.fetchFileLibrary(item.locator, item.fileName, item.mimeType);
      throw new PartFetchError("capability_unavailable", "Ask Bubbles does not download this kind of Woven item for this company.", false);
    } catch (error) {
      if (error instanceof PartFetchError) throw error;
      if (error instanceof BcsConnectorError) throw new PartFetchError(error.code, error.message, true, { sessionLost: error.sessionLost });
      if (error instanceof WovenTeamError) {
        throw new PartFetchError(`woven_${error.code}`, error.message, !NOT_RETRYABLE.has(error.code), { sessionLost: error.sessionLost });
      }
      throw new PartFetchError(codeOf(error), messageOf(error), true);
    }
  }

  private maxBytes(): number {
    return this.options.maxBytes ?? UPLOAD_LIMITS.maxBytes;
  }

  private textFile(contentType: ContentType, entityId: string, title: string, body: string | null): FetchedFile {
    if (body === null) throw new PartFetchError("woven_unexpected_shape", "This Woven page no longer has the layout Ask Bubbles reads.", true);
    if (body.trim().length === 0) throw new PartFetchError("empty_file", "This Woven item has no text.", true);
    return { bytes: textDocument(title, body), fileName: `${contentType}-${entityId}.txt`, mimeType: "text/plain" };
  }

  private async fetchProcedureText(locator: Record<string, string>, entityId: string, title: string): Promise<FetchedFile> {
    if (!locator.procedureId) throw new PartFetchError("no_locator", "This procedure cannot be located.", false);
    const detail = parseProcedureDetail(await this.withSession(() => this.options.client.getHtml(procedureDetailPath(locator.procedureId!))));
    return this.textFile("procedure", entityId, title, detail.steps ? procedureText(detail.steps) : null);
  }

  private async fetchPolicyText(locator: Record<string, string>, entityId: string, title: string): Promise<FetchedFile> {
    if (!locator.policyId) throw new PartFetchError("no_locator", "This policy cannot be located.", false);
    const detail = parsePolicyDetail(await this.withSession(() => this.options.client.getHtml(policyDetailPath(locator.policyId!))), locator.policyId);
    return this.textFile("policy", entityId, title, detail.body);
  }

  /** Gated: reached only with WOVEN_BCS_FILE_LIBRARY_DOWNLOAD_ENABLED (parts are BLOCKED otherwise). */
  private async fetchFileLibrary(locator: Record<string, string>, fileName: string | null, mimeType: string | null): Promise<FetchedFile> {
    if (!this.options.downloads.fileLibrary) {
      throw new PartFetchError("file_library_download_unverified", "File Library downloads are switched off for this company.", false);
    }
    const { fileLibraryId } = locator;
    if (!fileLibraryId) throw new PartFetchError("no_locator", "This File Library item cannot be located.", false);
    const file = await this.withSession(() => this.options.client.downloadAuthenticated(fileLibraryDownloadPath(fileLibraryId), this.maxBytes()));
    return verifiedFile(indexableFile(file.bytes, fileName ?? file.fileName ?? `file-library-${fileLibraryId}.pdf`, mimeType ?? file.contentType));
  }
}
