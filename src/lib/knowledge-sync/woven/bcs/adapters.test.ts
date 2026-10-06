import { describe, expect, it } from "vitest";

import { communicationRecord, parseCommunicationRows } from "./adapters/communications";
import { fileLibraryRecord, parseFileLibraryRows } from "./adapters/file-library";
import { handbookRecord, parseHandbookRows } from "./adapters/handbooks";
import { parsePolicyCards, parsePolicyDetail, policyRecord, withPolicyDetail } from "./adapters/policies";
import { parseProcedureCards, parseProcedureCategories, parseProcedureDetail, procedureRecord, unionProcedureCards } from "./adapters/procedures";
import { ticksToIso } from "./adapters/shared";
import { assertCompanyPage, companyIdsOnPage } from "./company-guard";
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

const categoryCards = (cats: [string, string][]) =>
  cats.map(([name, n]) => `<div data-procedure-category-name="${name}"><h4>${name}</h4><span class="indicator">${n}</span></div>`).join("");
const procedureCard = (id: string, title: string, badges: string[] = [], positions: string | null = "All Positions") =>
  `<div class="woven-summary-container" data-procedure-id="${id}"><div class="entity-name">${title}</div><div>Safety</div>${badges.map((b) => `<span class="badge">${b}</span>`).join("")}${positions === null ? "" : `<div><img id="positions-assigned-image"> ${positions}</div>`}<a data-procedure-id="${id}">Open</a></div>`;

describe("procedures", () => {
  it("reads categories with their indicator counts, and refuses a list that cannot be proved complete", () => {
    expect(parseProcedureCategories({ Success: true, HTML: categoryCards([["Safety", "2"], ["Training", "12"]]) })).toEqual([
      { name: "Safety", count: 2 },
      { name: "Training", count: 12 },
    ]);
    expect(() => parseProcedureCategories({ Success: true, HTML: categoryCards([["Safety", "many"]]) })).toThrow(/one readable count/);
    expect(() => parseProcedureCategories({ Success: true, HTML: "" })).toThrow(/no categories/);
    expect(() => parseProcedureCategories({ Success: true, HTML: procedureCard(bcsId(1), "X") })).toThrow(/procedures where categories/);
  });

  it("reads publication from the badges: Unpublished (also beside a frequency) is a draft; no badge is published", () => {
    const cards = parseProcedureCards(
      {
        Success: true,
        HTML: procedureCard(bcsId(1), "Published One") + procedureCard(bcsId(2), "Draft", ["Unpublished"]) + procedureCard(bcsId(3), "Monthly Draft", ["Unpublished | Monthly"]) + procedureCard(bcsId(4), "Monthly", ["Monthly"]),
      },
      { name: "Safety", count: 4 },
    );
    expect(cards.map((c) => [c.title, c.unpublished, c.frequency])).toEqual([
      ["Published One", false, null],
      ["Draft", true, null],
      ["Monthly Draft", true, "Monthly"],
      ["Monthly", false, "Monthly"],
    ]);
    expect(procedureRecord(cards[1]!, null)).toMatchObject({ publication: "unpublished", publicationReason: "unpublished", status: "Unpublished" });
  });

  it("an unknown badge, or a count that does not match the indicator, fails the listing", () => {
    expect(() => parseProcedureCards({ Success: true, HTML: procedureCard(bcsId(1), "X", ["Archived"]) }, { name: "Safety", count: 1 })).toThrow(/badge Ask Bubbles has not verified/);
    expect(() => parseProcedureCards({ Success: true, HTML: procedureCard(bcsId(1), "X") }, { name: "Safety", count: 2 })).toThrow(/not the 2 its category shows/);
  });

  it("reads the position line as the audience", () => {
    const [all, limited, none] = parseProcedureCards(
      { Success: true, HTML: procedureCard(bcsId(1), "A") + procedureCard(bcsId(2), "B", [], "General Manager, Trainer") + procedureCard(bcsId(3), "C", [], null) },
      { name: "Safety", count: 3 },
    );
    expect([all!.positions, limited!.positions, none!.positions]).toEqual([["All Positions"], ["General Manager", "Trainer"], null]);
  });

  it("a procedure in two categories is one procedure", () => {
    const a = parseProcedureCards({ Success: true, HTML: procedureCard(bcsId(1), "A") }, { name: "Safety", count: 1 });
    const b = parseProcedureCards({ Success: true, HTML: procedureCard(bcsId(1), "A") + procedureCard(bcsId(2), "B") }, { name: "Training", count: 2 });
    expect(unionProcedureCards([a, b]).map((c) => c.id)).toEqual([bcsId(1), bcsId(2)]);
  });

  it("reads the detail page's steps once each, without the 'Not Provided' placeholder", () => {
    const steps = `<div data-procedure-step-id="${bcsId(11)}"><div id="procedure-step-content"><p>Do one.</p></div></div><div data-procedure-step-id="${bcsId(12)}"><div id="procedure-step-content">Not Provided</div></div>`;
    const html = `<html><head><title>Procedures - Opening</title></head><body><div id="procedure-steps-container">${steps}</div><div id="procedure-steps-carousel">${steps}</div></body></html>`;
    expect(parseProcedureDetail(html)).toEqual({ title: "Opening", steps: [{ stepId: bcsId(11), text: "Do one." }, { stepId: bcsId(12), text: "" }] });
    const [card] = parseProcedureCards({ Success: true, HTML: procedureCard(bcsId(1), "Opening") }, { name: "Safety", count: 1 });
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
