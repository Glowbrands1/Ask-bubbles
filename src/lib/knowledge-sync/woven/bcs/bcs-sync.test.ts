import { describe, expect, it } from "vitest";

import { audienceKey } from "../../access";
import { MemoryKnowledgeSink, MemoryKnowledgeSyncStore } from "../../memory-store";
import type { DryRunPlan, ManifestItem, SyncReport } from "../../types";
import { type WovenKnowledgeConfig } from "../config";
import { WovenTeamClient } from "../http";
import { createWovenKnowledgeConnector, runWovenKnowledgeSync, testWovenConnection, type WovenRunOutcome } from "../sync";
import { BCS_COMPANY, BCS_COMPANY_ID, FakeBcsWoven, JBA_COMPANY, JBA_COMPANY_ID, PASSWORD, USERNAME, bcsId, fileRow, noSleep } from "./test-support";

/**
 * ============================================================================
 * THE BUFF CITY SOAP WOVEN SYNC, END TO END
 * ============================================================================
 *
 * The fake BCS Woven (sanitized handoff shapes) → the real BCS connector and
 * company guard → the real engine, reconciliation and dry-run plan → the
 * in-memory manifest store and knowledge sink. Nothing reaches a network.
 */

const BASE = "https://app.woven.team";

const CONFIG: WovenKnowledgeConfig = {
  enabled: true,
  baseUrl: BASE,
  tenantProblem: null,
  downloads: { fileLibrary: false },
  credentials: { username: USERNAME, password: PASSWORD },
  missingCredentials: [],
  problems: [],
  previewTestModeAllowed: false,
};

class Harness {
  readonly fake = new FakeBcsWoven();
  readonly store: MemoryKnowledgeSyncStore;
  readonly sink = new MemoryKnowledgeSink();
  clock = new Date("2026-10-06T12:00:00Z");
  config: WovenKnowledgeConfig = { ...CONFIG, downloads: { ...CONFIG.downloads } };

  constructor() {
    this.store = new MemoryKnowledgeSyncStore({ now: () => this.clock });
  }

  client() {
    return new WovenTeamClient({ baseUrl: BASE, fetch: this.fake.fetch, sleep: noSleep, transport: { minIntervalMs: 0, baseBackoffMs: 0 } });
  }

  async run(mode: "preview" | "sync", extra: { confirmLargeRemoval?: boolean } = {}): Promise<WovenRunOutcome> {
    const outcome = await runWovenKnowledgeSync(
      { mode, trigger: "manual", requestedBy: "admin:test", confirmLargeRemoval: extra.confirmLargeRemoval },
      {
        config: this.config,
        store: this.store,
        sink: this.sink,
        /* Built only for a config the gate would pass, as production builds it only after the gate. */
        connector: this.config.credentials && !this.config.tenantProblem ? createWovenKnowledgeConnector(this.config, this.client()) : undefined,
        now: () => this.clock,
      },
    );
    this.clock = new Date(this.clock.getTime() + 86_400_000);
    return outcome;
  }

  /** "All Positions" shared by an administrator: the procedures it covers may enter Ask Bubbles. */
  async shareAllPositions() {
    await this.store.saveDecision({ source: "woven", audienceKey: audienceKey(["All Positions"]), decision: "company_wide", decidedBy: "admin:test", decidedAt: this.clock.toISOString() });
  }

  /** Preview, decide, initial sync. */
  async initial() {
    expect((await this.run("preview")).status).toMatch(/^succeeded/);
    await this.shareAllPositions();
    const outcome = await this.run("sync");
    expect(outcome.status).toMatch(/^succeeded/);
    return outcome;
  }

  item(contentType: string, id: string, part = "content"): ManifestItem {
    const found = this.store.items.get(`woven\u0000${contentType}\u0000${id}\u0000${part}`);
    if (!found) throw new Error(`no manifest item ${contentType} ${id} ${part}`);
    return found;
  }

  procedures() {
    return this.fake.content[BCS_COMPANY_ID]!.procedures;
  }

  searchableTitles() {
    return this.sink.searchable().map((d) => d.title).sort();
  }
}

function report(outcome: WovenRunOutcome): SyncReport {
  if (!("report" in outcome)) throw new Error(`no report: ${JSON.stringify(outcome)}`);
  return outcome.report;
}

function plan(outcome: WovenRunOutcome): DryRunPlan {
  const p = report(outcome).plan;
  if (!p) throw new Error("no plan");
  return p;
}

const titles = (entries: { title: string }[]) => entries.map((e) => e.title).sort();

/* ======================================================== the dry run == */

describe("dry run", () => {
  it("reports counts, exclusions by reason, flags and what WOULD happen — and writes nothing", async () => {
    const h = new Harness();
    const outcome = await h.run("preview");
    expect(outcome.status).toBe("succeeded");
    const p = plan(outcome);

    expect(p.sourceCounts).toEqual({
      policy: { records: 4, parts: 4 },
      handbook: { records: 1, parts: 1 },
      procedure: { records: 6, parts: 6 },
      file_library: { records: 8, parts: 8 },
      communication: { records: 3, parts: 3 },
    });
    expect(p.publishedRecords).toEqual({ policy: 0, handbook: 1, procedure: 3, file_library: 7, communication: 0 });
    expect(p.excludedByReason).toEqual({
      publication_unverified: 4,
      ownership_review: 1,
      unpublished: 4,
      audience_restricted: 2,
      audience_needs_review: 2,
      file_library_download_unverified: 2,
      unsupported_format: 2,
      audience_unclear: 1,
      /* "Public" on a File Library item: parsed, never shared — what it grants there is unverified. */
      audience_unverified: 1,
      published_not_visible: 2,
      draft: 1,
    });
    /* Nothing is shareable until "All Positions" is decided and File Library downloads are verified. */
    expect(p.wouldIngest).toEqual([]);
    expect(p.wouldDownload).toEqual([]);
    expect(titles(p.wouldDownloadOnceEnabled)).toEqual(["Makery Ops Manual", "Soap Loaf Cutting Guide"]);
    expect(titles(p.flaggedOwnership)).toEqual(["2025 JBA Policy Manual - Edited 5-2025", "JBA Policy Manual 2025", "NE Sick Time"]);
    expect(p.errors).toEqual([]);
    expect(report(outcome).company).toMatchObject({ companyVerified: true, companyId: BCS_COMPANY_ID });

    /* Writes nothing: no knowledge document, no manifest row, no settings change, no download. */
    expect(h.sink.ingestCalls + h.sink.metadataCalls + h.sink.retireCalls).toBe(0);
    expect(h.store.items.size).toBe(0);
    expect((await h.store.loadSettings()).initialSyncCompletedAt).toBeNull();
    expect(h.fake.log.some((r) => r.path === "/Dashboard/_FileLibrary_Download")).toBe(false);
    expect(h.fake.writes()).toEqual([]);
  });

  it("after 'All Positions' is shared, the dry run lists exactly the published, all-position procedures to ingest", async () => {
    const h = new Harness();
    await h.shareAllPositions();
    const p = plan(await h.run("preview"));
    expect(titles(p.wouldIngest)).toEqual(["Fire Extinguisher Use", "Opening the Makery"]);
    expect(titles(p.new)).toEqual(["Fire Extinguisher Use", "Opening the Makery"]);
    expect(p.wouldDownload).toEqual([]);
  });

  it("lists procedures with ONE search — the verified empty-category response — and never a per-category search", async () => {
    const h = new Harness();
    await h.run("preview");
    const searches = h.fake.log.filter((r) => r.path === "/KnowledgeCenter/_Search_Procedures");
    expect(searches).toHaveLength(1);
    expect((JSON.parse(searches[0]!.body) as { pModel: { Categories: string[] } }).pModel.Categories).toEqual([]);
  });

  it("never fetches a draft procedure's page", async () => {
    const h = new Harness();
    await h.run("preview");
    const fetched = h.fake.log.filter((r) => r.path.startsWith("/KnowledgeCenter/Procedure/")).map((r) => r.path.split("/").pop());
    expect(fetched.sort()).toEqual([bcsId(301), bcsId(304), bcsId(305)].sort());
  });
});

/* ===================================================== the company guard == */

describe("company guard", () => {
  it("chooses the account by Company ID on the chooser, even with the other company listed first", async () => {
    const h = new Harness();
    expect(h.fake.accounts[0]!.name).toBe(JBA_COMPANY);
    await h.run("preview");
    expect(h.fake.activeCompanyId).toBe(BCS_COMPANY_ID);
    const chose = h.fake.log.find((r) => r.method === "POST" && new URLSearchParams(r.body).get("CompanyID"));
    expect(new URLSearchParams(chose!.body).get("CompanyID")).toBe(BCS_COMPANY_ID);
  });

  it("a session that lands in the other company fails before any content is read", async () => {
    const h = new Harness();
    h.fake.requireCompanySelection = false;
    h.fake.defaultCompanyId = JBA_COMPANY_ID;
    const outcome = await h.run("preview");
    expect(outcome).toMatchObject({ status: "failed", errorCode: "woven_company_mismatch" });
    expect(h.fake.contentReads()).toEqual([]);
    expect(h.store.items.size).toBe(0);
  });

  it("an entry with the right id but another name is not chosen", async () => {
    const h = new Harness();
    h.fake.accounts = [{ id: BCS_COMPANY_ID, name: JBA_COMPANY }];
    expect(await h.run("preview")).toMatchObject({ status: "failed", errorCode: "woven_company_not_verified" });
    expect(h.fake.contentReads()).toEqual([]);
  });

  it("the company missing from the chooser is a failure, not a fallback", async () => {
    const h = new Harness();
    h.fake.accounts = [{ id: JBA_COMPANY_ID, name: JBA_COMPANY }];
    expect(await h.run("preview")).toMatchObject({ status: "failed", errorCode: "woven_company_not_listed" });
    expect(h.fake.contentReads()).toEqual([]);
  });

  it("no Company ID on the Company page, or two different ones, or a refused page: nothing is read", async () => {
    for (const variant of ["missing", "conflicting", "forbidden"] as const) {
      const h = new Harness();
      h.fake.companyPage = variant;
      const outcome = await h.run("preview");
      expect(outcome.status).toBe("failed");
      expect((outcome as { errorCode: string }).errorCode).toMatch(variant === "missing" ? /company_not_verified/ : variant === "conflicting" ? /company_mismatch/ : /forbidden/);
      expect(h.fake.contentReads()).toEqual([]);
    }
  });

  it("the verified live layout (session-detail readings) proves the company", async () => {
    const h = new Harness();
    h.fake.companyPage = "session";
    expect((await h.run("preview")).status).toBe("succeeded");
  });

  it("one place on the page, or the legacy label/input layout alone, is not proof: nothing is read", async () => {
    for (const variant of ["single", "input"] as const) {
      const h = new Harness();
      h.fake.companyPage = variant;
      const outcome = await h.run("preview");
      expect(outcome.status).toBe("failed");
      expect((outcome as { errorCode: string }).errorCode).toMatch(/company_not_verified/);
      expect(h.fake.contentReads()).toEqual([]);
    }
  });

  it("a session that moves to the other company mid-run is caught before anything is classified or applied", async () => {
    const h = new Harness();
    await h.initial();
    const before = { ingests: h.sink.ingestCalls, retires: h.sink.retireCalls, items: JSON.stringify([...h.store.items.values()]) };
    h.fake.switchCompanyAfter = 3;
    const outcome = await h.run("sync");
    expect(outcome).toMatchObject({ status: "failed", errorCode: "woven_company_mismatch" });
    expect(h.sink.ingestCalls).toBe(before.ingests);
    expect(h.sink.retireCalls).toBe(before.retires);
    expect(JSON.stringify([...h.store.items.values()])).toBe(before.items);
    expect(h.searchableTitles().some((t) => /Bed Cleaning|Spray Tan|Tanning/.test(t))).toBe(false);
  });

  it("an expired session is re-established — and the company proved again — before reading on", async () => {
    const h = new Harness();
    h.fake.expireSessionAfter = 6;
    const outcome = await h.run("preview");
    expect(outcome.status).toBe("succeeded");
    expect(h.fake.logins).toBe(2);
    expect(h.fake.log.filter((r) => r.path === "/Company").length).toBeGreaterThanOrEqual(3);
  });

  it("a re-sign-in that lands in the other company stops the run: nothing of that company is read", async () => {
    const h = new Harness();
    h.fake.requireCompanySelection = false;
    h.fake.companyForLogin = (n) => (n === 1 ? BCS_COMPANY_ID : JBA_COMPANY_ID);
    h.fake.expireSessionAfter = 4;
    const outcome = await h.run("preview");
    expect(outcome.status).toBe("failed");
    expect(h.fake.logins).toBe(2);
    expect(h.fake.contentReads().filter((r) => r.company === JBA_COMPANY_ID)).toEqual([]);
    expect(h.store.items.size).toBe(0);
  });

  it("wrong credentials are a sign-in failure, not an empty company", async () => {
    const h = new Harness();
    h.config = { ...h.config, credentials: { username: USERNAME, password: "wrong" } };
    expect(await h.run("preview")).toMatchObject({ status: "failed", errorCode: "woven_login_failed" });
    expect(h.fake.contentReads()).toEqual([]);
  });
});

/* ===================================================== sync and change == */

describe("sync, change detection and reconciliation", () => {
  it("ingests only published, shareable procedure text — no drafts, no restricted, no other company, no downloads", async () => {
    const h = new Harness();
    await h.initial();
    expect(h.searchableTitles()).toEqual(["Fire Extinguisher Use", "Opening the Makery"]);
    const opening = [...h.sink.documents.values()].find((d) => d.title === "Opening the Makery")!;
    const text = new TextDecoder().decode(opening.bytes);
    expect(text).toContain("Unlock the front door");
    expect(text).not.toContain("Not Provided");
    expect(h.item("procedure", bcsId(305)).reason).toBe("audience_restricted");
    expect(h.item("procedure", bcsId(302)).reason).toBe("unpublished");
    expect(h.item("handbook", bcsId(201), "current-version")).toMatchObject({ state: "NEEDS_REVIEW", reason: "ownership_review", inKnowledgeBase: false });
    expect(h.fake.log.some((r) => r.path === "/Dashboard/_FileLibrary_Download")).toBe(false);
    expect(h.fake.writes()).toEqual([]);
  });

  it("an unchanged item is skipped; a changed one is re-ingested", async () => {
    const h = new Harness();
    await h.initial();
    const ingests = h.sink.ingestCalls;
    expect(report(await h.run("sync")).totals).toMatchObject({ new: 0, updated: 0, unchanged: 2 });
    expect(h.sink.ingestCalls).toBe(ingests);

    h.procedures().find((p) => p.id === bcsId(304))!.steps[0]!.text = "Pull the pin. Aim low. Squeeze. Sweep side to side.";
    expect(report(await h.run("sync")).totals).toMatchObject({ updated: 1, unchanged: 1 });
    expect(h.sink.ingestCalls).toBe(ingests + 1);
    expect(h.item("procedure", bcsId(304)).state).toBe("UPDATED");
  });

  it("unpublished in Woven: retired from Ask Bubbles", async () => {
    const h = new Harness();
    await h.initial();
    h.procedures().find((p) => p.id === bcsId(301))!.badges = ["Unpublished"];
    await h.run("sync");
    expect(h.item("procedure", bcsId(301))).toMatchObject({ state: "UNPUBLISHED", inKnowledgeBase: false });
    expect(h.searchableTitles()).toEqual(["Fire Extinguisher Use"]);
  });

  it("permission change: narrowed to some positions, it leaves Ask Bubbles — an admin decision cannot share it", async () => {
    const h = new Harness();
    await h.initial();
    h.procedures().find((p) => p.id === bcsId(304))!.positions = "General Manager";
    await h.store.saveDecision({ source: "woven", audienceKey: audienceKey(["General Manager"]), decision: "company_wide", decidedBy: "admin:test", decidedAt: h.clock.toISOString() });
    const r = report(await h.run("sync"));
    expect(r.totals.permissionChanged).toBe(1);
    expect(h.item("procedure", bcsId(304))).toMatchObject({ state: "PERMISSION_CHANGED", reason: "audience_restricted", inKnowledgeBase: false });
    expect(h.searchableTitles()).toEqual(["Opening the Makery"]);
    expect(r.audiences.some((a) => a.label === "General Manager")).toBe(false);
  });

  it("a synced item that turns out to name the other company is withdrawn until a person confirms it", async () => {
    const h = new Harness();
    await h.initial();
    h.procedures().find((p) => p.id === bcsId(304))!.title = "Fire Extinguisher Use (JBA)";
    const r = report(await h.run("sync"));
    expect(h.item("procedure", bcsId(304))).toMatchObject({ state: "PERMISSION_CHANGED", reason: "ownership_review", inKnowledgeBase: false });
    expect(r.totals).toMatchObject({ permissionChanged: 1, heldForOwnership: 1 });
    expect(h.searchableTitles()).toEqual(["Opening the Makery"]);
  });

  it("removed from a complete listing: retired", async () => {
    const h = new Harness();
    await h.initial();
    const content = h.fake.content[BCS_COMPANY_ID]!;
    content.procedures = content.procedures.filter((p) => p.id !== bcsId(304));
    const r = report(await h.run("sync"));
    expect(r.totals.removed).toBe(1);
    expect(h.item("procedure", bcsId(304))).toMatchObject({ state: "REMOVED", inKnowledgeBase: false });
  });

  it("a failed listing elsewhere in the run holds every absence-based removal", async () => {
    const h = new Harness();
    await h.initial();
    const content = h.fake.content[BCS_COMPANY_ID]!;
    content.procedures = content.procedures.filter((p) => p.id !== bcsId(304));
    h.fake.failures.set("/FileLibrary/_FileLibrary_Management_List_ForDataTable", 500);
    const outcome = await h.run("sync");
    expect(outcome.status).toBe("succeeded_with_warnings");
    expect(h.item("procedure", bcsId(304))).toMatchObject({ state: "REMOVED", reason: "removal_held_incomplete", inKnowledgeBase: true, pendingAction: "none" });
    expect(h.searchableTitles()).toContain("Fire Extinguisher Use");
    expect(report(outcome).attention.map((a) => a.code)).toContain("removals_held_incomplete");

    /* The next complete read does remove it. */
    h.fake.failures.clear();
    await h.run("sync");
    expect(h.item("procedure", bcsId(304)).inKnowledgeBase).toBe(false);
  });

  it("an incomplete procedure list (count below its category's indicator) fails that listing and removes nothing", async () => {
    const h = new Harness();
    await h.initial();
    h.fake.indicatorOverride.set("Safety", 3);
    const outcome = await h.run("sync");
    expect(report(outcome).byType.procedure).toMatchObject({ listing: "failed", listingCode: "woven_procedure_count_mismatch" });
    expect(h.searchableTitles()).toEqual(["Fire Extinguisher Use", "Opening the Makery"]);
    expect(h.sink.retireCalls).toBe(0);
  });

  it("an empty but well-formed list after a full one is not trusted for removals", async () => {
    const h = new Harness();
    h.config.downloads.fileLibrary = true;
    await h.initial();
    const inBase = h.searchableTitles();
    h.fake.content[BCS_COMPANY_ID]!.fileLibrary = [];
    const r = report(await h.run("sync"));
    expect(r.byType.file_library).toMatchObject({ listing: "not_trusted", listingCode: "empty_listing" });
    expect(h.searchableTitles()).toEqual(inBase);
  });
});

/* ====================================================== failures closed == */

describe("fail closed, per content type", () => {
  it("malformed JSON, HTML instead of JSON, 401/403 and drift each fail only their own listing", async () => {
    const h = new Harness();
    h.fake.malformed.add("/KnowledgeCenter/_Policies_List");
    h.fake.htmlInsteadOfJson.add("/Communication/_List_ForDataTable");
    h.fake.failures.set("/KnowledgeCenter/_Handbooks_List_ForDataTable", 403);
    const files = h.fake.content[BCS_COMPANY_ID]!.fileLibrary;
    files[1] = { ...files[1]!, Column3: files[1]!.Column4!, Column4: files[1]!.Column3! };
    const outcome = await h.run("preview");
    const byType = report(outcome).byType;
    expect(outcome.status).toBe("succeeded_with_warnings");
    expect(byType.policy).toMatchObject({ listing: "failed", listingCode: "woven_unexpected_shape" });
    expect(byType.communication).toMatchObject({ listing: "failed", listingCode: "woven_bad_response" });
    expect(byType.handbook).toMatchObject({ listing: "failed", listingCode: "woven_forbidden" });
    expect(byType.file_library?.listing).toBe("failed");
    expect(byType.procedure?.listing).toBe("ok");
    expect(plan(outcome).errors.map((e) => e.contentType).sort()).toEqual(["communication", "file_library", "handbook", "policy"]);
  });

  it("every listing failing fails the run, with nothing written", async () => {
    const h = new Harness();
    for (const path of [
      "/KnowledgeCenter/_Policies_List",
      "/KnowledgeCenter/_Handbooks_List_ForDataTable",
      "/KnowledgeCenter/_Search_Procedures",
      "/FileLibrary/_FileLibrary_Management_List_ForDataTable",
      "/Communication/_List_ForDataTable",
    ]) {
      h.fake.failures.set(path, 500);
    }
    expect((await h.run("sync")).status).toBe("refused");
    expect((await h.run("preview")).status).toBe("failed");
    expect(h.store.items.size).toBe(0);
  });

  it("an unknown publication state fails the listing (here: a communication published and visible, never verified)", async () => {
    const h = new Harness();
    h.fake.content[BCS_COMPANY_ID]!.communications.push({
      EntityID: bcsId(599),
      Column1: "Visible Newsletter",
      Column2: '<span class="hidden">2</span><span class="badge">Published</span>',
      Column3: "",
      Column4: "",
      Column5: "All Teams All Positions",
      Column6: "",
    });
    expect(report(await h.run("preview")).byType.communication).toMatchObject({ listing: "failed", listingCode: "woven_unknown_publication_state" });
  });

  it("a Woven id listed twice fails that listing", async () => {
    const h = new Harness();
    const files = h.fake.content[BCS_COMPANY_ID]!.fileLibrary;
    files.push({ ...files[0]! });
    expect(report(await h.run("preview")).byType.file_library).toMatchObject({ listing: "failed", listingCode: "woven_duplicate_source_id" });
  });
});

/* ===================================================== File Library gate == */

describe("File Library downloads", () => {
  it("switched on: only published, company-wide, indexable files are downloaded — each verified as the file it claims to be", async () => {
    const h = new Harness();
    h.config.downloads.fileLibrary = true;
    await h.initial();
    const downloads = h.fake.log.filter((r) => r.path === "/Dashboard/_FileLibrary_Download").map((r) => new URLSearchParams(r.query).get("pFileLibraryID"));
    expect(downloads.sort()).toEqual([bcsId(401), bcsId(402)].sort());
    expect(h.searchableTitles()).toContain("Soap Loaf Cutting Guide");
    /* The docx has no file behind it in the fixture: that item fails alone and retries. */
    expect(h.item("file_library", bcsId(402), "file")).toMatchObject({ state: "ERROR", inKnowledgeBase: false });
    expect(h.item("file_library", bcsId(403), "file").reason).toBe("audience_restricted");
  });

  it("the VERIFIED download contract: direct bytes with a session, a login redirect without one, the record's own file name", async () => {
    const h = new Harness();
    const client = h.client();
    /* Without a session: 302 to /Login — a lost session, never a file. */
    await expect(client.downloadAuthenticated(`/Dashboard/_FileLibrary_Download?pFileLibraryID=${bcsId(401)}&pDownloadedFromEntityType=FileLibrary`, 1_000_000)).rejects.toMatchObject({
      code: "session_expired",
      sessionLost: true,
    });
    h.config.downloads.fileLibrary = true;
    await h.initial();
    const request = h.fake.log.find((r) => r.path === "/Dashboard/_FileLibrary_Download")!;
    expect(request.method).toBe("GET");
    expect([...new URLSearchParams(request.query).keys()]).toEqual(["pFileLibraryID", "pDownloadedFromEntityType"]);
    expect(new URLSearchParams(request.query).get("pDownloadedFromEntityType")).toBe("FileLibrary");
    /* The disposition name ("… (1).pdf") is not used: the stored document keeps the title. */
    expect(h.searchableTitles()).toContain("Soap Loaf Cutting Guide");
    expect(JSON.stringify([...h.store.items.values()])).not.toContain("(1).pdf");
  });

  it("a new Updated date with identical bytes is a metadata-only update", async () => {
    const h = new Harness();
    h.config.downloads.fileLibrary = true;
    await h.initial();
    const files = h.fake.content[BCS_COMPANY_ID]!.fileLibrary;
    files[0] = fileRow({ id: bcsId(401), title: "Soap Loaf Cutting Guide", ext: "pdf", status: "Published", audience: "All Teams All Positions", library: "Brand", updated: "2026-10-01T00:00:00Z" });
    const ingests = h.sink.ingestCalls;
    const r = report(await h.run("sync"));
    expect(r.totals.metadataOnly).toBe(1);
    expect(h.sink.ingestCalls).toBe(ingests);
  });
});

/* =================================================== Test Connection == */

describe("Test Connection", () => {
  it("signs in, proves the Company ID and reads one list, writing nothing", async () => {
    const h = new Harness();
    expect(await testWovenConnection({ config: h.config, client: h.client() })).toEqual({ status: "ok", company: BCS_COMPANY, companyId: BCS_COMPANY_ID, handbooksVisible: 1 });
    h.fake.requireCompanySelection = false;
    h.fake.defaultCompanyId = JBA_COMPANY_ID;
    expect(await testWovenConnection({ config: h.config, client: h.client() })).toMatchObject({ status: "failed", code: "woven_company_mismatch" });
    expect(h.fake.writes()).toEqual([]);
  });
});
