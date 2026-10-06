import { WOVEN_TENANT } from "@/config/company/woven";
import { sameCompanyId } from "../config";
import { attr, elementsByTag, hasClass, parseHtmlDocument, textOf } from "../html";
import { WovenTeamError, safePath, type PageResponse, type WovenTeamClient } from "../http";
import { continueLoginSubmission, hasVerifiedChooser, type CompanySelector, type CompanyVerifier } from "../session";
import { CHOOSER_ENTRY_ATTRS, CHOOSER_ENTRY_CLASS } from "../web-app";
import { COMPANY_ID_INPUT, COMPANY_ID_LABEL, COMPANY_PAGE_PATH } from "./contract";

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
 *   2. BEFORE READING. `GET /Company` (VERIFIED_UI: it shows the Company ID)
 *      must show exactly the pinned id — every reading of it, none other —
 *      and the pinned name.
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

/** The ids `/Company` shows: after a "Company ID" label, and in any `CompanyID` input. Never `data-company-id`. */
export function companyIdsOnPage(html: string): string[] {
  const doc = parseHtmlDocument(html);
  const ids = new Set<string>();
  const body = elementsByTag(doc, "body")[0] ?? doc;
  for (const match of textOf(body).matchAll(COMPANY_ID_LABEL)) ids.add(match[1]!.toLowerCase());
  for (const input of elementsByTag(doc, "input")) {
    const named = COMPANY_ID_INPUT.test(attr(input, "name") ?? "") || COMPANY_ID_INPUT.test(attr(input, "id") ?? "");
    const value = (attr(input, "value") ?? "").trim().replace(/^\{|\}$/g, "");
    if (named && value) ids.add(value.toLowerCase());
  }
  return [...ids];
}

/** First eight characters of an id, for a message: enough to recognise, not the whole value. */
function shortId(id: string): string {
  return `${id.slice(0, 8).toUpperCase()}…`;
}

/** Normalised visible text, for the name check. */
function pageText(html: string): string {
  const doc = parseHtmlDocument(html);
  return textOf(elementsByTag(doc, "body")[0] ?? doc).replace(/\s+/g, " ").toLowerCase();
}

/**
 * Throws unless the `/Company` page shows EXACTLY the pinned Company ID —
 * every reading of it, none other — and the pinned company name. Missing,
 * different or conflicting ids, or a missing name: the run fails.
 */
export function assertCompanyPage(html: string): void {
  const { companyId, companyName } = WOVEN_TENANT;
  const ids = companyIdsOnPage(html);
  if (ids.length === 0) {
    throw new CompanyGuardError(
      "woven_company_not_verified",
      `Ask Bubbles could not find the Company ID on Woven's Company page, so it could not prove the session is in ${companyName}. Nothing was read.`,
    );
  }
  const others = ids.filter((id) => !sameCompanyId(id, companyId));
  if (others.length > 0) {
    throw new CompanyGuardError(
      "woven_company_mismatch",
      `Woven's session is not in ${companyName}: its Company page shows Company ID ${others.map(shortId).join(", ")}, not ${shortId(companyId)}. Nothing was synced.`,
    );
  }
  /*
   * The name must follow a "Company" label. Anywhere else would prove nothing:
   * the Switch Account list on every page names every company of the login.
   */
  const escaped = companyName.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\bcompany(?:\\s+name)?\\s*:?\\s*${escaped}\\b`).test(pageText(html))) {
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
