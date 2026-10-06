import "server-only";

import type { WovenTeamCredentials } from "./config";
import {
  CHOOSER_ENTRY_ATTRS,
  CHOOSER_ENTRY_CLASS,
  COMPANY_CHOOSER_TEXT,
  COMPANY_CHOOSER_TITLE,
  CONTINUE_LOGIN_FIELDS,
  CONTINUE_LOGIN_FORM_ID,
  CONTINUE_LOGIN_REQUIRED,
  DASHBOARD_PATH,
  DASHBOARD_TITLE,
  LOGIN_FIELDS,
  LOGIN_PAGE_PATH,
  LOGIN_SUBMIT_PATH,
  PROFILE_PHOTO_FIELDS,
  PROFILE_PHOTO_FORM_ID,
  PROFILE_PHOTO_SKIP_FIELD,
} from "./web-app";
import { attr, byId, elementsByTag, hasClass, parseHtmlDocument, textOf } from "./html";
import { hiddenInputValue, safePath, WovenTeamError, type PageResponse, type WovenTeamClient } from "./http";

/**
 * ============================================================================
 * THE WOVEN TEAM SESSION — invisible to administrators, isolated in code
 * ============================================================================
 *
 * VERIFIED STEPS:
 *   1. `GET /Login`, reading `__RequestVerificationToken` and the hidden
 *      `IsLocationLogin` / `SetTermsSignedDate` values from the form.
 *   2. `POST` that form with the integration account's
 *      `AuthenticationRequestUser` / `AuthenticationRequestPass`.
 *
 * THREE OUTCOMES OF STEP 2, told apart by what the page IS — never by the URL
 * alone, because the live account chooser is served at `/Login/Authenticate`:
 *
 *   A. the credential form again (a password field) or an HTTP error
 *        → `login_failed`. The only outcome that blames the password.
 *   B. the ACCOUNT CHOOSER ("Select account for login", verified live)
 *        → credentials accepted; the caller's selector chooses (below).
 *   C. the "Add Profile Photo" interstitial (verified live)
 *        → "Ask me later": the page's own form, SkipAddEmployeeProfileImage=true.
 *   D. anything else — normally the dashboard
 *        → the company check decides.
 *
 * CHOOSING THE COMPANY is the caller's `selector`; there is no default. Ask
 * Bubbles' only selector is `companyIdSelector` (`./bcs/company-guard.ts`):
 * the chooser entry whose `data-company-id` is the pinned Buff City Soap
 * Company ID, and nothing else. Nothing in this file chooses a company by
 * name, by position or by Woven's own default.
 *
 * THE COMPANY CHECK is the caller's `verifier`, and for Ask Bubbles the proof
 * is the `/Company` page's Company ID (`./bcs/company-guard.ts`).
 *
 * The session is re-established automatically when a read finds it expired;
 * see `BuffCitySoapWovenConnector.withSession` (`./bcs/connector.ts`).
 */

export interface CompanySelector {
  /** Given the chooser page, completes company selection and returns the page it lands on. */
  select(page: PageResponse, company: string, client: WovenTeamClient): Promise<PageResponse>;
}

function normalizeCompany(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Whether a page is the post-authentication account chooser. */
export function isAccountChooser(html: string): boolean {
  const doc = parseHtmlDocument(html);
  if (COMPANY_CHOOSER_TEXT.test(textOf(doc))) return true;
  const title = elementsByTag(doc, "title")[0];
  return title ? COMPANY_CHOOSER_TITLE.test(title.childNodes?.map((c) => c.value ?? "").join("") ?? "") : false;
}

/**
 * Whether a page is the credential form: it ASKS for a password — a visible
 * password box outside the profile-photo form. The photo interstitial carries
 * the credentials as fields of its own form and is not a sign-in failure.
 */
export function isCredentialForm(html: string): boolean {
  const doc = parseHtmlDocument(html);
  const photoForm = byId(doc, PROFILE_PHOTO_FORM_ID);
  return elementsByTag(doc, "input").some((input) => {
    if ((attr(input, "type") ?? "").toLowerCase() !== "password") return false;
    return !photoForm || !ancestors(input).includes(photoForm);
  });
}

/** Whether a page is the "Add Profile Photo" interstitial (verified: `#add-profile-image-form`). */
export function isProfilePhotoPrompt(html: string): boolean {
  const form = byId(parseHtmlDocument(html), PROFILE_PHOTO_FORM_ID);
  return form !== null && form.tagName === "form";
}

/**
 * The "Ask me later" submission, read from the page: exactly what
 * `ReturnToLogin()` sends — the form's own fields as rendered, with
 * `SkipAddEmployeeProfileImage=true`. Throws `profile_photo_prompt_changed`
 * when the form is not the verified one. No field VALUE ever reaches a
 * message: only field names do.
 */
export function profilePhotoSkip(html: string, pagePath: string): { path: string; fields: Record<string, string> } {
  const doc = parseHtmlDocument(html);
  const form = byId(doc, PROFILE_PHOTO_FORM_ID);
  const changed = (why: string) =>
    new WovenTeamError("profile_photo_prompt_changed", `Woven's "Add Profile Photo" page ${why}, so Ask Bubbles did not submit it.`, {
      path: safePath(pagePath),
    });
  if (!form || form.tagName !== "form") throw changed("no longer has its form");
  if ((attr(form, "method") ?? "get").toLowerCase() !== "post") throw changed("form is not a POST");
  const enctype = (attr(form, "enctype") ?? "application/x-www-form-urlencoded").toLowerCase();
  if (enctype !== "application/x-www-form-urlencoded") throw changed("form is not a plain form post");

  const target = new URL(attr(form, "action") || pagePath, new URL(pagePath, "https://placeholder.invalid"));
  if (target.pathname.toLowerCase() !== LOGIN_SUBMIT_PATH.toLowerCase()) throw changed("form posts somewhere other than /Login/Authenticate");

  const fields: Record<string, string> = {};
  for (const input of elementsByTag(form, "input")) {
    const name = attr(input, "name");
    const type = (attr(input, "type") ?? "text").toLowerCase();
    if (!name || ["file", "submit", "button", "image", "reset"].includes(type)) continue;
    if ((type === "checkbox" || type === "radio") && attr(input, "checked") === null) continue;
    fields[name] = attr(input, "value") ?? "";
  }
  const missing = PROFILE_PHOTO_FIELDS.filter((name) => !(name in fields));
  if (missing.length > 0) throw changed(`form is missing ${missing.join(", ")}`);
  if (!fields[LOGIN_FIELDS.antiForgery]) throw changed("form has no anti-forgery token");

  fields[PROFILE_PHOTO_SKIP_FIELD] = "true";
  return { path: target.pathname + target.search, fields };
}

type Element = ReturnType<typeof elementsByTag>[number];

function ancestors(el: Element): Element[] {
  const out: Element[] = [];
  for (let node = el.parentNode ?? null; node; node = node.parentNode ?? null) {
    if ((node as Element).tagName) out.push(node as Element);
  }
  return out;
}

export interface CompanyVerifier {
  /** The active company as the page shows it, or null when it cannot be confirmed. */
  activeCompany(page: PageResponse, expected: string): string | null;
}

export interface SessionOptions {
  credentials: WovenTeamCredentials;
  company: string;
  /** How the account chooser is answered. Required: there is no default company selection. */
  selector: CompanySelector;
  /** The post-sign-in check. Required: there is no default company check. */
  verifier: CompanyVerifier;
}

export interface EstablishedSession {
  companyLabel: string;
  companyVerified: true;
}

/**
 * THE VERIFIED CHOOSER SUBMISSION — what `SelectCompany(id, name, status, true)`
 * does, done without running the page's script:
 *
 *   1. find the one `a.select-company` whose `data-company-id` IS the pinned
 *      Company ID, and whose visible text is the company's name,
 *   2. read its `data-company-id` (and `data-company-name`),
 *   3. take `#continue-login-form` with every field as Woven rendered it,
 *   4. set `CompanyID` and `CompanyName`, and submit it as the form says.
 *
 * Every mismatch with the verified structure stops with
 * `account_chooser_changed` before anything is sent. Messages carry field
 * NAMES only.
 */
export function continueLoginSubmission(
  html: string,
  pagePath: string,
  /** The company's name: the chosen entry must show exactly this. */
  company: string,
  /** The company's id: the ONLY way an entry is chosen. */
  expectedCompanyId: string,
): { path: string; fields: Record<string, string> } {
  const doc = parseHtmlDocument(html);
  const changed = (why: string) =>
    new WovenTeamError("account_chooser_changed", `Woven's account chooser ${why}, so Ask Bubbles did not submit it.`, {
      path: safePath(pagePath),
    });

  const entries = elementsByTag(doc, "a").filter((a) => hasClass(a, CHOOSER_ENTRY_CLASS));
  const want = normalizeCompany(company);
  const wantId = expectedCompanyId.trim().toLowerCase();
  if (!wantId) throw changed("was not given a Company ID to choose");
  const matches = entries.filter((a) => (attr(a, CHOOSER_ENTRY_ATTRS.companyId) ?? "").trim().toLowerCase() === wantId);
  if (matches.length === 1 && normalizeCompany(textOf(matches[0]!)) !== want) {
    throw new WovenTeamError(
      "company_not_verified",
      `Woven's account chooser names the configured Company ID something other than ${company}, so Ask Bubbles did not choose it.`,
      { path: safePath(pagePath) },
    );
  }
  if (matches.length === 0) {
    throw new WovenTeamError("company_not_listed", `Woven accepted the sign-in, but ${company} is not one of the accounts it offers this login.`, {
      path: safePath(pagePath),
    });
  }
  if (matches.length > 1) throw changed(`lists ${company} ${matches.length} times`);
  const entry = matches[0]!;
  const companyId = (attr(entry, CHOOSER_ENTRY_ATTRS.companyId) ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,199}$/.test(companyId)) throw changed(`entry for ${company} has no usable ${CHOOSER_ENTRY_ATTRS.companyId}`);
  const companyName = attr(entry, CHOOSER_ENTRY_ATTRS.companyName) ?? "";

  const form = byId(doc, CONTINUE_LOGIN_FORM_ID);
  if (!form || form.tagName !== "form") throw changed(`has no #${CONTINUE_LOGIN_FORM_ID}`);
  if ((attr(form, "method") ?? "get").toLowerCase() !== "post") throw changed("form is not a POST");
  const enctype = (attr(form, "enctype") ?? "application/x-www-form-urlencoded").toLowerCase();
  if (enctype !== "application/x-www-form-urlencoded") throw changed("form is not a plain form post");
  const target = new URL(attr(form, "action") || pagePath, new URL(pagePath, "https://placeholder.invalid"));
  if (target.pathname.toLowerCase() !== LOGIN_SUBMIT_PATH.toLowerCase()) throw changed("form posts somewhere other than /Login/Authenticate");

  const fields: Record<string, string> = {};
  for (const input of elementsByTag(form, "input")) {
    const name = attr(input, "name");
    const type = (attr(input, "type") ?? "text").toLowerCase();
    if (!name || ["file", "submit", "button", "image", "reset"].includes(type)) continue;
    if ((type === "checkbox" || type === "radio") && attr(input, "checked") === null) continue;
    fields[name] = attr(input, "value") ?? "";
  }
  const missing = CONTINUE_LOGIN_REQUIRED.filter((name) => !(name in fields));
  if (missing.length > 0) throw changed(`form is missing ${missing.join(", ")}`);
  if (!fields[LOGIN_FIELDS.antiForgery]) throw changed("form has no anti-forgery token");

  fields[CONTINUE_LOGIN_FIELDS.companyId] = companyId;
  fields[CONTINUE_LOGIN_FIELDS.companyName] = companyName;
  return { path: target.pathname + target.search, fields };
}

/** Whether a chooser page has the verified structure (either half of it). */
export function hasVerifiedChooser(html: string): boolean {
  const doc = parseHtmlDocument(html);
  return byId(doc, CONTINUE_LOGIN_FORM_ID) !== null || elementsByTag(doc, "a").some((a) => hasClass(a, CHOOSER_ENTRY_CLASS));
}

/** Whether the authenticated app was reached: `/`, titled "Dashboard" (verified). */
export function isDashboard(page: PageResponse): boolean {
  const title = elementsByTag(parseHtmlDocument(page.text), "title")[0];
  const text = title ? (title.childNodes ?? []).map((c) => c.value ?? "").join("") : "";
  return safePath(page.path) === DASHBOARD_PATH && DASHBOARD_TITLE.test(text);
}

/** Reads the login form: its hidden values and where it posts. Throws `login_page_changed` if it is not the documented form. */
export function readLoginForm(html: string): { fields: Record<string, string>; action: string } {
  const doc = parseHtmlDocument(html);
  const actionPath = (value: string) => new URL(value, "https://placeholder.invalid").pathname.toLowerCase();
  const form = elementsByTag(doc, "form").find((f) => actionPath(attr(f, "action") ?? "") === LOGIN_SUBMIT_PATH.toLowerCase());
  const token = hiddenInputValue(doc, LOGIN_FIELDS.antiForgery);
  if (!form || !token) {
    throw new WovenTeamError("login_page_changed", "Woven's sign-in page no longer looks the way Ask Bubbles expects.", {
      path: LOGIN_PAGE_PATH,
    });
  }
  const fieldNames = new Set(elementsByTag(form, "input").map((i) => attr(i, "name")));
  if (!fieldNames.has(LOGIN_FIELDS.username) || !fieldNames.has(LOGIN_FIELDS.password)) {
    throw new WovenTeamError("login_page_changed", "Woven's sign-in form fields have changed.", { path: LOGIN_PAGE_PATH });
  }
  /* Post where the form posts (it may carry `?ReturnUrl=`), always on the Woven origin. */
  const target = new URL(attr(form, "action") ?? LOGIN_SUBMIT_PATH, "https://placeholder.invalid");
  return {
    fields: {
      [LOGIN_FIELDS.isLocationLogin]: hiddenInputValue(doc, LOGIN_FIELDS.isLocationLogin) ?? "",
      [LOGIN_FIELDS.setTermsSignedDate]: hiddenInputValue(doc, LOGIN_FIELDS.setTermsSignedDate) ?? "",
      [LOGIN_FIELDS.antiForgery]: token,
    },
    action: target.pathname + target.search,
  };
}

export async function establishSession(client: WovenTeamClient, options: SessionOptions): Promise<EstablishedSession> {
  client.jar.clear();
  client.pageToken = null;

  const loginPage = await client.request("GET", LOGIN_PAGE_PATH, null);
  if (loginPage.status !== 200) {
    throw new WovenTeamError("login_page_changed", `Woven's sign-in page answered HTTP ${loginPage.status}.`, {
      status: loginPage.status,
      path: LOGIN_PAGE_PATH,
    });
  }
  const form = readLoginForm(loginPage.text);

  let landing = await client.request("POST", form.action, {
    kind: "form",
    value: {
      [LOGIN_FIELDS.username]: options.credentials.username,
      [LOGIN_FIELDS.password]: options.credentials.password,
      ...form.fields,
    },
  });

  /*
   * THE STATES AFTER CREDENTIALS, handled in any order Woven presents them,
   * each at most once:
   *
   *   account chooser        → choose the configured company
   *   Add Profile Photo      → "Ask me later"
   *   the credential form    → login_failed if it is the first answer;
   *                            otherwise the step before it did not take
   *   anything else          → leave the loop; the company check decides
   *
   * The chooser and the photo page are both served at /Login/Authenticate
   * and both carry forms posting there, so they are recognised by what they
   * are, before the credential check.
   */
  let chose = false;
  let skippedPhoto = false;
  let previous: "credentials" | "chooser" | "photo" = "credentials";
  for (let step = 0; step < 4; step += 1) {
    if (landing.status >= 400) {
      if (previous === "credentials") {
        throw new WovenTeamError("login_failed", "Woven did not accept the integration account's sign-in. Check the Woven username and password.", {
          status: landing.status,
          path: LOGIN_SUBMIT_PATH,
        });
      }
      throw new WovenTeamError(
        previous === "photo" ? "profile_photo_prompt_failed" : "company_selection_unverified",
        `Woven answered HTTP ${landing.status} after Ask Bubbles ${previous === "photo" ? "skipped the profile-photo prompt" : `chose ${options.company}`}.`,
        { status: landing.status, path: safePath(landing.path) },
      );
    }

    if (isProfilePhotoPrompt(landing.text)) {
      if (skippedPhoto) {
        throw new WovenTeamError("profile_photo_prompt_failed", `Woven showed the "Add Profile Photo" page again after "Ask me later".`, {
          path: safePath(landing.path),
        });
      }
      const skip = profilePhotoSkip(landing.text, landing.path);
      landing = await client.request("POST", skip.path, { kind: "form", value: skip.fields });
      skippedPhoto = true;
      previous = "photo";
      continue;
    }

    if (isAccountChooser(landing.text)) {
      if (chose) {
        throw new WovenTeamError("company_selection_unverified", `Ask Bubbles chose ${options.company} on Woven's account chooser, but Woven showed the chooser again.`, {
          path: safePath(landing.path),
        });
      }
      landing = await options.selector.select(landing, options.company, client);
      chose = true;
      previous = "chooser";
      continue;
    }

    if (isCredentialForm(landing.text)) {
      if (previous === "credentials") {
        throw new WovenTeamError("login_failed", "Woven did not accept the integration account's sign-in. Check the Woven username and password.", {
          status: landing.status,
          path: LOGIN_SUBMIT_PATH,
        });
      }
      throw new WovenTeamError(
        previous === "photo" ? "profile_photo_prompt_failed" : "company_selection_unverified",
        previous === "photo"
          ? `Woven returned to the sign-in page after "Ask me later" on the profile-photo prompt.`
          : `Woven accepted the sign-in, but choosing ${options.company} returned to the sign-in page.`,
        { path: safePath(landing.path) },
      );
    }
    break;
  }

  if (!isDashboard(landing)) {
    throw new WovenTeamError(
      "dashboard_not_reached",
      `Ask Bubbles signed in to Woven but did not reach the Woven dashboard, so nothing was read.`,
      { path: safePath(landing.path) },
    );
  }
  const company = options.verifier.activeCompany(landing, options.company);
  if (!company) {
    throw new WovenTeamError(
      "company_not_verified",
      `Ask Bubbles signed in to Woven but could not confirm it is working in ${options.company}, so nothing was read.`,
      { path: safePath(landing.path) },
    );
  }
  return { companyLabel: company, companyVerified: true };
}
