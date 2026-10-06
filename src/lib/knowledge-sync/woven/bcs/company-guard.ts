import { sameCompanyId } from "../config";
import { attr, elementsByTag, hasClass, parseHtmlDocument, textOf } from "../html";
import { WovenTeamError, safePath, type PageResponse, type WovenTeamClient } from "../http";
import { continueLoginSubmission, hasVerifiedChooser, type CompanySelector, type CompanyVerifier } from "../session";
import { CHOOSER_ENTRY_ATTRS, CHOOSER_ENTRY_CLASS } from "../contract";
import { COMPANY_ID_INPUT, COMPANY_ID_LABEL, COMPANY_PAGE_PATH } from "./contract";

/**
 * ============================================================================
 * THE COMPANY GUARD — Midwest Soap Makers, proved by its Company ID
 * ============================================================================
 *
 * Woven keeps the active company in server-side session state: none of the
 * content requests carries a company id (VERIFIED). The same login can open
 * JB & Associates (Sun Tan City). So the sync proves WHICH company the session
 * is in, by id, at three points:
 *
 *   1. SIGN-IN. On the account chooser, the entry selected is the one whose
 *      `data-company-id` IS the configured id (and whose name is the
 *      configured name) — never chosen by name alone. (Chooser structure:
 *      VERIFIED for this same login by the reference platform.)
 *   2. BEFORE READING. `GET /Company` (VERIFIED_UI: it shows the Company ID)
 *      must show exactly the configured id — every reading of it, none other.
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

/** Throws unless the `/Company` page shows exactly the expected id. */
export function assertCompanyPage(html: string, expectedId: string, companyName: string): void {
  const ids = companyIdsOnPage(html);
  if (ids.length === 0) {
    throw new CompanyGuardError(
      "woven_company_not_verified",
      `Ask Bubbles could not find the Company ID on Woven's Company page, so it could not prove the session is in ${companyName}. Nothing was read.`,
    );
  }
  const others = ids.filter((id) => !sameCompanyId(id, expectedId));
  if (others.length > 0) {
    throw new CompanyGuardError(
      "woven_company_mismatch",
      `Woven's session is not in ${companyName}: its Company page shows Company ID ${others.map(shortId).join(", ")}, not ${shortId(expectedId)}. Nothing was synced.`,
    );
  }
}

/** Reads `/Company` with the session and proves the id. */
export async function verifyCompany(client: WovenTeamClient, expectedId: string, companyName: string): Promise<void> {
  assertCompanyPage(await client.getHtml(COMPANY_PAGE_PATH), expectedId, companyName);
}

/**
 * The account chooser, answered BY ID: the one `a.select-company` entry whose
 * `data-company-id` is the configured id. Its visible name must also be the
 * configured name, or nothing is submitted.
 */
export function companyIdSelector(companyId: string): CompanySelector {
  return {
    async select(page: PageResponse, company: string, client: WovenTeamClient) {
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
        throw new WovenTeamError("company_not_listed", `Woven accepted the sign-in, but ${company} (${shortId(companyId)}) is not one of the accounts it offers this login.`, {
          path: safePath(page.path),
        });
      }
      const submission = continueLoginSubmission(page.text, page.path, company, companyId);
      return client.request("POST", submission.path, { kind: "form", value: submission.fields });
    },
  };
}

/**
 * The dashboard check after sign-in. The account menu's text is NOT trusted as
 * the company for Buff City Soap (the handoff saw it show a location of the
 * other company); the `/Company` id check that follows is the proof.
 */
export const deferToCompanyPage: CompanyVerifier = {
  activeCompany: (_page, expected) => expected,
};

