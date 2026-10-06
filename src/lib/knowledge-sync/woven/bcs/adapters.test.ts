import { describe, expect, it } from "vitest";

import { communicationRecord, parseCommunicationRows } from "./adapters/communications";
import { fileLibraryRecord, parseFileLibraryRows } from "./adapters/file-library";
import { handbookRecord, parseHandbookRows } from "./adapters/handbooks";
import { parsePolicyCards, parsePolicyDetail, policyRecord, withPolicyDetail } from "./adapters/policies";
import { parseProcedureDetail, parseProcedureListing, procedureRecord } from "./adapters/procedures";
import { ticksToIso } from "./adapters/shared";
import { assertCompanyPage, companyIdsOnPage } from "./company-guard";
import { bcsAudienceRestriction, bcsOwnershipHold } from "./policy";
import { BCS_COMPANY_ID, JBA_COMPANY_ID, FakeBcsWoven, bcsId, communicationRow, fileRow, ticks } from "./test-support";

/**
 * The Buff City Soap adapters against the handoff's recorded shapes. PURE:
 * no network, no store. A shape that does not match must THROW (a failed
 * listing), never read as an empty or shifted list.
 */

const policyCard = (id: string, title: string, version = 2, updated = "5/13/2026") =>
  `<div class="woven-summary-container" data-policy-id="${id}"><span class="hidden policy-sort-name">${title.toLowerCase()}</span><a class="entity-name">${title}</a> <span class="badge">Version ${version}</span> Last Update ${updated}</div>`;

describe("policies", () => {
  it("parses the card list: id, title, version, date — and holds every policy as publication-unverified", () => {
    const cards = parsePolicyCards({ Success: true, HTML: policyCard(bcsId(1), "Deduction Authorization") + policyCard(bcsId(2), "AI Policy", 1, "5/6/2026") });
    expect(cards).toEqual([
      { id: bcsId(1), title: "Deduction Authorization", version: "Version 2", updatedAt: "2026-05-13", otherBadges: [] },
      { id: bcsId(2), title: "AI Policy", version: "Version 1", updatedAt: "2026-05-06", otherBadges: [] },
    ]);
    const record = policyRecord(cards[0]!);
    expect(record).toMatchObject({ contentType: "policy", entityId: bcsId(1), publication: "unknown", publicationReason: "publication_unverified", audience: null });
  });

  it("refuses a failed or reshaped list rather than reading it as empty", () => {
    expect(() => parsePolicyCards({ Success: false, HTML: "" })).toThrow(/not a successful list/);
    expect(() => parsePolicyCards({ list: [] })).toThrow();
    expect(() => parsePolicyCards({ Success: true, HTML: `<div data-policy-id="${bcsId(1)}"><b>No container class</b></div>` })).toThrow(/verified card markup/);
    expect(() => parsePolicyCards({ Success: true, HTML: `<div class="woven-summary-container" data-policy-id="${bcsId(1)}"><span class="badge">Version 1</span></div>` })).toThrow(/no title/);
  });

  it("refuses a list that names the same policy twice", () => {
    expect(() => parsePolicyCards({ Success: true, HTML: policyCard(bcsId(1), "A") + policyCard(bcsId(1), "A again") })).toThrow(/same item twice/);
  });

  it("reads the detail fragment's version, date and body, and only for the policy asked for", () => {
    const html = `<div id="policy-${bcsId(1)}" class="row"><div class="col-md-4"><div>Version:</div><div class="fs-md font-bold">2</div></div><div class="col-md-4"><div>Last Updated:</div><div class="fs-md font-bold">5/13/2026</div></div><div class="mb-md"><p>Line one.</p><p>Line two.</p></div></div>`;
    expect(parsePolicyDetail(html, bcsId(1))).toEqual({ version: "Version 2", updatedAt: "2026-05-13", body: "Line one.\n\nLine two." });
    expect(() => parsePolicyDetail(html, bcsId(9))).toThrow(/not the policy/);
    const noBody = parsePolicyDetail(`<div id="policy-${bcsId(1)}" class="row"></div>`, bcsId(1));
    expect(noBody.body).toBeNull();
    expect(withPolicyDetail(policyRecord(parsePolicyCards({ Success: true, HTML: policyCard(bcsId(1), "A") })[0]!), noBody).parts[0]!.retrieval).toEqual({
      kind: "blocked",
      capability: "policy_body",
    });
  });
});

const handbookRow = (over: Record<string, string> = {}) => ({
  EntityID: bcsId(201),
  Column1: `<a href="/KnowledgeCenter/Handbooks/${bcsId(201)}/manage">Team Handbook</a>`,
  Column2: '<span class="hidden">2</span><span class="badge">Published</span>',
  Column3: '<span class="badge">Public</span>',
  Column4: '<span class="hidden">2026-03-24 10:15:00</span>3/24/2026',
  ...over,
});

describe("handbooks", () => {
  it("parses a published, public handbook; its content is always BLOCKED (no route verified for this company)", () => {
    const [row] = parseHandbookRows({ list: [handbookRow()] });
    expect(row).toMatchObject({ id: bcsId(201), title: "Team Handbook", status: "Published", publication: "published", audience: ["Public"], updatedAt: "2026-03-24T10:15:00" });
    expect(handbookRecord(row!).parts[0]!.retrieval).toEqual({ kind: "blocked", capability: "handbook_download_unverified" });
  });

  it("fails on an unknown status, a link to another handbook, or a missing column", () => {
    expect(() => parseHandbookRows({ list: [handbookRow({ Column2: '<span class="hidden">1</span>Draft' })] })).toThrow(/status Ask Bubbles has not verified/);
    expect(() => parseHandbookRows({ list: [handbookRow({ Column1: `<a href="/KnowledgeCenter/Handbooks/${bcsId(999)}/manage">X</a>` })] })).toThrow(/did not match its id/);
    const { Column3: _drop, ...missing } = handbookRow();
    void _drop;
    expect(() => parseHandbookRows({ list: [missing] })).toThrow(/missing Column3/);
    expect(() => parseHandbookRows({ Success: true })).toThrow(/expected list/);
  });
});

/**
 * The empty-category procedure search as the LIVE read-only diagnostic found
 * it (6 October 2026), sanitized — structure only, invented names and ids:
 * `div.row` holding the category cards (`[data-procedure-category-name]`,
 * `div.card-left > img`, `div.card-center > div.entity-name`,
 * `div.card-right > div.indicator + div.chevron > i`) and, in
 * `div.col-xs-12.hidden > div.procedure-grid`, one
 * `.woven-summary-container[data-procedure-id]` per procedure; then a script.
 * Live: 12 categories whose indicators sum to 51; 51 cards, each id once;
 * badges "Unpublished" ×45, none ×5, "Unpublished" + "Monthly" ×1.
 */
const categoryCard = (name: string, count: string) =>
  `<div class="col-md-4 category-card woven-card" data-procedure-category-name="${name}"><div class="card-left"><img src="/img/folder.svg"></div><div class="card-center flex-center-content flex-hcenter"><div class="entity-name">${name}</div></div><div class="card-right"><div class="indicator">${count}</div><div class="chevron"><i class="fas fa-chevron-right"></i></div></div></div>`;
const procedureCard = (id: string, title: string, badges: string[] = [], positions: string | null = "All Positions") =>
  `<div class="woven-summary-container procedure-card" data-procedure-id="${id}"><div class="entity-name">${title}</div>${badges.map((b) => `<span class="badge badge-sm">${b}</span>`).join("")}${positions === null ? "" : `<div><img id="positions-assigned-image"> ${positions}</div>`}</div>`;
const listing = (categories: [string, string][], cards: string[]) => ({
  Success: true,
  HTML: `<div class="row"><div class="col-xs-12">${categories.map(([n, c]) => categoryCard(n, c)).join("")}</div><div class="col-xs-12 hidden"><div class="procedure-grid">${cards.join("")}</div></div></div><script>initProcedureSearch();</script>`,
});

describe("procedures", () => {
  it("reads the live structure in ONE response: category counts and every procedure card, proved complete by the sum", () => {
    const { categories, cards } = parseProcedureListing(
      listing(
        [
          ["Safety", "2"],
          ["Training", "1"],
        ],
        [procedureCard(bcsId(1), "A"), procedureCard(bcsId(2), "B", ["Unpublished"]), procedureCard(bcsId(3), "C", ["Unpublished", "Monthly"])],
      ),
    );
    expect(categories).toEqual([
      { name: "Safety", count: 2 },
      { name: "Training", count: 1 },
    ]);
    expect(cards.map((c) => [c.title, c.unpublished, c.frequency])).toEqual([
      ["A", false, null],
      ["B", true, null],
      ["C", true, "Monthly"],
    ]);
  });

  it("a list that cannot be proved complete fails: cards not matching the summed counts, no categories, an unreadable count", () => {
    expect(() => parseProcedureListing(listing([["Safety", "3"]], [procedureCard(bcsId(1), "A"), procedureCard(bcsId(2), "B")]))).toThrow(/held 2 procedures, not the 3/);
    /* A procedure under two categories would make the sum exceed the cards: refused, never guessed. */
    expect(() => parseProcedureListing(listing([["Safety", "1"], ["Training", "1"]], [procedureCard(bcsId(1), "A")]))).toThrow(/held 1 procedures, not the 2/);
    /* The categories alone (the shape the earlier contract assumed): no cards, so incomplete. */
    expect(() => parseProcedureListing(listing([["Safety", "2"]], []))).toThrow(/held 0 procedures, not the 2/);
    expect(() => parseProcedureListing(listing([], [procedureCard(bcsId(1), "A")]))).toThrow(/no categories/);
    expect(() => parseProcedureListing(listing([["Safety", "many"]], [procedureCard(bcsId(1), "A")]))).toThrow(/one readable count/);
    expect(() => parseProcedureListing({ Success: false, HTML: "" })).toThrow();
  });

  it("a procedure id anywhere but a verified card, or twice, fails the listing", () => {
    const strayLink = procedureCard(bcsId(1), "A").replace("</div></div>", `</div><a data-procedure-id="${bcsId(1)}">Open</a></div>`);
    expect(() => parseProcedureListing(listing([["Safety", "1"]], [strayLink]))).toThrow(/outside the verified procedure cards/);
    const noContainer = `<div class="procedure-card" data-procedure-id="${bcsId(1)}"><div class="entity-name">A</div></div>`;
    expect(() => parseProcedureListing(listing([["Safety", "1"]], [noContainer]))).toThrow(/outside the verified procedure cards/);
    const insideCategory = listing([["Safety", "1"]], []);
    insideCategory.HTML = insideCategory.HTML.replace('<div class="indicator">', `${procedureCard(bcsId(1), "A")}<div class="indicator">`);
    expect(() => parseProcedureListing(insideCategory)).toThrow(/outside the verified procedure cards/);
    expect(() => parseProcedureListing(listing([["Safety", "2"]], [procedureCard(bcsId(1), "A"), procedureCard(bcsId(1), "A again")]))).toThrow(/same item twice/);
  });

  it("an unknown badge fails the listing; a badge is read by its class, whatever its tag", () => {
    expect(() => parseProcedureListing(listing([["Safety", "1"]], [procedureCard(bcsId(1), "X", ["Archived"])]))).toThrow(/badge Ask Bubbles has not verified/);
    const divBadge = procedureCard(bcsId(1), "X").replace('<div><img', '<div class="badge badge-sm">Unpublished</div><div><img');
    expect(parseProcedureListing(listing([["Safety", "1"]], [divBadge])).cards[0]!.unpublished).toBe(true);
    const [card] = parseProcedureListing(listing([["Safety", "1"]], [procedureCard(bcsId(2), "Draft", ["Unpublished"])])).cards;
    expect(procedureRecord(card!, null)).toMatchObject({ publication: "unpublished", publicationReason: "unpublished", status: "Unpublished" });
  });

  it("reads the position line as the audience", () => {
    const { cards } = parseProcedureListing(
      listing([["Safety", "3"]], [procedureCard(bcsId(1), "A"), procedureCard(bcsId(2), "B", [], "General Manager, Trainer"), procedureCard(bcsId(3), "C", [], null)]),
    );
    expect(cards.map((c) => c.positions)).toEqual([["All Positions"], ["General Manager", "Trainer"], null]);
  });

  it("the fake Woven serves the same live structure", () => {
    const fake = new FakeBcsWoven();
    const html = (fake as unknown as { procedureListing: (c: unknown) => string }).procedureListing(fake.content[BCS_COMPANY_ID]);
    const { categories, cards } = parseProcedureListing({ Success: true, HTML: html });
    expect(cards).toHaveLength(categories.reduce((n, c) => n + c.count, 0));
  });

  it("reads the detail page's steps once each, without the 'Not Provided' placeholder", () => {
    const steps = `<div data-procedure-step-id="${bcsId(11)}"><div id="procedure-step-content"><p>Do one.</p></div></div><div data-procedure-step-id="${bcsId(12)}"><div id="procedure-step-content">Not Provided</div></div>`;
    const html = `<html><head><title>Procedures - Opening</title></head><body><div id="procedure-steps-container">${steps}</div><div id="procedure-steps-carousel">${steps}</div></body></html>`;
    expect(parseProcedureDetail(html)).toEqual({ title: "Opening", steps: [{ stepId: bcsId(11), text: "Do one." }, { stepId: bcsId(12), text: "" }] });
    const [card] = parseProcedureListing(listing([["Safety", "1"]], [procedureCard(bcsId(1), "Opening")])).cards;
    const record = procedureRecord(card!, html);
    expect(record.parts).toHaveLength(1);
    expect(record.parts[0]!.retrieval).toEqual({ kind: "available", locator: { procedureId: bcsId(1) } });
    /* No step structure: the text is BLOCKED, never guessed from the page. */
    expect(procedureRecord(card!, "<html><head><title>Procedures - Opening</title></head><body><p>text</p></body></html>").parts[0]!.retrieval).toEqual({
      kind: "blocked",
      capability: "procedure_content",
    });
    expect(() => procedureRecord(card!, "<html><head><title>Login</title></head></html>")).toThrow(/not the verified procedure page/);
  });
});

describe("File Library", () => {
  const row = (over: Partial<Parameters<typeof fileRow>[0]> = {}) =>
    fileRow({ id: bcsId(401), title: "Guide", ext: "pdf", status: "Published", audience: "All Teams All Positions", library: "Brand", updated: "2026-09-01T00:00:00Z", ...over });

  it("parses every verified column, and reads Woven's .NET ticks", () => {
    expect(ticksToIso(ticks("2026-09-01T00:00:00Z"))).toBe("2026-09-01T00:00:00.000Z");
    const [parsed] = parseFileLibraryRows({ list: [row()] });
    expect(parsed).toMatchObject({ id: bcsId(401), title: "Guide", extension: "pdf", status: "Published", publication: "published", audience: ["All Teams All Positions"], libraryLevel: "Brand", updatedAt: "2026-09-01T00:00:00.000Z" });
  });

  it("an unpublished file is unpublished; a video is unsupported; downloads are BLOCKED unless switched on", () => {
    const [unpublished, video, pdf] = parseFileLibraryRows({ list: [row({ id: bcsId(1), status: "Unpublished" }), row({ id: bcsId(2), ext: "mp4" }), row({ id: bcsId(3) })] });
    expect(fileLibraryRecord(unpublished!, { downloadEnabled: false })).toMatchObject({ publication: "unpublished", publicationReason: "unpublished" });
    expect(fileLibraryRecord(video!, { downloadEnabled: true }).parts[0]!.retrieval.kind).toBe("unsupported_format");
    expect(fileLibraryRecord(pdf!, { downloadEnabled: false }).parts[0]!.retrieval).toEqual({ kind: "blocked", capability: "file_library_download_unverified" });
    expect(fileLibraryRecord(pdf!, { downloadEnabled: true }).parts[0]!.retrieval).toEqual({ kind: "available", locator: { fileLibraryId: bcsId(3) } });
  });

  it("schema drift — shifted columns, an unknown status, a missing column — fails the whole listing", () => {
    const good = row();
    const shifted = { ...good, Column3: good.Column4, Column4: good.Column3 };
    expect(() => parseFileLibraryRows({ list: [good, shifted] })).toThrow();
    expect(() => parseFileLibraryRows({ list: [{ ...good, Column3: '<span class="hidden">3</span>Archived' }] })).toThrow(/not verified/);
    expect(() => parseFileLibraryRows({ list: [{ ...good, Column8: "Region" }] })).toThrow(/neither Brand nor Account/);
    expect(() => parseFileLibraryRows({ list: [{ ...good, Column6: "9/1/2026" }] })).toThrow(/updated date/);
    const { Column5: _drop, ...missing } = good;
    void _drop;
    expect(() => parseFileLibraryRows({ list: [missing] })).toThrow(/missing Column5/);
  });

  it("a list naming the same file twice is refused", () => {
    expect(() => parseFileLibraryRows({ list: [row(), row()] })).toThrow(/same item twice/);
  });
  /*
   * The audience cell as the LIVE diagnostic found it (6 October 2026), all 264
   * rows: "All Teams All Positions" ×159, "All Teams N Positions" ×35 and
   * "N Teams N Positions" ×2 as two badges; "Public" ×6 as one badge; and a
   * one-badge form ×62 whose sanitized shape "N / <x>" is consistent with
   * "N/A" — the only such form accepted: if it is anything else, the listing
   * fails (the live dry run is the check).
   */
  it("parses every verified audience form from the live badge markup", () => {
    const rows = parseFileLibraryRows({
      list: [
        row({ id: bcsId(1), audience: "All Teams All Positions" }),
        row({ id: bcsId(2), audience: "All Teams 3 Positions" }),
        row({ id: bcsId(3), audience: "2 Teams 5 Positions" }),
        row({ id: bcsId(4), audience: "N/A" }),
        row({ id: bcsId(5), audience: "Public" }),
      ],
    });
    expect(rows.map((r) => r.audience)).toEqual([["All Teams All Positions"], ["All Teams 3 Positions"], ["2 Teams 5 Positions"], ["N/A"], ["Public"]]);
    expect(row().Column4).toBe('<span class="badge badge-sm">All Teams</span><span class="badge badge-sm badge-light-blue-primary">All Positions</span>');
  });

  it("a 'Public' File Library item is parsed but NOT shareable: what Public grants there is unverified", () => {
    const [publicRow] = parseFileLibraryRows({ list: [row({ audience: "Public" })] });
    const record = fileLibraryRecord(publicRow!, { downloadEnabled: false });
    expect(bcsAudienceRestriction(record.audience, record)).toBe("audience_unverified");
  });

  it("an audience in any other form still fails the whole listing", () => {
    for (const audience of ["Everyone", "3 Locations", "All Teams", "Public, 2 Teams 3 Positions", "Managers Only"]) {
      expect(() => parseFileLibraryRows({ list: [row({ audience })] }), audience).toThrow(/audience was not in a verified form/);
    }
  });
});

describe("Communications", () => {
  it("drafts and 'Published – Not Visible' are held out by status; content is inventory-only", () => {
    const rows = parseCommunicationRows({
      list: [
        communicationRow({ id: bcsId(1), title: "Newsletter", key: "3", label: "Published – Not Visible", audience: "8 Teams 21 Positions" }),
        communicationRow({ id: bcsId(2), title: "Pour", key: "1", label: "Draft", audience: "All Teams All Positions" }),
      ],
    });
    expect(rows.map((r) => [r.publication, r.publicationReason])).toEqual([
      ["unpublished", "published_not_visible"],
      ["unpublished", "draft"],
    ]);
    const record = communicationRecord(rows[0]!);
    expect(record.parts[0]!.retrieval).toEqual({ kind: "blocked", capability: "communication_detail_unverified" });
    /* "Created By" is a person: never carried. */
    expect(JSON.stringify(record)).not.toContain("A Person");
  });

  /*
   * The audience cell as the LIVE diagnostic found it (6 October 2026), all 133
   * rows: `div.no-wrap` holding two badges — "N Teams N Positions" ×119,
   * "N Team N Positions" ×7, "N Teams All Positions" ×4, "N Team N Position"
   * ×2 — or one "Public" badge ×1.
   */
  it("parses every verified audience form from the live markup; 'Public' is parsed but not shareable", () => {
    const rows = parseCommunicationRows({
      list: [
        communicationRow({ id: bcsId(1), title: "A", key: "3", label: "Published – Not Visible", audience: "8 Teams 21 Positions" }),
        communicationRow({ id: bcsId(2), title: "B", key: "3", label: "Published – Not Visible", audience: "1 Team 4 Positions" }),
        communicationRow({ id: bcsId(3), title: "C", key: "3", label: "Published – Not Visible", audience: "2 Teams All Positions" }),
        communicationRow({ id: bcsId(4), title: "D", key: "1", label: "Draft", audience: "1 Team 1 Position" }),
        communicationRow({ id: bcsId(5), title: "E", key: "3", label: "Published – Not Visible", audience: "Public" }),
      ],
    });
    expect(rows.map((r) => r.audience)).toEqual([["8 Teams 21 Positions"], ["1 Team 4 Positions"], ["2 Teams All Positions"], ["1 Team 1 Position"], ["Public"]]);
    const publicRecord = communicationRecord(rows[4]!);
    expect(bcsAudienceRestriction(publicRecord.audience, publicRecord)).toBe("audience_unverified");
    expect(() =>
      parseCommunicationRows({ list: [communicationRow({ id: bcsId(6), title: "F", key: "1", label: "Draft", audience: "Store Managers" })] }),
    ).toThrow(/audience was not in a verified form/);
  });

  it("the unobserved published-and-visible status fails the listing until it is verified", () => {
    expect(() => parseCommunicationRows({ list: [communicationRow({ id: bcsId(1), title: "X", key: "2", label: "Published", audience: "All Teams All Positions" })] })).toThrow(
      /status Ask Bubbles has not verified/,
    );
  });
});

describe("audience and ownership rules", () => {
  it("only company-wide audiences pass; narrower ones are restricted; unclear ones are unclear; 'All Positions' waits for a decision", () => {
    const file = { contentType: "file_library" } as const;
    const procedure = { contentType: "procedure" } as const;
    expect(bcsAudienceRestriction(["All Teams All Positions"], file)).toBeNull();
    expect(bcsAudienceRestriction(["All Positions"], procedure)).toBeNull();
    expect(bcsAudienceRestriction(["8 Teams 21 Positions"], file)).toBe("audience_restricted");
    expect(bcsAudienceRestriction(["All Teams 3 Positions"], file)).toBe("audience_restricted");
    expect(bcsAudienceRestriction(["1 Team 1 Position"], { contentType: "communication" })).toBe("audience_restricted");
    expect(bcsAudienceRestriction(["General Manager", "Trainer"], procedure)).toBe("audience_restricted");
    expect(bcsAudienceRestriction(["N/A"], file)).toBe("audience_unclear");
    expect(bcsAudienceRestriction(null, file)).toBe("audience_unclear");
  });

  it("Production launch rule: ONLY 'All Teams All Positions' on a File Library item is shared automatically", () => {
    /* "Public" is never company-wide for this launch — not even on a Handbook. */
    for (const contentType of ["file_library", "communication", "procedure", "policy", "handbook"] as const) {
      expect(bcsAudienceRestriction(["Public"], { contentType })).toBe("audience_unverified");
    }
    /* "All Teams All Positions" outside the File Library is unverified. */
    for (const contentType of ["communication", "procedure", "policy", "handbook"] as const) {
      expect(bcsAudienceRestriction(["All Teams All Positions"], { contentType })).toBe("audience_unverified");
    }
    /* "All Positions" is reviewable only on a procedure. */
    expect(bcsAudienceRestriction(["All Positions"], { contentType: "handbook" })).toBe("audience_unverified");
    /* A mix is never more than its narrowest label. */
    const file = { contentType: "file_library" } as const;
    expect(bcsAudienceRestriction(["All Teams All Positions", "2 Teams 3 Positions"], file)).toBe("audience_restricted");
    expect(bcsAudienceRestriction(["All Teams All Positions", "N/A"], file)).toBe("audience_unclear");
  });

  it("JB & Associates / Sun Tan City titles are held for an ownership check", () => {
    for (const title of ["JBA Policy Manual 2025", "NE Sick Time", "2025 JBA Policy Manual - Edited 5-2025", "Sun Tan City Lotion", "JB & Associates memo"]) {
      expect(bcsOwnershipHold({ entityId: bcsId(1), title })).toBe("ownership_review");
    }
    for (const title of ["Dress Code", "Cell Phone Policy", "Barrel Delivery & Receiving Procedures", "Neighbourhood Sick Time Notes"]) {
      expect(bcsOwnershipHold({ entityId: bcsId(1), title })).toBeNull();
    }
  });
});

/**
 * The /Company structure the LIVE read-only diagnostic found (6 October 2026),
 * sanitized: an "Account Management" page with no visible Company ID; the id
 * only in inline scripts under `companyid` (head), `wovenCompanyID` and
 * `companyId` (body); the company name in the account menu; other ids under
 * other keys; the Switch Account list carrying every company's id. Values are
 * invented except the pinned id.
 */
function liveCompanyPage(o: { companyid?: string; wovenCompanyID?: string; companyId?: string; menuName?: string; extraScript?: string } = {}) {
  const userId = bcsId(77001);
  const head = o.companyid === undefined ? "" : `<script defer>window.wovenAnalytics && wovenAnalytics.group({ companyid: '${o.companyid}', userid: '${userId}' });</script>`;
  const woven = o.wovenCompanyID === undefined ? "" : `var wovenCompanyID = '${o.wovenCompanyID}'; `;
  const chat = o.companyId === undefined ? "" : `initChat({ companyId: "${o.companyId}", userId: "${userId}" });`;
  return `<!DOCTYPE html><html><head><title>Account Management</title>${head}</head>
    <body class="nav-static chat-sidebar-container checking-nav-xs ">
    <ul><li class="dropdown"><a href="#" class="dropdown-toggle fw-500 flex flex-vcenter color-primary" data-toggle="dropdown"><div class="ml-sm visible-lg"><div>Integration User</div><div><small class="text-grey fw-300">${o.menuName ?? "Midwest Soap Makers"}</small></div></div></a></li></ul>
    <main><h1>Account Management</h1><input type="hidden" name="SecurityDummyField" id="SecurityDummyField" value=""></main>
    <div class="modal"><a data-company-id="${JBA_COMPANY_ID}">JB &amp; Associates</a><a data-company-id="${BCS_COMPANY_ID}">Midwest Soap Makers</a></div>
    <script defer>${woven}var wovenUserID = '${userId}';</script><script>${chat}${o.extraScript ?? ""}</script></body></html>`;
}

describe("the Company page — the live structure (inline script keys + account menu)", () => {
  const all = { companyid: BCS_COMPANY_ID, wovenCompanyID: BCS_COMPANY_ID.toLowerCase(), companyId: BCS_COMPANY_ID };

  it("proves the pinned company from the script keys, with no visible Company ID, ignoring other ids and the Switch Account list", () => {
    expect(companyIdsOnPage(liveCompanyPage(all))).toEqual([BCS_COMPANY_ID.toLowerCase()]);
    expect(() => assertCompanyPage(liveCompanyPage(all))).not.toThrow();
    /* Each verified key on its own is a reading. */
    for (const key of ["companyid", "wovenCompanyID", "companyId"] as const) {
      expect(() => assertCompanyPage(liveCompanyPage({ [key]: BCS_COMPANY_ID }))).not.toThrow();
    }
  });

  it("any script key naming another company fails the run (mismatch), whichever key it is", () => {
    for (const key of ["companyid", "wovenCompanyID", "companyId"] as const) {
      expect(() => assertCompanyPage(liveCompanyPage({ ...all, [key]: JBA_COMPANY_ID }))).toThrow(/not in Midwest Soap Makers/);
    }
    expect(() => assertCompanyPage(liveCompanyPage({ ...all, extraScript: `config.companyId = '${JBA_COMPANY_ID}';` }))).toThrow(/not in Midwest Soap Makers/);
  });

  it("the pinned id only under an unrelated key, or no company key at all, is not proof", () => {
    expect(() => assertCompanyPage(liveCompanyPage({ extraScript: `var parentCompanyId = '${BCS_COMPANY_ID}'; var userId = '${BCS_COMPANY_ID}';` }))).toThrow(/could not find the Company ID/);
    expect(() => assertCompanyPage(liveCompanyPage({}))).toThrow(/could not find the Company ID/);
  });

  it("the right id with another company named in the account menu fails; the name alone never passes", () => {
    expect(() => assertCompanyPage(liveCompanyPage({ ...all, menuName: "JB &amp; Associates - Corporate" }))).toThrow(/not the name Midwest Soap Makers/);
    expect(() => assertCompanyPage(liveCompanyPage({ menuName: "Midwest Soap Makers" }))).toThrow(/could not find the Company ID/);
  });
});

describe("the Company page", () => {
  const page = (inner: string) =>
    `<html><body><main>${inner}</main><div class="modal"><a data-company-id="${JBA_COMPANY_ID}">JB &amp; Associates</a><a data-company-id="${BCS_COMPANY_ID}">Midwest Soap Makers</a></div></body></html>`;

  it("reads the id after the 'Company ID' label or in a CompanyID input — never from data-company-id", () => {
    expect(companyIdsOnPage(page(`<label>Company ID</label><div>${BCS_COMPANY_ID}</div>`))).toEqual([BCS_COMPANY_ID.toLowerCase()]);
    expect(companyIdsOnPage(page(`<input name="CompanyID" value="${BCS_COMPANY_ID}">`))).toEqual([BCS_COMPANY_ID.toLowerCase()]);
    expect(companyIdsOnPage(page("<p>No id here</p>"))).toEqual([]);
  });

  it("passes only when every id shown is the expected one", () => {
    expect(() => assertCompanyPage(page(`<label>Company</label> Midwest Soap Makers <label>Company ID</label> ${BCS_COMPANY_ID.toLowerCase()}`))).not.toThrow();
    expect(() => assertCompanyPage(page(`<label>Company ID</label> ${JBA_COMPANY_ID}`))).toThrow(/not in Midwest Soap Makers/);
    expect(() => assertCompanyPage(page("<p>nothing</p>"))).toThrow(/could not find the Company ID/);
    expect(() =>
      assertCompanyPage(page(`<label>Company ID</label> ${BCS_COMPANY_ID} <label>Company ID</label> ${JBA_COMPANY_ID}`)),
    ).toThrow(/not in Midwest Soap Makers/);
  });
});
