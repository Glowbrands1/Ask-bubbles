import { describe, expect, it } from "vitest";

import { communicationRecord, parseCommunicationRows } from "./adapters/communications";
import { fileLibraryRecord, parseFileLibraryRows } from "./adapters/file-library";
import { handbookRecord, parseHandbookRows } from "./adapters/handbooks";
import { parsePolicyCards, parsePolicyDetail, policyRecord, withPolicyDetail } from "./adapters/policies";
import { parseProcedureDetail, parseProcedureSearch, procedureRecord } from "./adapters/procedures";
import { ticksToIso } from "./adapters/shared";
import { assertCompanyPage, companyIdsOnPage, companyReadingsOnPage } from "./company-guard";
import { bcsAudienceRestriction, bcsOwnershipHold } from "./policy";
import { BCS_COMPANY_ID, JBA_COMPANY_ID, bcsId, communicationRow, fileRow, ticks } from "./test-support";

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

/*
 * The procedure search's VERIFIED_LIVE structure (sanitized probe of the
 * Midwest Soap Makers response): one `{ Success, HTML }` with every category
 * card, then every procedure card in `#procedures-container`; each card names
 * its category slug as a class; the position text sits in the image wrapper's
 * sibling.
 */
const liveCategory = (slug: string, indicator: string) =>
  `<div class="col-md-6"><div class="woven-summary-container woven-summary-container-display medium-left-display has-action mb-sm" data-procedure-category-name="${slug}"><div class="card-left"><img src="/i.svg" alt="" /></div><div class="card-center flex-center-content flex-hcenter"><div class="entity-name">${slug.replace(/-/g, " ")}</div></div><div class="card-right"><div class="indicator">${indicator}</div><div class="chevron"><i class="fas fa-chevron-right"></i></div></div></div></div>`;
const liveProcedure = (id: string, title: string, classes: string, badges: string[] = [], positions: string | null = "All Positions") =>
  `<div class="woven-summary-container woven-summary-container-display isotope-grid-item medium-left-display has-action mb-sm ${classes}" data-procedure-id="${id}"><div class="card-left"><img src="/p.svg" alt="" /></div><div class="card-center flex-center-content"><div class="entity-name">${title}</div><div class="mb-xs">Some Line</div><div class="mb-xs">${badges.map((b) => `<span class="badge badge-red-primary mr-sm">${b}</span>`).join("")}</div>${positions === null ? "" : `<div class="flex flex-vcenter"><div><img id="positions-assigned-image" src="/pos.svg" alt="" /></div><div class="mt-2xs ml-sm">${positions}</div></div>`}</div><div class="card-right"><div class="chevron"><i class="fas fa-chevron-right"></i></div></div></div>`;
const liveSearch = (categories: string, cards: string) => ({
  Success: true,
  HTML: `<div class="row">${categories}</div><div id="procedures-container" class="col-xs-12 hidden"><div class="procedure-grid">${cards}</div></div>`,
});

describe("procedures (VERIFIED_LIVE single-response structure)", () => {
  it("reads every category and every procedure card from the one response, reconciled per category and in total", () => {
    const listing = parseProcedureSearch(
      liveSearch(
        liveCategory("general-operations", "2") + liveCategory("safety", "1"),
        liveProcedure(bcsId(1), "Opening", "general-operations") + liveProcedure(bcsId(2), "Closing", "general-operations", ["Unpublished"]) + liveProcedure(bcsId(3), "Fire", "safety"),
      ),
    );
    expect(listing.categories).toEqual([
      { name: "general-operations", count: 2 },
      { name: "safety", count: 1 },
    ]);
    expect(listing.cards.map((c) => [c.id, c.title, c.category, c.unpublished])).toEqual([
      [bcsId(1), "Opening", "general-operations", false],
      [bcsId(2), "Closing", "general-operations", true],
      [bcsId(3), "Fire", "safety", false],
    ]);
  });

  it("reads the live position line (text in the image wrapper's sibling) as the audience", () => {
    const { cards } = parseProcedureSearch(
      liveSearch(
        liveCategory("safety", "3"),
        liveProcedure(bcsId(1), "A", "safety") + liveProcedure(bcsId(2), "B", "safety", [], "General Manager, Trainer") + liveProcedure(bcsId(3), "C", "safety", [], null),
      ),
    );
    expect(cards.map((c) => c.positions)).toEqual([["All Positions"], ["General Manager", "Trainer"], null]);
    /* The position text is read from the card's own row only, never from a neighbouring card. */
    const lone = `<div class="woven-summary-container safety" data-procedure-id="${bcsId(9)}"><div class="entity-name">Lone</div><div><img id="positions-assigned-image" /></div></div>`;
    expect(parseProcedureSearch(liveSearch(liveCategory("safety", "1"), lone)).cards[0]!.positions).toBeNull();
  });

  it("reads publication from the badges: Unpublished (also beside a frequency) is a draft; no badge is published", () => {
    const { cards } = parseProcedureSearch(
      liveSearch(
        liveCategory("safety", "4"),
        liveProcedure(bcsId(1), "Published One", "safety") +
          liveProcedure(bcsId(2), "Draft", "safety", ["Unpublished"]) +
          liveProcedure(bcsId(3), "Monthly Draft", "safety", ["Unpublished | Monthly"]) +
          liveProcedure(bcsId(4), "Monthly", "safety", ["Monthly"]),
      ),
    );
    expect(cards.map((c) => [c.title, c.unpublished, c.frequency])).toEqual([
      ["Published One", false, null],
      ["Draft", true, null],
      ["Monthly Draft", true, "Monthly"],
      ["Monthly", false, "Monthly"],
    ]);
    expect(procedureRecord(cards[1]!, null)).toMatchObject({ publication: "unpublished", publicationReason: "unpublished", status: "Unpublished" });
    expect(procedureRecord(cards[0]!, null)).toMatchObject({ publication: "published", audience: ["All Positions"] });
  });

  it("an unknown badge fails the listing (publication filtering is not loosened)", () => {
    expect(() => parseProcedureSearch(liveSearch(liveCategory("safety", "1"), liveProcedure(bcsId(1), "X", "safety", ["Archived"])))).toThrow(/badge Ask Bubbles has not verified/);
  });

  it("fails closed when a category's cards do not number its indicator", () => {
    const tooFew = liveSearch(liveCategory("safety", "2") + liveCategory("training", "1"), liveProcedure(bcsId(1), "A", "safety") + liveProcedure(bcsId(2), "B", "training"));
    expect(() => parseProcedureSearch(tooFew)).toThrow(/"safety" procedures numbered 1, not the 2/);
    const tooMany = liveSearch(liveCategory("safety", "1"), liveProcedure(bcsId(1), "A", "safety") + liveProcedure(bcsId(2), "B", "safety"));
    expect(() => parseProcedureSearch(tooMany)).toThrow(/numbered 2, not the 1/);
  });

  it("fails closed on the old categories-only answer: the indicators promise procedures that are not there", () => {
    expect(() => parseProcedureSearch(liveSearch(liveCategory("safety", "2"), ""))).toThrow(/numbered 0, not the 2/);
  });

  it("fails closed when categories are missing, or a count is unreadable", () => {
    expect(() => parseProcedureSearch(liveSearch("", liveProcedure(bcsId(1), "A", "safety")))).toThrow(/no categories/);
    expect(() => parseProcedureSearch({ Success: true, HTML: "" })).toThrow(/no categories/);
    expect(() => parseProcedureSearch(liveSearch(liveCategory("safety", "many"), liveProcedure(bcsId(1), "A", "safety")))).toThrow(/one readable count/);
    const twoIndicators = liveCategory("safety", "1").replace('<div class="chevron">', '<div class="indicator">1</div><div class="chevron">');
    expect(() => parseProcedureSearch(liveSearch(twoIndicators, liveProcedure(bcsId(1), "A", "safety")))).toThrow(/one readable count/);
    /* A card whose category has no category card: it is missing, never quietly dropped. */
    expect(() => parseProcedureSearch(liveSearch(liveCategory("safety", "1"), liveProcedure(bcsId(1), "A", "safety") + liveProcedure(bcsId(2), "B", "recipes")))).toThrow(
      /named none of the listed categories/,
    );
  });

  it("fails closed on an ambiguous structure", () => {
    const cats = liveCategory("safety", "1") + liveCategory("training", "1");
    /* A card in two categories. */
    expect(() => parseProcedureSearch(liveSearch(cats, liveProcedure(bcsId(1), "A", "safety training") + liveProcedure(bcsId(2), "B", "training")))).toThrow(/more than one category/);
    /* The same procedure on two cards. */
    expect(() => parseProcedureSearch(liveSearch(cats, liveProcedure(bcsId(1), "A", "safety") + liveProcedure(bcsId(1), "A", "training")))).toThrow(/same item twice/);
    /* A procedure card inside a category card. */
    const nested = liveCategory("safety", "1").replace('<div class="card-left">', `${liveProcedure(bcsId(1), "A", "safety")}<div class="card-left">`);
    expect(() => parseProcedureSearch(liveSearch(nested, ""))).toThrow(/mixed together/);
    /* A card that is also a category card. */
    const hybrid = liveProcedure(bcsId(1), "A", "safety").replace("data-procedure-id=", 'data-procedure-category-name="safety" data-procedure-id=');
    expect(() => parseProcedureSearch(liveSearch(liveCategory("safety", "1"), hybrid))).toThrow();
    /* A card holding another procedure's card. */
    const inner = liveProcedure(bcsId(1), "A", "safety").replace('<div class="card-right">', `<a data-procedure-id="${bcsId(2)}">x</a><div class="card-right">`);
    expect(() => parseProcedureSearch(liveSearch(liveCategory("safety", "1"), inner))).toThrow(/held another procedure/);
  });

  it("an inner link repeating its own card's id is the same card", () => {
    const withLink = liveProcedure(bcsId(1), "A", "safety").replace('<div class="card-right">', `<a href="/KnowledgeCenter/Procedure/${bcsId(1)}" data-procedure-id="${bcsId(1)}">Open</a><div class="card-right">`);
    expect(parseProcedureSearch(liveSearch(liveCategory("safety", "1"), withLink)).cards.map((c) => c.id)).toEqual([bcsId(1)]);
  });

  it("the live totals reconcile: 12 categories summing to 51, with 51 cards (46 drafts)", () => {
    const counts: [string, number][] = [
      ["cash-management", 1], ["cleaning", 1], ["customer-service", 1], ["daily-tasks", 1], ["general-operations", 17], ["inventory", 1],
      ["management", 3], ["ordering", 1], ["recipes", 6], ["safety", 6], ["technology", 1], ["training", 12],
    ];
    let n = 0;
    const cards = counts.flatMap(([slug, count]) => Array.from({ length: count }, () => (n += 1)).map((i) => liveProcedure(bcsId(1000 + i), `P${i}`, slug, i <= 46 ? ["Unpublished"] : [])));
    const listing = parseProcedureSearch(liveSearch(counts.map(([slug, count]) => liveCategory(slug, String(count))).join(""), cards.join("")));
    expect(listing.categories).toHaveLength(12);
    expect(listing.cards).toHaveLength(51);
    expect(listing.cards.filter((c) => !c.unpublished)).toHaveLength(5);
  });

  it("reads the detail page's steps once each, without the 'Not Provided' placeholder", () => {
    const steps = `<div data-procedure-step-id="${bcsId(11)}"><div id="procedure-step-content"><p>Do one.</p></div></div><div data-procedure-step-id="${bcsId(12)}"><div id="procedure-step-content">Not Provided</div></div>`;
    const html = `<html><head><title>Procedures - Opening</title></head><body><div id="procedure-steps-container">${steps}</div><div id="procedure-steps-carousel">${steps}</div></body></html>`;
    expect(parseProcedureDetail(html)).toEqual({ title: "Opening", steps: [{ stepId: bcsId(11), text: "Do one." }, { stepId: bcsId(12), text: "" }] });
    const [card] = parseProcedureSearch(liveSearch(liveCategory("safety", "1"), liveProcedure(bcsId(1), "Opening", "safety"))).cards;
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

  it("VERIFIED_LIVE 'Public' audience parses; it stays BLOCKED while downloads are off; unknown audiences still fail", () => {
    const [publicRow] = parseFileLibraryRows({ list: [row({ id: bcsId(7), audience: "Public" })] });
    expect(publicRow).toMatchObject({ audience: ["Public"], publication: "published" });
    expect(fileLibraryRecord(publicRow!, { downloadEnabled: false }).parts[0]!.retrieval).toEqual({ kind: "blocked", capability: "file_library_download_unverified" });
    /* Every live audience shape parses in one listing. */
    const live = ["N/A", "All Teams All Positions", "Public", "All Teams 3 Positions", "9 Teams 21 Positions", "10 Teams 21 Positions"];
    expect(parseFileLibraryRows({ list: live.map((audience, i) => row({ id: bcsId(10 + i), audience })) })).toHaveLength(6);
    for (const audience of ["Public Everyone", "Publicly", "Everyone", "Managers"]) {
      expect(() => parseFileLibraryRows({ list: [row({ audience })] })).toThrow(/audience was not in a verified form/);
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

  it("VERIFIED_LIVE 'Public' audience parses, and stays held out by its non-visible or draft status; unknown audiences still fail", () => {
    const rows = parseCommunicationRows({
      list: [
        communicationRow({ id: bcsId(1), title: "All Hands", key: "3", label: "Published – Not Visible", audience: "Public" }),
        communicationRow({ id: bcsId(2), title: "Draft Note", key: "1", label: "Draft", audience: "Public" }),
      ],
    });
    expect(rows.map((r) => [r.audience, r.publication, r.publicationReason])).toEqual([
      [["Public"], "unpublished", "published_not_visible"],
      [["Public"], "unpublished", "draft"],
    ]);
    expect(communicationRecord(rows[0]!)).toMatchObject({ publication: "unpublished" });
    expect(communicationRecord(rows[0]!).parts[0]!.retrieval).toEqual({ kind: "blocked", capability: "communication_detail_unverified" });
    /* A Public audience does not make the unobserved visible status acceptable. */
    expect(() => parseCommunicationRows({ list: [communicationRow({ id: bcsId(3), title: "X", key: "2", label: "Published", audience: "Public" })] })).toThrow(/status Ask Bubbles has not verified/);
    for (const audience of ["Public Everyone", "Everyone"]) {
      expect(() => parseCommunicationRows({ list: [communicationRow({ id: bcsId(4), title: "X", key: "3", label: "Published – Not Visible", audience })] })).toThrow(/audience was not in a verified form/);
    }
  });

  it("the unobserved published-and-visible status fails the listing until it is verified", () => {
    expect(() => parseCommunicationRows({ list: [communicationRow({ id: bcsId(1), title: "X", key: "2", label: "Published", audience: "All Teams All Positions" })] })).toThrow(
      /status Ask Bubbles has not verified/,
    );
  });
});

describe("audience and ownership rules", () => {
  it("only company-wide audiences pass; narrower ones are restricted; unclear ones are unclear; 'All Positions' waits for a decision", () => {
    expect(bcsAudienceRestriction(["Public"])).toBeNull();
    expect(bcsAudienceRestriction(["All Teams All Positions"])).toBeNull();
    expect(bcsAudienceRestriction(["All Positions"])).toBeNull();
    expect(bcsAudienceRestriction(["8 Teams 21 Positions"])).toBe("audience_restricted");
    expect(bcsAudienceRestriction(["All Teams 3 Positions"])).toBe("audience_restricted");
    expect(bcsAudienceRestriction(["General Manager", "Trainer"])).toBe("audience_restricted");
    expect(bcsAudienceRestriction(["N/A"])).toBe("audience_unclear");
    expect(bcsAudienceRestriction(null)).toBe("audience_unclear");
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

describe("the Company page (VERIFIED_LIVE structure, sanitized)", () => {
  const BCS = BCS_COMPANY_ID.toLowerCase();
  const JB = JBA_COMPANY_ID.toLowerCase();
  const EMPLOYEE = "e0e0e0e0-0000-4000-8000-0000000000e1";
  /* The Switch Account list names BOTH companies on every page; it must never count. */
  const shell = (inner: string) =>
    `<html><head><title>Account Management</title></head><body><main>${inner}</main><div class="modal"><a class="switch-account" data-company-id="${JBA_COMPANY_ID}">JB &amp; Associates</a><a class="switch-account" data-company-id="${BCS_COMPANY_ID}">Midwest Soap Makers</a></div></body></html>`;
  const readings = (o: { analytics?: string; storage?: string; realtime?: string; context?: string; chat?: string; name?: string } = {}) => {
    const v = { analytics: BCS, storage: BCS, realtime: BCS, context: BCS, chat: BCS, name: "Midwest Soap Makers", ...o };
    return [
      `<script>amplitude.getInstance().identify(new amplitude.Identify().setOnce('employeeid', '${EMPLOYEE}').setOnce('companyid', '${v.analytics}'));</script>`,
      `<script>$(function () { WovenApp.initWovenChat('${v.chat}', '${EMPLOYEE}', 'Integration User'); });</script>`,
      `<script>WovenApp.setWithExpiry("wovenEmployeeID", "${EMPLOYEE}", 172800); WovenApp.setWithExpiry("wovenCompanyID", "${v.storage}", 172800);</script>`,
      `<script>WovenBroadcastChannel.joinSignalRGroups(["timeclocks-${v.realtime}"]); WovenBroadcastChannel.joinSignalRGroups(["company-${v.realtime}"]);</script>`,
      `<div id="knowledge-overlay-sources-list"><script>window.k = { brandName: 'Buff City Soap', companyId: '${v.context}', companyName: '${v.name}', };</script></div>`,
    ];
  };
  const realPage = (o?: Parameters<typeof readings>[0]) => shell(readings(o).join(""));

  it("reads the four session-detail readings and the session's company name — never data-company-id", () => {
    const r = companyReadingsOnPage(realPage());
    expect(r.proofs.map((p) => p.kind).sort()).toEqual(["analytics", "context_object", "realtime_group", "session_storage"]);
    expect(new Set(r.proofs.map((p) => p.id))).toEqual(new Set([BCS]));
    expect(r.conflictOnly).toEqual([{ kind: "chat_initialiser", id: BCS }]);
    expect(r.names).toEqual(["Midwest Soap Makers"]);
    expect(companyIdsOnPage(realPage())).toEqual([BCS]);
    /* The switch list's JB id is on the page and is not read. */
    expect(companyIdsOnPage(shell("<p>nothing</p>"))).toEqual([]);
  });

  it("the real page passes", () => {
    expect(() => assertCompanyPage(realPage())).not.toThrow();
  });

  it.each(["analytics", "storage", "realtime", "context", "chat"] as const)("JB & Associates' id in the %s reading fails as a mismatch", (where) => {
    expect(() => assertCompanyPage(realPage({ [where]: JB }))).toThrow(/not in Midwest Soap Makers/);
  });

  it("the other company everywhere fails as a mismatch", () => {
    expect(() => assertCompanyPage(realPage({ analytics: JB, storage: JB, realtime: JB, context: JB, chat: JB, name: "JB & Associates" }))).toThrow(/not in Midwest Soap Makers/);
  });

  it("one kind of reading is not proof; two agreeing kinds are", () => {
    const one = shell(readings()[4]!);
    expect(() => assertCompanyPage(one)).toThrow(/in only 1 place/);
    const two = shell(readings()[2]! + readings()[4]!);
    expect(() => assertCompanyPage(two)).not.toThrow();
  });

  it("the conflict-only chat reading never proves anything on its own", () => {
    expect(() => assertCompanyPage(shell(readings()[1]!))).toThrow(/could not find the Company ID/);
  });

  it("no reading of the active company fails closed", () => {
    expect(() => assertCompanyPage(shell("<p>nothing</p>"))).toThrow(/could not find the Company ID/);
  });

  it("the right id under another company name fails; a missing name fails", () => {
    expect(() => assertCompanyPage(realPage({ name: "JB &amp; Associates" }))).toThrow(/under another company name/);
    const noName = shell(readings().slice(0, 4).join(""));
    expect(() => assertCompanyPage(noName)).toThrow(/not the name Midwest Soap Makers/);
  });

  it("the legacy label and input are further readings: they must agree, and alone they are one place", () => {
    expect(() => assertCompanyPage(shell(`<label>Company</label> Midwest Soap Makers <label>Company ID</label> ${BCS}`))).toThrow(/in only 1 place/);
    expect(() => assertCompanyPage(realPage() .replace("<main>", `<main><label>Company ID</label> ${JB}`))).toThrow(/not in Midwest Soap Makers/);
    expect(() => assertCompanyPage(shell(`<label>Company</label> Midwest Soap Makers <label>Company ID</label> ${BCS} <input name="CompanyID" value="${BCS}">`))).not.toThrow();
  });
});
