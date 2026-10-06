import { WOVEN_TENANT } from "@/config/company/woven";
import { sameCompanyId } from "../config";
import { attr, elementsByTag, hasClass, parseHtmlDocument, textOf } from "../html";
import { WovenTeamError, safePath, type PageResponse, type WovenTeamClient } from "../http";
import { continueLoginSubmission, hasVerifiedChooser, type CompanySelector, type CompanyVerifier } from "../session";
import { CHOOSER_ENTRY_ATTRS, CHOOSER_ENTRY_CLASS } from "../web-app";
import {
  COMPANY_ID_INPUT,
  COMPANY_ID_LABEL,
  COMPANY_PAGE_PATH,
  GUID,
  MIN_INDEPENDENT_COMPANY_READINGS,
  SESSION_COMPANY_CONFLICT_ONLY,
  SESSION_COMPANY_NAME,
  SESSION_COMPANY_READINGS,
} from "./contract";

/**
 * ============================================================================
 * THE COMPANY GUARD — Midwest Soap Makers, proved by its Company ID
 * ============================================================================
 *
 * Woven keeps the active company in server-side session state: none of the
 * content requests carries a company id (VERIFIED), and the integration login
 * can open other Woven companies. So the sync proves WHICH company the session
 * is in — the pinned `WOVEN_TENANT` — by id, at three points:
 *
 *   1. SIGN-IN. On the account chooser, the entry selected is the one whose
 *      `data-company-id` IS the pinned id (and whose name is the pinned
 *      name) — never chosen by name, position or Woven's default.
 *   2. BEFORE READING. `GET /Company` must name exactly the pinned id in at
 *      least two independent session-detail readings (VERIFIED_LIVE — see
 *      `SESSION_COMPANY_READINGS`), no reading may name another, and the
 *      session's company name must be the pinned name.
 *   3. AFTER READING, BEFORE ANYTHING IS APPLIED, and after every automatic
 *      re-sign-in: the same check again (`assertTenant`).
 *
 * Any doubt is a failure: an id that cannot be found, two different ids, an
 * id that differs, a sign-in page. The sync never continues "probably" in the
 * right company.
 */

export class CompanyGuardError extends Error {
  readonly code: "woven_company_mismatch" | "woven_company_not_verified";
  constructor(code: CompanyGuardError["code"], message: string) {
    super(message);
    this.name = "CompanyGuardError";
    this.code = code;
  }
}

export interface CompanyReading {
  /** Which independent place on the page it came from. */
  readonly kind: string;
  /** Lower-cased GUID. */
  readonly id: string;
}

export interface CompanyPageReadings {
  /** Readings that may PROVE the active company (all must agree). */
  readonly proofs: readonly CompanyReading[];
  /** Readings that may only CONFLICT: a different id here fails, a matching one proves nothing. */
  readonly conflictOnly: readonly CompanyReading[];
  /** The active company's name, as the session's context object states it. */
  readonly names: readonly string[];
}

const lastGuid = (match: RegExpMatchArray): string | null => {
  for (let i = match.length - 1; i > 0; i -= 1) {
    const group = match[i];
    if (group && GUID.test(group)) return group.toLowerCase();
  }
  return null;
};

const decodeEntities = (value: string): string =>
  value.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();

/**
 * Every reading of the ACTIVE company on the `/Company` response.
 *
 * The session-detail readings (`SESSION_COMPANY_READINGS`, verified live)
 * come from the page's own description of its session; the "Company ID"
 * label and `CompanyID` input are kept as further readings. NEVER read:
 * `data-company-id` (the Switch Account list carries every company of the
 * login).
 */
export function companyReadingsOnPage(html: string): CompanyPageReadings {
  const proofs: CompanyReading[] = [];
  for (const { kind, pattern } of SESSION_COMPANY_READINGS) {
    for (const match of html.matchAll(pattern)) {
      const id = lastGuid(match);
      if (id) proofs.push({ kind, id });
    }
  }

  const doc = parseHtmlDocument(html);
  const body = elementsByTag(doc, "body")[0] ?? doc;
  for (const match of textOf(body).matchAll(COMPANY_ID_LABEL)) proofs.push({ kind: "label", id: match[1]!.toLowerCase() });
  for (const input of elementsByTag(doc, "input")) {
    const named = COMPANY_ID_INPUT.test(attr(input, "name") ?? "") || COMPANY_ID_INPUT.test(attr(input, "id") ?? "");
    const value = (attr(input, "value") ?? "").trim().replace(/^\{|\}$/g, "");
    if (named && value) proofs.push({ kind: "input", id: value.toLowerCase() });
  }

  const conflictOnly: CompanyReading[] = [];
  for (const match of html.matchAll(SESSION_COMPANY_CONFLICT_ONLY)) {
    const id = lastGuid(match);
    if (id) conflictOnly.push({ kind: "chat_initialiser", id });
  }

  const names = [...html.matchAll(SESSION_COMPANY_NAME)].map((match) => decodeEntities(match[2]!));
  return { proofs, conflictOnly, names };
}

/** The distinct ids the page's readings name — proofs and conflict-only alike. Never `data-company-id`. */
export function companyIdsOnPage(html: string): string[] {
  const { proofs, conflictOnly } = companyReadingsOnPage(html);
  return [...new Set([...proofs, ...conflictOnly].map((reading) => reading.id))];
}

/** First eight characters of an id, for a message: enough to recognise, not the whole value. */
function shortId(id: string): string {
  return `${id.slice(0, 8).toUpperCase()}…`;
}

/** Normalised visible text, for the legacy name check. */
function pageText(html: string): string {
  const doc = parseHtmlDocument(html);
  return textOf(elementsByTag(doc, "body")[0] ?? doc).replace(/\s+/g, " ").toLowerCase();
}

/**
 * Throws unless the `/Company` response proves the pinned company:
 *
 *   1. at least one reading of the active company exists;
 *   2. EVERY reading — proof or conflict-only — names the pinned Company ID;
 *   3. at least `MIN_INDEPENDENT_COMPANY_READINGS` DIFFERENT KINDS of proof
 *      agree on it (one place on the page is not proof);
 *   4. the active company's name is the pinned name: every `companyName`
 *      the session states equals it, and at least one name reading exists.
 *
 * Anything else — no reading, a different or second id, too few kinds, a
 * missing or different name — fails the run before anything is read.
 */
export function assertCompanyPage(html: string): void {
  const { companyId, companyName } = WOVEN_TENANT;
  const { proofs, conflictOnly, names } = companyReadingsOnPage(html);

  if (proofs.length === 0) {
    throw new CompanyGuardError(
      "woven_company_not_verified",
      `Ask Bubbles could not find the Company ID on Woven's Company page, so it could not prove the session is in ${companyName}. Nothing was read.`,
    );
  }
  const others = [...new Set([...proofs, ...conflictOnly].map((r) => r.id).filter((id) => !sameCompanyId(id, companyId)))];
  if (others.length > 0) {
    throw new CompanyGuardError(
      "woven_company_mismatch",
      `Woven's session is not in ${companyName}: its Company page shows Company ID ${others.map(shortId).join(", ")}, not ${shortId(companyId)}. Nothing was synced.`,
    );
  }
  const kinds = new Set(proofs.map((r) => r.kind));
  if (kinds.size < MIN_INDEPENDENT_COMPANY_READINGS) {
    throw new CompanyGuardError(
      "woven_company_not_verified",
      `Woven's Company page names ${shortId(companyId)} in only ${kinds.size} place, so Ask Bubbles could not prove the session is in ${companyName}. Nothing was read.`,
    );
  }

  /*
   * THE NAME. The session's own `companyName` when it states one — and every
   * one it states must be the pinned name. Otherwise the name must follow a
   * "Company" label. Anywhere else would prove nothing: the Switch Account
   * list on every page names every company of the login.
   */
  const pinnedName = companyName.toLowerCase();
  if (names.some((name) => name.toLowerCase() !== pinnedName)) {
    throw new CompanyGuardError(
      "woven_company_not_verified",
      `Woven's Company page shows the right Company ID under another company name, so Ask Bubbles did not proceed.`,
    );
  }
  const escaped = pinnedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelled = new RegExp(`\\bcompany(?:\\s+name)?\\s*:?\\s*${escaped}\\b`).test(pageText(html));
  if (names.length === 0 && !labelled) {
    throw new CompanyGuardError(
      "woven_company_not_verified",
      `Woven's Company page shows the right Company ID but not the name ${companyName}, so Ask Bubbles did not proceed.`,
    );
  }
}

/** Reads `/Company` with the session and proves the pinned company. */
export async function verifyCompany(client: WovenTeamClient): Promise<void> {
  assertCompanyPage(await client.getHtml(COMPANY_PAGE_PATH));
}

/**
 * The account chooser, answered BY THE PINNED ID: the one `a.select-company`
 * entry whose `data-company-id` is `WOVEN_TENANT.companyId`. Its visible name
 * must also be `WOVEN_TENANT.companyName`, or nothing is submitted. There is
 * no other selector, no name-based choice and no fallback to another entry.
 */
export const companyIdSelector: CompanySelector = {
  async select(page: PageResponse, _company: string, client: WovenTeamClient) {
    const { companyId, companyName } = WOVEN_TENANT;
    if (!hasVerifiedChooser(page.text)) {
      throw new WovenTeamError(
        "company_selection_unverified",
        "Woven showed an account chooser Ask Bubbles does not recognise, so no account was chosen.",
        { path: safePath(page.path) },
      );
    }
    const entries = elementsByTag(parseHtmlDocument(page.text), "a").filter(
      (a) => hasClass(a, CHOOSER_ENTRY_CLASS) && sameCompanyId(attr(a, CHOOSER_ENTRY_ATTRS.companyId) ?? "", companyId),
    );
    if (entries.length === 0) {
      throw new WovenTeamError("company_not_listed", `Woven accepted the sign-in, but ${companyName} (${shortId(companyId)}) is not one of the accounts it offers this login.`, {
        path: safePath(page.path),
      });
    }
    const submission = continueLoginSubmission(page.text, page.path, companyName, companyId);
    return client.request("POST", submission.path, { kind: "form", value: submission.fields });
  },
};

/**
 * The dashboard check after sign-in. The account menu's text is NOT trusted as
 * the company (the handoff saw it show a location of another company); the
 * `/Company` check that follows is the proof.
 */
export const deferToCompanyPage: CompanyVerifier = {
  activeCompany: (_page, expected) => expected,
};
