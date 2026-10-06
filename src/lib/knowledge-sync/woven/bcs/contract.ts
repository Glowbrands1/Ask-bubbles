/**
 * ============================================================================
 * BUFF CITY SOAP — THE WOVEN WEB-APP CONTRACT, from the verified handoff
 * ============================================================================
 *
 * SOURCE OF TRUTH: `woven-buff-city-soap-ask-bubbles-handoff.json`, the
 * read-only browser investigation of the Midwest Soap Makers company
 * (Brand Buff City Soap, Company ID 55839F24-9241-418C-8405-37BAF9A42A87) on
 * 6 October 2026. Every name below is copied from it; nothing is guessed.
 *
 * MARKERS, as the handoff uses them:
 *
 *   VERIFIED_WEB_APP_INTERNAL_ROUTE  seen in the authenticated BCS session.
 *   VERIFIED_UI                      seen on screen only.
 *   WEB_APP_SIGN_IN                  the Woven web app's own sign-in and
 *                                    account chooser (`../web-app.ts`):
 *                                    tenant-neutral, captured with the same
 *                                    login by the reference platform; the BCS
 *                                    handoff did not re-capture it. The company
 *                                    is chosen by the pinned id and proved on
 *                                    /Company, so a wrong step fails closed.
 *   UNVERIFIED                       not checked. Never executed; a part that
 *                                    needs it is BLOCKED, tracked by its
 *                                    capability code below.
 *
 * THESE ARE WOVEN'S INTERNAL, AUTHENTICATED WEB-APP ROUTES, not a supported
 * public API (the official API is UNVERIFIED for this account). They are read
 * through `WovenTeamClient` behind the `KnowledgeSourceConnector` interface,
 * so an official API can replace them without touching the engine.
 *
 * READ-ONLY. Every POST below is a list/search READ the web app itself makes to
 * render a page. Nothing here publishes, edits, acknowledges, archives,
 * uploads or deletes. The File Library QuickEdit panel is an EDIT panel and is
 * never requested by this connector.
 */

/* ----------------------------------------------------------- company -- */

/**
 * `GET /Company`. VERIFIED BY LIVE DIAGNOSTIC (6 October 2026, the Buff City
 * Soap integration login, structure only): the server answers 200 with the
 * "Account Management" page. The Company ID is NOT in its visible text; the
 * session's company is carried in the page's own inline scripts, as the value
 * of exactly these keys — `companyid` (a head script), `wovenCompanyID` and
 * `companyId` (body scripts) — each followed within a few characters by the
 * id. Those three were the only company-id keys in the page, and all held
 * 55839F24-9241-418C-8405-37BAF9A42A87. The company NAME is visible in the
 * account menu (`a.dropdown-toggle … small`).
 *
 * The guard collects EVERY reading — script keys, plus the "Company ID" label
 * text and a `CompanyID` input should Woven ever render them — and requires at
 * least one and that ALL equal the pinned id. Ids carried by `data-company-id`
 * attributes are NEVER read: the Switch Account list carries every company the
 * login belongs to.
 */
export const COMPANY_PAGE_PATH = "/Company";
/**
 * A company-id key in an inline script and the GUID it is set to. The keys are
 * the three the live page uses (case-insensitive, whole identifier only — a
 * `parentCompanyId` is not one); the separators are an assignment, a property
 * or an argument (`key = '…'`, `"key": "…"`, `('key', '…')`).
 */
export const COMPANY_ID_SCRIPT_KEY =
  /\b(?:woven)?companyid\b\s*["']?\s*[:=,]\s*["'(]?\s*\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?/gi;
/** VERIFIED: the account menu, whose `small` text names the active company. */
export const ACCOUNT_MENU = { toggleClass: "dropdown-toggle", nameTag: "small" } as const;
export const COMPANY_ID_LABEL = /\bCompany\s*ID\b\s*[:#]?\s*\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?/gi;
export const COMPANY_ID_INPUT = /^CompanyID$/i;
export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* --------------------------------------------------------- policies -- */

/** VERIFIED_WEB_APP_INTERNAL_ROUTE: POST JSON; answers `{ Success: true, HTML }`. */
export const POLICY_LIST_PATH = "/KnowledgeCenter/_Policies_List";
/** VERIFIED (page JS GetFilterSearchData). `TeamGroupIDs` element type UNVERIFIED — sent empty. */
export const POLICY_LIST_BODY = { pModel: { FilterText: "", TeamGroupIDs: [] } } as const;
/** VERIFIED item markup: `div.woven-summary-container[data-policy-id]`, `.entity-name`, `span.badge` "Version N", text "Last Update M/D/YYYY". */
export const POLICY_CARD = {
  idAttr: "data-policy-id",
  containerClass: "woven-summary-container",
  titleClass: "entity-name",
  badgeTag: "span",
  badgeClass: "badge",
  version: /^\s*Version\s+(\d+)\s*$/i,
  updated: /\bLast\s+Update\s+(\d{1,2}\/\d{1,2}\/\d{4})\b/i,
} as const;
/** VERIFIED_WEB_APP_INTERNAL_ROUTE: GET, an HTML fragment. */
export const policyDetailPath = (policyId: string) => `/KnowledgeCenter/_Policy_Detail?pPolicyID=${encodeURIComponent(policyId)}`;
/**
 * VERIFIED structure (1 of 12 sampled): root `div#policy-<GUID>.row`;
 * "Version:" / "Last Updated:" in `div.col-md-4`, value in `.fs-md.font-bold`;
 * body text in `div.mb-md`.
 */
export const POLICY_DETAIL = {
  rootIdPrefix: "policy-",
  fieldClass: "col-md-4",
  valueClasses: ["fs-md", "font-bold"],
  versionLabel: /^\s*Version\s*:?/i,
  updatedLabel: /^\s*Last\s+Updated\s*:?/i,
  bodyClass: "mb-md",
} as const;
/**
 * UNVERIFIED: whether a policy is published. No status badge was seen in the
 * list or the detail sample, so every policy reads as publication UNKNOWN
 * (`publication_unverified`) and none is synced until that is established.
 */
export const POLICY_PUBLICATION_REASON = "publication_unverified";

/* -------------------------------------------------------- handbooks -- */

/** VERIFIED_WEB_APP_INTERNAL_ROUTE: POST, JSON content type, no body; answers `{ list }`. */
export const HANDBOOK_LIST_PATH = "/KnowledgeCenter/_Handbooks_List_ForDataTable";
export const HANDBOOK_COLUMNS = { id: "EntityID", name: "Column1", status: "Column2", audience: "Column3", updated: "Column4" } as const;
/** VERIFIED: Column1's anchor `href` is this, carrying the same GUID as `EntityID`. */
export const HANDBOOK_MANAGE_HREF = /^\/KnowledgeCenter\/Handbooks\/([0-9a-f-]{36})\/manage$/i;
/** VERIFIED: Column2's hidden numeric key and visible label. Only `2 Published` was observed. */
export const HANDBOOK_STATUS: Record<string, { label: RegExp; publication: "published" | "unpublished"; reason: string | null }> = {
  "2": { label: /^published$/i, publication: "published", reason: null },
};

/* ------------------------------------------------------- procedures -- */

/** VERIFIED_WEB_APP_INTERNAL_ROUTE: POST JSON; answers `{ Success: true, HTML }`. */
export const PROCEDURE_SEARCH_PATH = "/KnowledgeCenter/_Search_Procedures";
/**
 * VERIFIED body (live structure diagnostic, 2026-10-06). The search with an
 * EMPTY `Categories` is the whole listing: it answers the category cards AND
 * every procedure card. A search naming a category (by its
 * `data-procedure-category-name`) answered NO procedures for any of the 12
 * categories, so it is never used.
 */
export const procedureSearchBody = (categories: string[]) => ({
  pModel: { FilterText: "", Categories: categories, Frequencies: [], Positions: [], Tags: [] },
});
/**
 * VERIFIED (2026-10-06): the empty-category response is
 *   div.row > … category cards: `[data-procedure-category-name]`, each with
 *                exactly one `div.indicator` holding a whole number
 *   div.col-xs-12.hidden > div.procedure-grid > procedure cards:
 *                `.woven-summary-container[data-procedure-id]`, one element
 *                per procedure, none inside a category card
 * The 12 indicators summed to 51 and the grid held 51 distinct procedures;
 * the earlier per-category reads also gave 51 with no procedure in two
 * categories. So the SUM of the indicators is the completeness proof.
 */
export const PROCEDURE_CATEGORY_ATTR = "data-procedure-category-name";
export const PROCEDURE_CATEGORY_INDICATOR_CLASS = /indicator/i;
/** VERIFIED card markup. */
export const PROCEDURE_CARD = {
  idAttr: "data-procedure-id",
  containerClass: "woven-summary-container",
  titleClass: "entity-name",
  badgeClass: "badge",
  positionsImageId: "positions-assigned-image",
} as const;
/** VERIFIED: the badge that marks a draft (46 of 51 carry it; re-verified 2026-10-06). */
export const PROCEDURE_UNPUBLISHED_BADGE = /^unpublished$/i;
/**
 * Badges that state a FREQUENCY, not a publication state. "Monthly" is
 * VERIFIED; the rest are the ordinary frequency words and are matched exactly.
 * Any OTHER badge is an unknown publication state and fails the listing.
 */
export const PROCEDURE_FREQUENCY_BADGES = /^(daily|weekly|bi-?weekly|semi-?monthly|monthly|quarterly|semi-?annually|annually|yearly|as needed|once)$/i;
/** VERIFIED: position text "All Positions" means no position restriction. Team/location restrictions are UNVERIFIED. */
export const PROCEDURE_ALL_POSITIONS = /^all\s+positions$/i;
/** VERIFIED_WEB_APP_INTERNAL_ROUTE: GET, a full application page. */
export const procedureDetailPath = (procedureId: string) => `/KnowledgeCenter/Procedure/${encodeURIComponent(procedureId)}`;
/** VERIFIED structure (1 of 51 sampled): title "Procedures - <name>"; steps carry `data-procedure-step-id` and `#procedure-step-content`. */
export const PROCEDURE_DETAIL = {
  title: /^\s*Procedures\s*-\s*/i,
  stepIdAttr: "data-procedure-step-id",
  stepContentId: "procedure-step-content",
  placeholderBody: /^\s*not provided\s*$/i,
} as const;

/* ----------------------------------------------------- file library -- */

/** VERIFIED_WEB_APP_INTERNAL_ROUTE: POST JSON; answers `{ list }`, the whole collection (`serverSide: false`). */
export const FILE_LIBRARY_LIST_PATH = "/FileLibrary/_FileLibrary_Management_List_ForDataTable";
export const FILE_LIBRARY_LIST_BODY = {
  pModel: { Name: "", FileAltText: "", FileLibraryTypes: [], FileLibrarySources: null, Tags: [] },
} as const;
/** VERIFIED from a sample row (the UI header order differs; the shape checks below fail the listing on drift). */
export const FILE_LIBRARY_COLUMNS = {
  id: "EntityID",
  type: "Column1",
  title: "Column2",
  status: "Column3",
  audience: "Column4",
  size: "Column5",
  updated: "Column6",
  tags: "Column7",
  library: "Column8",
} as const;
/** VERIFIED: Column3's hidden key → label. */
export const FILE_LIBRARY_STATUS: Record<string, { label: RegExp; publication: "published" | "unpublished"; reason: string | null }> = {
  "1": { label: /^unpublished$/i, publication: "unpublished", reason: "unpublished" },
  "2": { label: /^published$/i, publication: "published", reason: null },
};
/** VERIFIED: Column8 library level. */
export const FILE_LIBRARY_LEVELS = ["Brand", "Account"] as const;
/**
 * VERIFIED download route (page JS DownloadFileLibraryDocument) and RESPONSE
 * (one owner-approved sample download, 2026-10-06, a 24 KB published PDF):
 *   GET with the session cookie, query `pFileLibraryID` + `pDownloadedFromEntityType=FileLibrary`
 *   → 200, `application/pdf`, the bytes DIRECTLY (no redirect, no signed
 *     storage URL), `Content-Length`, `Content-Disposition: attachment` with
 *     `filename` and `filename*` (a name that may differ from the title, e.g.
 *     "… (1).pdf" — the record's title-based name is used instead),
 *     `Cache-Control: no-store`.
 *   Without a session → 302 to `/Login` (read as `session_expired`).
 * It may record a download event in Woven's engagement analytics (not
 * observable from the response). Still executed only with
 * WOVEN_BCS_FILE_LIBRARY_DOWNLOAD_ENABLED.
 */
export const fileLibraryDownloadPath = (fileLibraryId: string) =>
  `/Dashboard/_FileLibrary_Download?pFileLibraryID=${encodeURIComponent(fileLibraryId)}&pDownloadedFromEntityType=FileLibrary`;

/* --------------------------------------------------- communications -- */

/** VERIFIED_WEB_APP_INTERNAL_ROUTE: POST JSON, `{}` accepted; answers `{ list }`. */
export const COMMUNICATION_LIST_PATH = "/Communication/_List_ForDataTable";
export const COMMUNICATION_LIST_BODY = {} as const;
/** VERIFIED columns. Column6 ("Created By") is a person's name and is never read. */
export const COMMUNICATION_COLUMNS = {
  id: "EntityID",
  title: "Column1",
  status: "Column2",
  visibleRange: "Column3",
  publishedOn: "Column4",
  audience: "Column5",
} as const;
/**
 * VERIFIED: 1 "Draft", 3 "Published – Not Visible". The published-and-visible
 * key (probably 2) has NOT been observed, so it is not mapped: meeting it
 * fails the listing until it is verified.
 */
export const COMMUNICATION_STATUS: Record<string, { label: RegExp; publication: "published" | "unpublished"; reason: string | null }> = {
  "1": { label: /^draft$/i, publication: "unpublished", reason: "draft" },
  "3": { label: /^published\s*[-–—]\s*not\s+visible$/i, publication: "unpublished", reason: "published_not_visible" },
};

/* --------------------------------------------------------- audience -- */

/**
 * THE ONLY AUDIENCE SHARED AUTOMATICALLY (owner's decision for the Production
 * launch, 2026-10-06): "All Teams All Positions" on a FILE LIBRARY item. It
 * is the File Library's verified label for no team and no position limit.
 *
 * Nothing else is company-wide: not "Public" (any content type, including
 * Handbooks), not "N/A", not "All Teams All Positions" on another content
 * type, not any team or position limit. Those stay excluded until verified.
 */
export const BCS_COMPANY_WIDE_AUDIENCE = { label: "All Teams All Positions", contentTypes: ["file_library"] } as const;
export const BCS_COMPANY_WIDE_AUDIENCE_LABELS: readonly string[] = [BCS_COMPANY_WIDE_AUDIENCE.label];

/**
 * VERIFIED display form of a team/position audience: "8 Teams 21 Positions",
 * "All Teams 3 Positions", "1 Team 1 Position" (2026-10-06: every File
 * Library and Communications audience but "Public" and "N/A" has this form;
 * the cell is a pair of `span.badge` elements, read by its text).
 */
export const TEAM_POSITION_AUDIENCE = /^(all|\d+)\s+teams?\s+(all|\d+)\s+positions?$/i;
/** VERIFIED display form "N/A" (File Library). It says nothing about who may see the item. */
export const NOT_APPLICABLE_AUDIENCE = /^n\/?a$/i;
/**
 * VERIFIED display form "Public": Handbooks; and (2026-10-06) 6 File Library
 * rows and 1 communication, as a single `span.badge`. Its ACCESS MEANING is
 * not verified for this launch: it is parsed, never shared
 * (`audience_unverified`, see `../policy.ts`).
 */
export const PUBLIC_AUDIENCE = /^public$/i;

/* ----------------------------------------------------- capabilities -- */

/** Why a part is BLOCKED: a capability not verified (or not switched on) for this company. */
export const BCS_CAPABILITY = {
  fileLibraryDownload: "file_library_download_unverified",
  handbookDownload: "handbook_download_unverified",
  procedureContent: "procedure_content",
  policyBody: "policy_body",
  communicationDetail: "communication_detail_unverified",
} as const;

/** The content types this company has. Courses and Knowledge Elements: NOT_FOUND in its navigation. */
export const BCS_CONTENT_TYPES = ["policy", "handbook", "procedure", "file_library", "communication"] as const;
