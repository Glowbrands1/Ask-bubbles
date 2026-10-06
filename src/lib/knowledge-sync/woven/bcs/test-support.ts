/**
 * ============================================================================
 * A FAKE BUFF CITY SOAP WOVEN — the BCS handoff's shapes, served over a fake fetch
 * ============================================================================
 *
 * SANITIZED. Every response follows a shape recorded in
 * `woven-buff-city-soap-ask-bubbles-handoff.json`; ids are invented
 * (`bcsId(n)`), apart from the Midwest Soap Makers Company ID, which is the
 * pinned, non-secret tenant id. No cookie, token, password or signed URL from
 * a real session appears anywhere. Titles are invented, except the three the
 * handoff flags as possibly JB & Associates content, which the ownership hold
 * is tested against.
 *
 * THE SAME LOGIN OPENS TWO COMPANIES, as in life: Midwest Soap Makers and a
 * fake "JB & Associates" with its own, different content. Woven's content
 * requests carry no company id, so every list answers for whichever company
 * the session is in — exactly the hazard the company guard exists for.
 *
 * READ-ONLY CHECK: every request is logged; `writes()` returns any request to
 * a path that is not a verified read or the sign-in, which tests assert empty.
 */

import { WOVEN_TENANT } from "@/config/company/woven";

export const BCS_COMPANY_ID = WOVEN_TENANT.companyId;
export const BCS_COMPANY = WOVEN_TENANT.companyName;
/** Invented: the other company on the same login. */
export const JBA_COMPANY_ID = "1BA00000-0000-4000-8000-0000000000AA";
export const JBA_COMPANY = "JB & Associates";
/** Invented: a third company the login could be offered, known to nobody. */
export const UNKNOWN_COMPANY_ID = "0aaa0000-0000-4000-8000-0000000000bb";
export const UNKNOWN_COMPANY = "Unknown Example Co";
export const USERNAME = "ask-bubbles-integration@example.test";
export const PASSWORD = "fixture-password-not-real";

export function bcsId(n: number): string {
  return `0bc50000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** .NET ticks for an ISO instant (what the File Library's Updated cell hides). */
export function ticks(iso: string): string {
  return (BigInt(Date.parse(iso)) * BigInt(10000) + BigInt("621355968000000000")).toString();
}

export interface FakePolicyCard {
  id: string;
  title: string;
  version: number;
  updated: string;
  body: string;
}

export interface FakeHandbookRow {
  id: string;
  name: string;
  statusKey: string;
  statusLabel: string;
  audience: string;
  updated: string;
}

export interface FakeProcedure {
  id: string;
  title: string;
  categories: string[];
  badges: string[];
  /** "All Positions" or a comma-separated list. Null: no position line. */
  positions: string | null;
  steps: { id: string; text: string }[];
}

export interface FakeCompanyContent {
  policies: FakePolicyCard[];
  handbooks: FakeHandbookRow[];
  procedures: FakeProcedure[];
  fileLibrary: Record<string, string>[];
  communications: Record<string, string>[];
}

/**
 * An audience cell as the live diagnostic found it (2026-10-06): a
 * team/position audience is two badges ("All Teams" + "3 Positions"); "N/A"
 * and "Public" are one badge each.
 */
export function audienceBadges(audience: string): string {
  const m = /^((?:all|\d+)\s+teams?)\s+((?:all|\d+)\s+positions?)$/i.exec(audience);
  if (m) return `<span class="badge badge-sm">${m[1]}</span><span class="badge badge-sm badge-light-blue-primary">${m[2]}</span>`;
  if (/^n\/?a$/i.test(audience)) return `<span class="badge badge-sm badge-primary-50">${audience}</span>`;
  return `<span class="badge badge-sm">${audience}</span>`;
}

/** A status cell as the live diagnostic found it: hidden key, then a badge with an icon. */
function statusBadge(key: string, label: string): string {
  const published = /^published$/i.test(label);
  const icon = /draft|unpublished/i.test(label) ? "fa-pen-to-square" : "fa-check";
  const colour = published ? "badge-green-primary" : /draft|unpublished/i.test(label) ? "badge-light-blue-primary" : "badge-primary-50";
  return `<span class="hidden">${key}</span><span class="badge badge-sm ${colour}"><i class="fa-light ${icon} mr-3xs"></i>${label}</span>`;
}

export function fileRow(o: {
  id: string;
  title: string;
  ext: string;
  status: "Published" | "Unpublished";
  audience: string;
  library: "Brand" | "Account";
  updated: string;
  size?: string;
}): Record<string, string> {
  const key = o.status === "Published" ? 2 : 1;
  return {
    EntityID: o.id,
    Column1: `<span class="hidden">Document-.${o.ext}</span><i class="fa fa-file"></i>`,
    Column2: `<a href="javascript:void(0)" class="file-library-link">${o.title}</a>`,
    Column3: statusBadge(String(key), o.status),
    Column4: audienceBadges(o.audience),
    Column5: o.size ?? "1.2",
    Column6: `<span class="hidden">${ticks(o.updated)}</span>${new Date(o.updated).toLocaleDateString("en-US", { timeZone: "UTC" })}`,
    Column7: '<span class="badge">Operations</span>',
    Column8: o.library,
    Column9: "",
    Column10: "",
  };
}

export function communicationRow(o: { id: string; title: string; key: string; label: string; audience: string }): Record<string, string> {
  return {
    EntityID: o.id,
    Column1: o.title,
    Column2: statusBadge(o.key, o.label),
    Column3: "9/1/2026 - 9/30/2026",
    Column4: "9/1/2026",
    Column5: `<div class="no-wrap">${audienceBadges(o.audience)}</div>`,
    Column6: "A Person",
  };
}

export function bcsContent(): FakeCompanyContent {
  return {
    policies: [
      { id: bcsId(101), title: "Dress Code", version: 2, updated: "8/29/2023", body: "Wear the apron provided.\nClosed-toe shoes at all times." },
      { id: bcsId(102), title: "Cell Phone Policy", version: 1, updated: "6/9/2023", body: "Phones stay in the back room during a shift." },
      { id: bcsId(103), title: "JBA Policy Manual 2025", version: 2, updated: "5/1/2025", body: "Manual text." },
      { id: bcsId(104), title: "NE Sick Time", version: 1, updated: "9/15/2025", body: "Sick time text." },
    ],
    handbooks: [
      { id: bcsId(201), name: "2025 JBA Policy Manual - Edited 5-2025", statusKey: "2", statusLabel: "Published", audience: "Public", updated: "2026-03-24 10:15:00" },
    ],
    procedures: [
      {
        id: bcsId(301),
        title: "Opening the Makery",
        categories: ["General Operations"],
        badges: [],
        positions: "All Positions",
        steps: [
          { id: bcsId(3011), text: "Unlock the front door and disarm the alarm." },
          { id: bcsId(3012), text: "Turn on the soap bar lights." },
          { id: bcsId(3013), text: "Not Provided" },
        ],
      },
      { id: bcsId(302), title: "Closing Checklist", categories: ["General Operations"], badges: ["Unpublished"], positions: "All Positions", steps: [{ id: bcsId(3021), text: "Draft text." }] },
      { id: bcsId(303), title: "Barrel Delivery", categories: ["General Operations"], badges: ["Unpublished", "Monthly"], positions: "All Positions", steps: [{ id: bcsId(3031), text: "Draft text." }] },
      { id: bcsId(304), title: "Fire Extinguisher Use", categories: ["Safety"], badges: [], positions: "All Positions", steps: [{ id: bcsId(3041), text: "Pull the pin, aim at the base, squeeze, sweep." }] },
      {
        id: bcsId(305),
        title: "Chemical Handling",
        categories: ["Safety"],
        badges: [],
        positions: "General Manager, District Manager",
        steps: [{ id: bcsId(3051), text: "Lye is handled by managers only." }],
      },
      { id: bcsId(306), title: "New Hire Orientation", categories: ["Training"], badges: ["Unpublished"], positions: "All Positions", steps: [{ id: bcsId(3061), text: "Draft text." }] },
    ],
    fileLibrary: [
      fileRow({ id: bcsId(401), title: "Soap Loaf Cutting Guide", ext: "pdf", status: "Published", audience: "All Teams All Positions", library: "Brand", updated: "2026-09-01T00:00:00Z" }),
      fileRow({ id: bcsId(402), title: "Makery Ops Manual", ext: "docx", status: "Published", audience: "All Teams All Positions", library: "Account", updated: "2026-08-15T12:00:00Z" }),
      fileRow({ id: bcsId(403), title: "Manager Payroll Guide", ext: "pdf", status: "Published", audience: "2 Teams 5 Positions", library: "Account", updated: "2026-07-01T00:00:00Z" }),
      fileRow({ id: bcsId(404), title: "Seasonal Flyer", ext: "pdf", status: "Unpublished", audience: "All Teams All Positions", library: "Brand", updated: "2026-06-01T00:00:00Z" }),
      fileRow({ id: bcsId(405), title: "Welcome Video", ext: "mp4", status: "Published", audience: "All Teams All Positions", library: "Brand", updated: "2026-05-01T00:00:00Z" }),
      fileRow({ id: bcsId(406), title: "Inventory Sheet", ext: "xlsx", status: "Published", audience: "All Teams All Positions", library: "Account", updated: "2026-04-01T00:00:00Z" }),
      fileRow({ id: bcsId(407), title: "Legacy Notice", ext: "pdf", status: "Published", audience: "N/A", library: "Account", updated: "2026-03-01T00:00:00Z" }),
      fileRow({ id: bcsId(408), title: "Store Hours Poster", ext: "pdf", status: "Published", audience: "Public", library: "Brand", updated: "2026-02-01T00:00:00Z" }),
    ],
    communications: [
      communicationRow({ id: bcsId(501), title: "Weekly Newsletter 40", key: "3", label: "Published – Not Visible", audience: "8 Teams 21 Positions" }),
      communicationRow({ id: bcsId(502), title: "Monthly Pour October", key: "1", label: "Draft", audience: "All Teams All Positions" }),
      communicationRow({ id: bcsId(503), title: "Holiday Hours", key: "3", label: "Published – Not Visible", audience: "Public" }),
    ],
  };
}

/** The other company's content: nothing of it may ever reach Ask Bubbles. */
export function jbaContent(): FakeCompanyContent {
  return {
    policies: [{ id: bcsId(9101), title: "Tanning Bed Safety", version: 4, updated: "1/1/2026", body: "Sun Tan City text." }],
    handbooks: [],
    procedures: [{ id: bcsId(9301), title: "Bed Cleaning", categories: ["Operations"], badges: [], positions: "All Positions", steps: [{ id: bcsId(93011), text: "Sun Tan City steps." }] }],
    fileLibrary: [fileRow({ id: bcsId(9401), title: "Spray Tan Guide", ext: "pdf", status: "Published", audience: "All Teams All Positions", library: "Account", updated: "2026-01-01T00:00:00Z" })],
    communications: [],
  };
}

/* ------------------------------------------------------------- markup -- */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The Switch Account list, on every page: it carries EVERY company's id, which the guard must ignore. */
function switchAccountModal(): string {
  return `<div id="switch-account-modal" class="modal"><ul>
    <li><a class="switch-account" data-company-id="${JBA_COMPANY_ID}">${esc(JBA_COMPANY)}</a></li>
    <li><a class="switch-account" data-company-id="${BCS_COMPANY_ID}">${esc(BCS_COMPANY)}</a></li></ul></div>`;
}

function page(body: string, title = "Woven"): string {
  return `<!DOCTYPE html><html><head><title>${esc(title)}</title><script>var mTrack = "${Math.random()}";</script></head><body><nav><a href="#" class="dropdown-toggle">Integration<br><small>JB &amp; Associates - Corporate</small></a></nav><main>${body}</main>${switchAccountModal()}</body></html>`;
}

function loginPage(error = ""): string {
  return page(
    `<h1>Sign in</h1>${error ? `<p class="error">${error}</p>` : ""}
     <form method="post" action="/Login/Authenticate">
       <input type="text" name="AuthenticationRequestUser"><input type="password" name="AuthenticationRequestPass">
       <input type="hidden" name="IsLocationLogin" value="False"><input type="hidden" name="SetTermsSignedDate" value="">
       <input type="hidden" name="__RequestVerificationToken" value="fixture-login-token">
     </form>`,
    "Login",
  );
}

/** The verified chooser shape: `a.select-company[data-company-id]` and `#continue-login-form`. */
function chooser(accounts: { id: string; name: string }[]): string {
  const rows = accounts
    .map((a) => `<tr><td><a class="select-company" href="javascript:void(0)" data-company-id="${a.id}" data-company-name="" data-account-status="1">${esc(a.name)}</a></td></tr>`)
    .join("");
  return `<!DOCTYPE html><html><head><title>Select Company</title></head><body><main><p>Select account for login</p><table>${rows}</table>
    <form id="continue-login-form" method="post" action="/Login/Authenticate">
      <input type="hidden" name="AuthenticationRequestUser" value="${esc(USERNAME)}"><input type="hidden" name="AuthenticationRequestPass" value="${esc(PASSWORD)}">
      <input type="hidden" name="ReturnUrl" value="/"><input type="hidden" name="CompanyID" value=""><input type="hidden" name="CompanyName" value="">
      <input type="hidden" name="__RequestVerificationToken" value="fixture-continue-token">
    </form></main></body></html>`;
}

/* ------------------------------------------------------------- server -- */

export interface LoggedRequest {
  method: string;
  path: string;
  query: string;
  body: string;
  contentType: string | null;
  /** The company the session was in when the request arrived (null: none). */
  company: string | null;
}

/** The reads the connector is allowed to make, and the sign-in. Anything else is a write attempt. */
const ALLOWED = [
  /^GET \/Login$/,
  /^POST \/Login\/Authenticate$/,
  /^GET \/$/,
  /^GET \/Company$/,
  /^POST \/KnowledgeCenter\/_Policies_List$/,
  /^GET \/KnowledgeCenter\/_Policy_Detail$/,
  /^POST \/KnowledgeCenter\/_Handbooks_List_ForDataTable$/,
  /^POST \/KnowledgeCenter\/_Search_Procedures$/,
  /^GET \/KnowledgeCenter\/Procedure\/[^/]+$/,
  /^POST \/FileLibrary\/_FileLibrary_Management_List_ForDataTable$/,
  /^GET \/Dashboard\/_FileLibrary_Download$/,
  /^POST \/Communication\/_List_ForDataTable$/,
];

export class FakeBcsWoven {
  readonly content: Record<string, FakeCompanyContent> = {
    [BCS_COMPANY_ID]: bcsContent(),
    [JBA_COMPANY_ID]: jbaContent(),
    [UNKNOWN_COMPANY_ID]: { policies: [], handbooks: [], procedures: [], fileLibrary: [], communications: [] },
  };
  readonly log: LoggedRequest[] = [];
  /** Accounts the chooser lists. */
  accounts = [
    { id: JBA_COMPANY_ID, name: JBA_COMPANY },
    { id: BCS_COMPANY_ID, name: BCS_COMPANY },
    { id: UNKNOWN_COMPANY_ID, name: UNKNOWN_COMPANY },
  ];
  /** Overrides what `/Company` shows, per company the session is in: another id or name than its own. */
  companyPageOverride: { id?: string; name?: string } | null = null;
  /** False: the login lands straight in `defaultCompanyId` with no chooser. */
  requireCompanySelection = true;
  defaultCompanyId: string = BCS_COMPANY_ID;
  /**
   * How `/Company` renders.
   *   "live"         the structure the live diagnostic found (default): an
   *                  "Account Management" page, the id ONLY in inline scripts
   *                  under `companyid` / `wovenCompanyID` / `companyId`, the
   *                  name in the account menu, other ids under other keys.
   *   "text","input" other renderings the guard also reads (a "Company ID"
   *                  label; a `CompanyID` input).
   *   "missing"      no company id anywhere (other ids still present).
   *   "conflicting"  the scripts name the pinned id AND another company's.
   *   "forbidden"    HTTP 403.
   */
  companyPage: "live" | "text" | "input" | "missing" | "conflicting" | "forbidden" = "live";
  /** After this many more content reads, the session moves to the other company. */
  switchCompanyAfter: number | null = null;
  /** After this many more authenticated requests, the session ends. */
  expireSessionAfter: number | null = null;
  /** Which company sign-in number `n` lands in, whatever was chosen (a re-login that goes astray). */
  companyForLogin: ((n: number) => string) | null = null;
  /** Path → HTTP status, or a body shape. */
  readonly failures = new Map<string, number>();
  readonly malformed = new Set<string>();
  readonly htmlInsteadOfJson = new Set<string>();
  /** Category name → indicator count override (to make the list look incomplete). */
  readonly indicatorOverride = new Map<string, number>();
  /** Category name → indicator markup that cannot be read. */
  readonly indicatorUnreadable = new Set<string>();
  fileBytes: Record<string, { bytes: string; contentType?: string }> = {
    [bcsId(401)]: { bytes: "%PDF-1.4 Soap loaf cutting: use the wire cutter at 1 inch." },
  };
  logins = 0;
  private session: { token: string; companyId: string | null } | null = null;

  get activeCompanyId(): string | null {
    return this.session?.companyId ?? null;
  }

  /** Requests to anything but a verified read or the sign-in. */
  writes(): LoggedRequest[] {
    return this.log.filter((r) => !ALLOWED.some((re) => re.test(`${r.method} ${r.path}`)));
  }

  /** Requests for company content (lists, details, downloads) — not sign-in, dashboard or the Company page. */
  contentReads(): LoggedRequest[] {
    return this.log.filter((r) => /^\/(KnowledgeCenter|FileLibrary|Communication|Dashboard)\//.test(r.path));
  }

  /** The live `/Company` structure (sanitized shape from the diagnostic; invented values). */
  private liveCompanyPage(account: { id: string; name: string }, variant: "live" | "missing" | "conflicting"): string {
    const id = (v: string) => (variant === "missing" ? "" : v);
    const second = variant === "conflicting" ? JBA_COMPANY_ID : account.id;
    const userId = bcsId(77001);
    return `<!DOCTYPE html><html><head><title>Account Management</title>
      <script defer>window.wovenAnalytics && wovenAnalytics.group(${variant === "missing" ? "{ userid: '" + userId + "' }" : `{ companyid: '${id(account.id)}', name: '${esc(account.name)}', userid: '${userId}' }`});</script>
      </head><body class="nav-static chat-sidebar-container checking-nav-xs " style="">
      <nav><ul><li class="dropdown"><a href="#" class="dropdown-toggle fw-500 flex flex-vcenter color-primary" data-toggle="dropdown"><div class="ml-sm visible-lg"><div>Integration User</div><div><small class="text-grey fw-300">${esc(account.name)}</small></div></div></a></li></ul></nav>
      <main><h1>Account Management</h1><ul class="nav-tabs"><li>Account</li><li>Integrations</li><li>Configuration</li></ul>
      <input type="hidden" id="SecurityDummyField" name="SecurityDummyField" value="">
      <input type="hidden" id="CompanyRememberLoginWeb" name="CompanyRememberLoginWeb" value="true">
      <input type="number" id="CompanyMinutesBeforeAutoLogoutWeb" name="CompanyMinutesBeforeAutoLogoutWeb" value="60"></main>
      ${switchAccountModal()}
      <script defer>${variant === "missing" ? `var wovenUserID = '${userId}';` : `var wovenCompanyID = '${id(account.id)}'; var wovenUserID = '${userId}';`}</script>
      <script>${variant === "missing" ? `initChat({ userId: "${userId}" });` : `initChat({ companyId: "${second}", userId: "${userId}" });`}</script>
      </body></html>`;
  }

  /**
   * The empty-category search, as the live diagnostic found it (2026-10-06):
   * category cards (`div.indicator` count) and, in a hidden
   * `.procedure-grid`, every procedure card, then a script.
   */
  private procedureListing(c: FakeCompanyContent): string {
    const names = [...new Set(c.procedures.flatMap((p) => p.categories))];
    const categoryCards = names
      .map((name) => {
        const n = this.indicatorOverride.get(name) ?? c.procedures.filter((p) => p.categories.includes(name)).length;
        const indicator = this.indicatorUnreadable.has(name) ? "many" : String(n);
        return `<div class="col-md-4 category-card woven-card" data-procedure-category-name="${esc(name)}"><div class="card-left"><img src="/img/folder.svg"></div><div class="card-center flex-center-content flex-hcenter"><div class="entity-name">${esc(name)}</div></div><div class="card-right"><div class="indicator">${indicator}</div><div class="chevron"><i class="fas fa-chevron-right"></i></div></div></div>`;
      })
      .join("");
    const procedureCards = c.procedures
      .map(
        (p) => `<div class="woven-summary-container procedure-card" data-procedure-id="${p.id}"><div class="entity-name">${esc(p.title)}</div>
            ${p.badges.map((b) => `<span class="badge badge-sm">${esc(b)}</span>`).join("")}
            ${p.positions === null ? "" : `<div><img id="positions-assigned-image" src="/img/positions.svg"> ${esc(p.positions)}</div>`}</div>`,
      )
      .join("");
    return `<div class="row"><div class="col-xs-12">${categoryCards}</div><div class="col-xs-12 hidden"><div class="procedure-grid">${procedureCards}</div></div></div><script>initProcedureSearch();</script>`;
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : "";
    const path = url.pathname;
    this.log.push({ method, path, query: url.search, body, contentType: headers.get("content-type"), company: this.session?.companyId ?? null });

    const html = (text: string, status = 200, extra: Record<string, string> = {}) =>
      new Response(text, { status, headers: { "content-type": "text/html; charset=utf-8", ...extra } });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
    const redirect = (to: string, cookie?: string) => {
      const h = new Headers({ location: to });
      if (cookie) h.append("set-cookie", cookie);
      return new Response(null, { status: 302, headers: h });
    };
    const cookie = headers.get("cookie") ?? "";
    const hasSession = this.session !== null && cookie.includes(`FixtureSession=${this.session.token}`);

    /* --------------------------------------------------- sign-in -- */
    if (path === "/Login" && method === "GET") return html(loginPage());
    if (path === "/Login/Authenticate" && method === "POST") {
      const form = new URLSearchParams(body);
      const chosen = form.get("CompanyID");
      if (chosen) {
        if (!hasSession || form.get("__RequestVerificationToken") !== "fixture-continue-token") return html(loginPage("Your session has expired."));
        const account = this.accounts.find((a) => a.id === chosen);
        if (!account) return html(chooser(this.accounts));
        this.session!.companyId = this.companyForLogin?.(this.logins) ?? account.id;
        return redirect("/");
      }
      if (form.get("AuthenticationRequestUser") !== USERNAME || form.get("AuthenticationRequestPass") !== PASSWORD || form.get("__RequestVerificationToken") !== "fixture-login-token") {
        return html(loginPage("Invalid username or password."));
      }
      this.logins += 1;
      const token = `s${this.logins}`;
      const set = `FixtureSession=${token}; path=/; HttpOnly; Secure`;
      if (this.requireCompanySelection) {
        this.session = { token, companyId: null };
        return html(chooser(this.accounts), 200, { "set-cookie": set });
      }
      this.session = { token, companyId: this.companyForLogin?.(this.logins) ?? this.defaultCompanyId };
      return redirect("/", set);
    }

    if (!hasSession || this.session!.companyId === null) return redirect(`/Login?ReturnUrl=${encodeURIComponent(path)}`);
    if (this.expireSessionAfter !== null) {
      if (this.expireSessionAfter <= 0) {
        this.session = null;
        this.expireSessionAfter = null;
        return redirect(`/Login?ReturnUrl=${encodeURIComponent(path)}`);
      }
      this.expireSessionAfter -= 1;
    }
    const companyId = this.session!.companyId;

    if (path === "/") return html(page("<h1>Dashboard</h1>", "Dashboard"));
    if (path === "/Company") {
      if (this.companyPage === "forbidden") return html("<h1>Forbidden</h1>", 403);
      const found = this.accounts.find((a) => a.id === companyId) ?? { id: companyId, name: "Unlisted Co" };
      const account = { id: this.companyPageOverride?.id ?? found.id, name: this.companyPageOverride?.name ?? found.name };
      const brand = companyId === BCS_COMPANY_ID ? "Buff City Soap" : "Sun Tan City";
      if (this.companyPage === "live" || this.companyPage === "missing" || this.companyPage === "conflicting") {
        return html(this.liveCompanyPage(account, this.companyPage));
      }
      const idBlock =
        this.companyPage === "input"
          ? `<label for="CompanyID">Company ID</label><input id="CompanyID" name="CompanyID" type="text" readonly value="${account.id}">`
          : `<div class="form-group"><label>Company ID</label><div class="read-only-label">${account.id}</div></div>`;
      return html(page(`<h1>Company</h1><div><label>Brand</label><div>${brand}</div></div><div><label>Company</label><div>${esc(account.name)}</div></div>${idBlock}`));
    }

    if (this.failures.has(path)) return html("<h1>Error</h1>", this.failures.get(path));
    if (this.malformed.has(path)) return json({ unexpected: true });
    if (this.htmlInsteadOfJson.has(path)) return html(page("<h1>Something went wrong</h1>"));

    if (this.switchCompanyAfter !== null) {
      if (this.switchCompanyAfter <= 0) {
        this.session!.companyId = companyId === BCS_COMPANY_ID ? JBA_COMPANY_ID : BCS_COMPANY_ID;
        this.switchCompanyAfter = null;
      } else this.switchCompanyAfter -= 1;
    }
    const c = this.content[this.session!.companyId!]!;

    if (path === "/KnowledgeCenter/_Policies_List" && method === "POST") {
      const cards = c.policies
        .map(
          (p) => `<div class="woven-summary-container" data-policy-id="${p.id}"><span class="hidden policy-sort-name">${esc(p.title.toLowerCase())}</span>
            <a href="javascript:void(0)" class="entity-name">${esc(p.title)}</a> <span class="badge">Version ${p.version}</span> <span>Last Update ${p.updated}</span></div>`,
        )
        .join("");
      return json({ Success: true, HTML: cards });
    }
    if (path === "/KnowledgeCenter/_Policy_Detail" && method === "GET") {
      const p = c.policies.find((x) => x.id === url.searchParams.get("pPolicyID"));
      if (!p) return html("Not found", 404);
      return html(
        `<div id="policy-${p.id}" class="row"><div class="col-md-4"><div>Version:</div><div class="fs-md font-bold">${p.version}</div></div>
         <div class="col-md-4"><div>Last Updated:</div><div class="fs-md font-bold">${p.updated}</div></div>
         <div class="col-md-12"><div class="mb-md">${p.body.split("\n").map((l) => `<p>${esc(l)}</p>`).join("")}</div></div></div>`,
      );
    }
    if (path === "/KnowledgeCenter/_Handbooks_List_ForDataTable" && method === "POST") {
      return json({
        list: c.handbooks.map((h) => ({
          EntityID: h.id,
          EntityID2: null,
          Column1: `<a href="/KnowledgeCenter/Handbooks/${h.id}/manage">${esc(h.name)}</a>`,
          Column2: `<span class="hidden">${h.statusKey}</span><span class="badge">${h.statusLabel}</span>`,
          Column3: `<span class="badge">${h.audience}</span>`,
          Column4: `<span class="hidden">${h.updated}</span>${h.updated.slice(0, 10)}`,
        })),
      });
    }
    if (path === "/KnowledgeCenter/_Search_Procedures" && method === "POST") {
      const wanted = (JSON.parse(body) as { pModel: { Categories: string[] } }).pModel.Categories;
      /* VERIFIED live: a search naming a category answers no procedures. */
      if (wanted.length > 0) return json({ Success: true, HTML: '<div class="row"><div class="col-xs-12"></div></div>' });
      return json({ Success: true, HTML: this.procedureListing(c) });
    }
    const proc = /^\/KnowledgeCenter\/Procedure\/([^/]+)$/.exec(path);
    if (proc) {
      const p = c.procedures.find((x) => x.id === proc[1]);
      if (!p) return html("Not found", 404);
      const steps = p.steps.map((s) => `<div class="step" data-procedure-step-id="${s.id}"><div id="procedure-step-content"><p>${esc(s.text)}</p></div></div>`).join("");
      return html(page(`<h1>${esc(p.title)}</h1><div id="procedure-steps-container">${steps}</div><div id="procedure-steps-carousel">${steps}</div>`, `Procedures - ${p.title}`));
    }
    if (path === "/FileLibrary/_FileLibrary_Management_List_ForDataTable" && method === "POST") return json({ list: c.fileLibrary });
    if (path === "/Dashboard/_FileLibrary_Download" && method === "GET") {
      const f = this.fileBytes[url.searchParams.get("pFileLibraryID") ?? ""];
      if (!f) return html("Not found", 404);
      return new Response(new TextEncoder().encode(f.bytes), { status: 200, headers: { "content-type": f.contentType ?? "application/pdf" } });
    }
    if (path === "/Communication/_List_ForDataTable" && method === "POST") return json({ list: c.communications });
    return html("Not found", 404);
  };
}

export const noSleep = async () => {};
