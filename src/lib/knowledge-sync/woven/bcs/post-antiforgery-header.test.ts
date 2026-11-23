import { describe, expect, it } from "vitest";

import { MemoryKnowledgeSink, MemoryKnowledgeSyncStore } from "../../memory-store";
import type { DryRunPlan } from "../../types";
import { readWovenKnowledgeConfig, WOVEN_POST_ANTIFORGERY_HEADER_ENABLED_ENV, type WovenKnowledgeConfig } from "../config";
import { pageAntiforgeryHeaderName, pageAntiforgeryToken, WovenTeamClient } from "../http";
import { parseHtmlDocument } from "../html";
import { createWovenKnowledgeConnector, runWovenKnowledgeSync, type WovenRunOutcome } from "../sync";
import { FakeBcsWoven, PASSWORD, USERNAME, noSleep } from "./test-support";

/**
 * ============================================================================
 * WOVEN'S CONTENT LISTS ANSWER HTTP 400 (QA, 23 Nov 2026: Preview scan 6c1297da)
 * ============================================================================
 *
 * QA's report, word for word: the #1003 Preview scan listed policies from GET
 * /Policy, but "Woven answered /KnowledgeCenter/_Handbooks_List_ForDataTable
 * with HTTP 400." "Woven answered /KnowledgeCenter/_Search_Procedures with
 * HTTP 400." "Woven answered /FileLibrary/_FileLibrary_Management_List_ForDataTable
 * with HTTP 400." "Woven answered /Communication/_List_ForDataTable with HTTP
 * 400." The scheduled syncs' "_Policies_List" failed the same way from 19 Nov;
 * the last good runs were on 12 Nov. The sibling app's runs fail on every POST
 * list from the same day, for another Woven company; our requests did not
 * change. Every failing read is a POST, and every GET still works: Woven checks
 * an anti-forgery token on content POSTs, which an ASP.NET JSON post sends in
 * a header (an empty 400 is how that check refuses). The fake below behaves
 * so (`FakeBcsWoven.antiforgery`); its pages and lists are the recorded shapes.
 */

const BASE = "https://app.woven.team";
const QA_400S = [
  "Woven answered /KnowledgeCenter/_Handbooks_List_ForDataTable with HTTP 400.",
  "Woven answered /KnowledgeCenter/_Search_Procedures with HTTP 400.",
  "Woven answered /FileLibrary/_FileLibrary_Management_List_ForDataTable with HTTP 400.",
  "Woven answered /Communication/_List_ForDataTable with HTTP 400.",
];
const CONTENT_POSTS = [
  "/KnowledgeCenter/_Handbooks_List_ForDataTable",
  "/KnowledgeCenter/_Search_Procedures",
  "/FileLibrary/_FileLibrary_Management_List_ForDataTable",
  "/Communication/_List_ForDataTable",
];

function config(postAntiforgeryHeader: boolean): WovenKnowledgeConfig {
  /* As QA's Preview scan ran: the policy management list (#1003) on. */
  return {
    enabled: true,
    baseUrl: BASE,
    tenantProblem: null,
    downloads: { fileLibrary: false },
    policyManagementList: true,
    postAntiforgeryHeader,
    credentials: { username: USERNAME, password: PASSWORD },
    missingCredentials: [],
    problems: [],
    previewTestModeAllowed: false,
  };
}

/** Woven as of 19 Nov 2026 (`antiforgery` set), or as it answered before (null). */
async function preview(cfg: WovenKnowledgeConfig, antiforgery: FakeBcsWoven["antiforgery"]) {
  const fake = new FakeBcsWoven();
  fake.antiforgery = antiforgery;
  const clock = new Date("2026-11-23T12:00:00Z");
  const client = new WovenTeamClient({
    baseUrl: BASE,
    fetch: fake.fetch,
    sleep: noSleep,
    transport: { minIntervalMs: 0, baseBackoffMs: 0 },
    antiforgeryHeader: cfg.postAntiforgeryHeader === true,
  });
  const outcome: WovenRunOutcome = await runWovenKnowledgeSync(
    { mode: "preview", trigger: "manual", requestedBy: "admin:test" },
    {
      config: cfg,
      store: new MemoryKnowledgeSyncStore({ now: () => clock }),
      sink: new MemoryKnowledgeSink(),
      connector: createWovenKnowledgeConnector(cfg, client),
      now: () => clock,
    },
  );
  if (!("report" in outcome) || !outcome.report.plan) throw new Error(`no plan: ${JSON.stringify(outcome)}`);
  return { fake, client, plan: outcome.report.plan as DryRunPlan };
}

const WOVEN_NOW = { header: "RequestVerificationToken", declared: false };

describe("Woven's content lists answer HTTP 400 (QA, 23 Nov 2026)", () => {
  it("the switch is WOVEN_POST_ANTIFORGERY_HEADER_ENABLED, off by default", () => {
    expect(readWovenKnowledgeConfig({}).postAntiforgeryHeader).toBe(false);
    expect(readWovenKnowledgeConfig({ [WOVEN_POST_ANTIFORGERY_HEADER_ENABLED_ENV]: "true" }).postAntiforgeryHeader).toBe(true);
  });

  it("switch off (production today): the scan reproduces QA's four errors word for word, and policies still list from GET /Policy", async () => {
    const { plan, fake } = await preview(config(false), WOVEN_NOW);
    expect(plan.errors.map((e) => e.message)).toEqual(QA_400S);
    expect(plan.publishedRecords.policy).toBeGreaterThan(0);
    /* No content POST carried a token header. */
    expect(fake.log.filter((r) => CONTENT_POSTS.includes(r.path))).toHaveLength(4);
  });

  it("switch on: every list reads, each content POST carrying the page's token in RequestVerificationToken", async () => {
    const { plan, fake } = await preview(config(true), WOVEN_NOW);
    expect(plan.errors).toEqual([]);
    for (const type of ["handbook", "procedure", "file_library", "communication"] as const) expect(plan.sourceCounts[type]?.records ?? 0, type).toBeGreaterThan(0);
    for (const path of CONTENT_POSTS) expect(fake.log.some((r) => r.path === path && r.method === "POST"), path).toBe(true);
    /* Read-only, as before. */
    expect(fake.writes()).toEqual([]);
  });

  it("switch on: the audience and publication rules are exactly as before — the same plan Woven gave without the check", async () => {
    const before = (await preview(config(false), null)).plan;
    const after = (await preview(config(true), WOVEN_NOW)).plan;
    expect(after.publishedRecords).toEqual(before.publishedRecords);
    expect(after.excludedByReason).toEqual(before.excludedByReason);
    expect(after.wouldIngest.map((i) => i.title).sort()).toEqual(before.wouldIngest.map((i) => i.title).sort());
    /* "Public" on a File Library item or a communication: never shared. Targeted: restricted. */
    expect(after.excludedByReason.audience_unverified ?? 0).toBeGreaterThan(0);
    expect(after.excludedByReason.audience_restricted ?? 0).toBeGreaterThan(0);
  });

  it("switch on: a page that declares its own header name in its ajax set-up is followed", async () => {
    const { plan } = await preview(config(true), { header: "X-RequestVerificationToken", declared: true });
    expect(plan.errors).toEqual([]);
  });

  it("switch on and Woven without the check: nothing changes (the header is harmless)", async () => {
    const before = (await preview(config(false), null)).plan;
    const after = (await preview(config(true), null)).plan;
    expect(after.errors).toEqual([]);
    expect(after.publishedRecords).toEqual(before.publishedRecords);
  });
});

describe("reading the token and its header from a page", () => {
  const page = (body: string) => parseHtmlDocument(`<!DOCTYPE html><html><head></head><body>${body}</body></html>`);

  it("the hidden input, else a token meta; none: null", () => {
    expect(pageAntiforgeryToken(page('<input type="hidden" name="__RequestVerificationToken" value="t1">'))).toBe("t1");
    expect(pageAntiforgeryToken(page('<meta name="RequestVerificationToken" content="t2">'))).toBe("t2");
    expect(pageAntiforgeryToken(page("<p>no token</p>"))).toBeNull();
  });

  it("the header name from the page's ajax headers or setRequestHeader; another header is not one", () => {
    expect(pageAntiforgeryHeaderName(page(`<script>$.ajaxSetup({ headers: { "X-RequestVerificationToken": token } });</script>`))).toBe("X-RequestVerificationToken");
    expect(pageAntiforgeryHeaderName(page(`<script>xhr.setRequestHeader('RequestVerificationToken', t);</script>`))).toBe("RequestVerificationToken");
    expect(pageAntiforgeryHeaderName(page(`<script>$.ajaxSetup({ headers: { 'X-Woven-Client': 'web' } });</script>`))).toBeNull();
  });

  it("a POST before any page has been read reads the dashboard for the token first", async () => {
    const fake = new FakeBcsWoven();
    fake.antiforgery = WOVEN_NOW;
    const client = new WovenTeamClient({ baseUrl: BASE, fetch: fake.fetch, sleep: noSleep, transport: { minIntervalMs: 0, baseBackoffMs: 0 }, antiforgeryHeader: true });
    const connector = createWovenKnowledgeConnector(config(true), client);
    await connector.connect();
    client.pageToken = null;
    expect((await connector.list("handbook")).ok).toBe(true);
    const at = fake.log.findIndex((r) => r.path === "/KnowledgeCenter/_Handbooks_List_ForDataTable");
    expect(fake.log.slice(0, at).some((r) => r.path === "/" && r.method === "GET")).toBe(true);
  });
});
