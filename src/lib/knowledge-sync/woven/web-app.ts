/**
 * ============================================================================
 * THE WOVEN WEB APP — sign-in and transport, tenant-neutral
 * ============================================================================
 *
 * The names of Woven's own sign-in page, account chooser, profile-photo
 * interstitial and dashboard, and the storage hosts a download may come from.
 * They belong to the Woven web app itself, not to any company in it: nothing
 * here names, defaults to or selects a company. WHICH company Ask Bubbles
 * signs in to is decided in exactly one place — `WOVEN_TENANT` in
 * `src/config/company/woven.ts` (Buff City Soap / Midwest Soap Makers) — and
 * proved by `./bcs/company-guard.ts`.
 *
 * EVIDENCE. These steps were captured in the same Woven web app with the same
 * integration login by the reference platform (whose implementation Ask
 * Bubbles was ported from). The Buff City Soap handoff confirms the
 * unauthenticated redirect to `/Login` and the Switch Account chooser; the
 * rest is re-checked on every run — any deviation fails the sign-in with a
 * named code, never a guess.
 *
 * Content routes are NOT here: Buff City Soap's are in `./bcs/contract.ts`.
 */

/** The Woven web app's origin. Fixed: there is no configurable alternative. */
export const WOVEN_WEB_APP_ORIGIN = "https://app.woven.team";

/* ------------------------------------------------------ authentication -- */

/** VERIFIED: `GET /Login` returns the login form. */
export const LOGIN_PAGE_PATH = "/Login";
/** VERIFIED: the form posts here, `application/x-www-form-urlencoded`. */
export const LOGIN_SUBMIT_PATH = "/Login/Authenticate";
/** VERIFIED: form field names. */
export const LOGIN_FIELDS = {
  username: "AuthenticationRequestUser",
  password: "AuthenticationRequestPass",
  isLocationLogin: "IsLocationLogin",
  setTermsSignedDate: "SetTermsSignedDate",
  antiForgery: "__RequestVerificationToken",
} as const;

/**
 * VERIFIED: signs of a login page. Any authenticated read that answers with
 * one of these is an expired session, never "no content".
 */
export const LOGIN_PATH_PREFIXES = ["/login"];
export const LOGIN_FORM_MARKER = /action\s*=\s*["']\/Login\/Authenticate["']/i;


/**
 * VERIFIED (live Production test, 29 Sept 2026): with correct credentials,
 * `POST /Login/Authenticate` answers 200 at `/Login/Authenticate?ReturnUrl=%2F`
 * with the ACCOUNT CHOOSER, not a login error. Its visible heading is "Select
 * account for login" (the tab title reads "Select Company"), with a searchable
 * "Account" table listing every company the login belongs to. The
 * credentials were accepted: this is never `login_failed`.
 *
 * VERIFIED (browser evidence, 29 Sept 2026): how a chooser row submits.
 * Each account is `<a class="select-company" href="javascript:void(0)"
 * data-company-id="<uuid>" data-company-name="" data-account-status="1">`. A
 * delegated click handler reads those three attributes and calls
 * `SelectCompany(id, name, status, true)`, which sets `CompanyID` and
 * `CompanyName` on `#continue-login-form` and submits it natively: POST
 * `/Login/Authenticate`, `application/x-www-form-urlencoded`, with
 * `AuthenticationRequestUser`, `AuthenticationRequestPass`, `ReturnUrl`,
 * `CompanyID`, `CompanyName` and `__RequestVerificationToken`. The session
 * does exactly that, reading the id from the entry every time. (The Switch
 * Account route `/Account/_Change_EmployeeCompany` is NOT this flow.)
 */
export const CHOOSER_ENTRY_CLASS = "select-company";
export const CHOOSER_ENTRY_ATTRS = {
  companyId: "data-company-id",
  companyName: "data-company-name",
  accountStatus: "data-account-status",
} as const;
export const CONTINUE_LOGIN_FORM_ID = "continue-login-form";
export const CONTINUE_LOGIN_FIELDS = {
  companyId: "CompanyID",
  companyName: "CompanyName",
  returnUrl: "ReturnUrl",
} as const;
export const CONTINUE_LOGIN_REQUIRED = [
  "AuthenticationRequestUser",
  "AuthenticationRequestPass",
  "ReturnUrl",
  "CompanyID",
  "CompanyName",
  "__RequestVerificationToken",
] as const;

/**
 * VERIFIED: a completed sign-in lands on `/`, titled "Dashboard", with the
 * account dropdown (`a.dropdown-toggle`) showing the active company.
 */
export const DASHBOARD_PATH = "/";
export const DASHBOARD_TITLE = /^\s*dashboard\b/i;
export const COMPANY_CHOOSER_TEXT = /select\s+(?:company|account\s+for\s+login)/i;
export const COMPANY_CHOOSER_TITLE = /select\s+(?:company|account)/i;

/**
 * VERIFIED (live, 29 Sept 2026): Woven may answer at `/Login/Authenticate`
 * with an "Add Profile Photo" interstitial. Its "Ask me later" link
 * (`onclick="blur(); ReturnToLogin(); return false;"`) sets
 * `SkipAddEmployeeProfileImage=true` and submits `#add-profile-image-form`:
 * POST `/Login/Authenticate`, `application/x-www-form-urlencoded`, with the
 * fields below, values as the page rendered them. The separate "Don't ask me
 * again" preference is never used: skipping changes nothing in Woven.
 */
export const PROFILE_PHOTO_FORM_ID = "add-profile-image-form";
export const PROFILE_PHOTO_SKIP_FIELD = "SkipAddEmployeeProfileImage";
export const PROFILE_PHOTO_FIELDS = [
  "AuthenticationRequestUser",
  "AuthenticationRequestPass",
  "EmployeeID",
  "CompanyID",
  PROFILE_PHOTO_SKIP_FIELD,
  "__RequestVerificationToken",
] as const;

/**
 * UNVERIFIED: whether list POSTs need an anti-forgery HEADER in addition to
 * the session cookie. Null sends none. If Woven turns out to require one, set
 * the header name here and the client sends the page's
 * `__RequestVerificationToken` value with every POST.
 */
export const ANTIFORGERY_HEADER: string | null = null;

/** Recognised in error pages, so an anti-forgery refusal is named as such. */
export const ANTIFORGERY_ERROR_MARKER = /anti-?forgery|RequestVerificationToken/i;

/**
 * Temporary signed storage URLs are fetched only from these hosts, over HTTPS,
 * WITHOUT the Woven session cookie, and never stored or logged.
 */
export const DOWNLOAD_HOST_PATTERN = /^[a-z0-9-]+\.blob\.core\.windows\.net$/i;
