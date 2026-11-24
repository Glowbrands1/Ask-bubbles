import { describe, expect, it } from "vitest";

import { audienceKey } from "../../access";
import { MemoryKnowledgeSink, MemoryKnowledgeSyncStore } from "../../memory-store";
import type { DryRunPlan } from "../../types";
import { readWovenKnowledgeConfig, WOVEN_BCS_POLICY_MANAGEMENT_LIST_ENABLED_ENV, type WovenKnowledgeConfig } from "../config";
import { WovenTeamClient } from "../http";
import { createWovenKnowledgeConnector, runWovenKnowledgeSync, type WovenRunOutcome } from "../sync";
import { parsePolicyManagementList, policyManagementRecord } from "./adapters/policies";
import { bcsAudienceRestriction } from "./policy";
import { FakeBcsWoven, PASSWORD, USERNAME, bcsId, noSleep } from "./test-support";

/**
 * ============================================================================
 * BOARD f105 — "Bubbles Woven policies are not searchable (none synced as
 * verified; only the JBA manual counts)"
 * ============================================================================
 *
 * Why: Ask Bubbles listed policies from the Knowledge Center cards, which carry
 * no status and no audience, so every policy was `publication_unverified` and
 * none was ever synced. Ask Sunny lists them from Woven's management table
 * (`GET /Policy`), which says which are published and who they are for.
 * WOVEN_BCS_POLICY_MANAGEMENT_LIST_ENABLED (default off) does the same here.
 */

const BASE = "https://app.woven.team";

function config(policyManagementList: boolean): WovenKnowledgeConfig {
  return {
    enabled: true,
    baseUrl: BASE,
    tenantProblem: null,
    downloads: { fileLibrary: false },
    policyManagementList,
    credentials: { username: USERNAME, password: PASSWORD },
    missingCredentials: [],
    problems: [],
    previewTestModeAllowed: false,
  };
}

class Harness {
  readonly fake = new FakeBcsWoven();
  clock = new Date("2026-11-21T12:00:00Z");
  readonly store = new MemoryKnowledgeSyncStore({ now: () => this.clock });
  readonly sink = new MemoryKnowledgeSink();

  constructor(readonly cfg: WovenKnowledgeConfig) {}

  async run(mode: "preview" | "sync"): Promise<WovenRunOutcome> {
    const client = new WovenTeamClient({ baseUrl: BASE, fetch: this.fake.fetch, sleep: noSleep, transport: { minIntervalMs: 0, baseBackoffMs: 0 } });
    const outcome = await runWovenKnowledgeSync(
      { mode, trigger: "manual", requestedBy: "admin:test" },
      { config: this.cfg, store: this.store, sink: this.sink, connector: createWovenKnowledgeConnector(this.cfg, client), now: () => this.clock },
    );
    this.clock = new Date(this.clock.getTime() + 86_400_000);
    return outcome;
  }


  searchableTitles() {
    return this.sink.searchable().map((d) => d.title).sort();
  }

  requested(path: string) {
    return this.fake.log.some((r) => r.path === path);
  }
}

function plan(outcome: WovenRunOutcome): DryRunPlan {
  if (!("report" in outcome) || !outcome.report.plan) throw new Error(`no plan: ${JSON.stringify(outcome)}`);
  return outcome.report.plan;
}

describe("f105: Bubbles Woven policies are not searchable", () => {
  it("the switch is read from WOVEN_BCS_POLICY_MANAGEMENT_LIST_ENABLED and is off by default", () => {
    expect(readWovenKnowledgeConfig({}).policyManagementList).toBe(false);
    expect(readWovenKnowledgeConfig({ [WOVEN_BCS_POLICY_MANAGEMENT_LIST_ENABLED_ENV]: "true" }).policyManagementList).toBe(true);
  });

  it("switch off: unchanged — the Knowledge Center cards, every policy publication-unverified, /Policy never requested", async () => {
    const h = new Harness(config(false));
    const p = plan(await h.run("preview"));
    expect(p.publishedRecords.policy).toBe(0);
    expect(p.excludedByReason.publication_unverified).toBe(4);
    expect(h.requested("/Policy")).toBe(false);
  });

  it("switch on: published policies are read from /Policy, and a Public one is searchable", async () => {
    const h = new Harness(config(true));
    const p = plan(await h.run("preview"));
    expect(h.requested("/Policy")).toBe(true);
    /* Dress Code, Cell Phone Policy and JBA Policy Manual 2025 are current; NE Sick Time is a draft. */
    expect(p.publishedRecords.policy).toBe(3);
    expect(p.excludedByReason.publication_unverified ?? 0).toBe(0);

    expect((await h.run("sync")).status).toMatch(/^succeeded/);
    const titles = h.searchableTitles();
    expect(titles).toContain("Dress Code");
    /* Targeted ("All Teams 8 Positions"): never shared. A draft: never shared. */
    expect(titles).not.toContain("Cell Phone Policy");
    expect(titles).not.toContain("NE Sick Time");
    /* A title naming the other company stays held for ownership review. */
    expect(titles).not.toContain("JBA Policy Manual 2025");
    const dressCode = h.sink.searchable().find((d) => d.title === "Dress Code");
    expect(new TextDecoder().decode(dressCode!.bytes)).toMatch(/Closed-toe shoes at all times/);
  });

  it("switch on, Pau's ruling (22 Nov): a published Public policy is shared without an administrator's decision", async () => {
    const h = new Harness(config(true));
    expect((await h.run("preview")).status).toMatch(/^succeeded/);
    expect((await h.run("sync")).status).toMatch(/^succeeded/);
    expect(h.searchableTitles()).toContain("Dress Code");
    expect(h.searchableTitles()).not.toContain("Cell Phone Policy");
  });

  it("switch on: an administrator who excluded \"Public\" still keeps it out", async () => {
    const h = new Harness(config(true));
    await h.store.saveDecision({ source: "woven", audienceKey: audienceKey(["Public"]), decision: "excluded", decidedBy: "admin:test", decidedAt: h.clock.toISOString() });
    expect((await h.run("preview")).status).toMatch(/^succeeded/);
    expect((await h.run("sync")).status).toMatch(/^succeeded/);
    expect(h.searchableTitles()).not.toContain("Dress Code");
  });

  it("switch on: \"Public\" on a File Library item is still never shared", async () => {
    const h = new Harness(config(true));
    const p = plan(await h.run("preview"));
    expect(p.excludedByReason.audience_unverified).toBe(1);
  });
});

describe("parsePolicyManagementList", () => {
  const table = (rows: string, headers = "<th>Policy</th><th>Status</th><th>Audience</th><th>Last Updated</th>") =>
    `<html><body><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const row = (n: number, title: string, status: string, audience: string, extra = "") =>
    `<tr data-policy-id="${bcsId(n)}" data-status="${status}" ${extra}><td><a href="/Policy/Details/${bcsId(n)}">${title}</a></td><td>x</td><td><span>${audience}</span></td><td>5/13/2026</td></tr>`;

  it("reads status, audience (by header) and date", () => {
    const { rows } = parsePolicyManagementList(table(row(1, "Dress Code", "current", "Public") + row(2, "Breaks", "archived", "All Teams 3 Positions")));
    expect(rows).toEqual([
      { id: bcsId(1), title: "Dress Code", status: "current", publication: "published", audience: ["Public"], updatedAt: "2026-05-13" },
      { id: bcsId(2), title: "Breaks", status: "archived", publication: "unpublished", audience: ["All Teams 3 Positions"], updatedAt: "2026-05-13" },
    ]);
  });

  it("a disabled row is unpublished", () => {
    expect(parsePolicyManagementList(table(row(1, "A", "current", "Public", 'data-disabled="true"'))).rows[0]!.publication).toBe("unpublished");
  });

  it("fails rather than guess: no table, an unknown status, a row without a title, a repeated id", () => {
    expect(() => parsePolicyManagementList("<html><body><p>Access denied</p></body></html>")).toThrow(/did not contain the policy table/);
    expect(() => parsePolicyManagementList(table(row(1, "A", "pending", "Public")))).toThrow(/status Ask Bubbles has not verified/);
    expect(() => parsePolicyManagementList(table(`<tr data-policy-id="${bcsId(1)}" data-status="current"><td>no link</td></tr>`))).toThrow(/no title/);
    expect(() => parsePolicyManagementList(table(row(1, "A", "current", "Public") + row(1, "A", "current", "Public")))).toThrow(/same item twice/);
  });

  it("no Audience column: no audience stated (held as unclear)", () => {
    const { rows } = parsePolicyManagementList(table(row(1, "A", "current", "Public"), "<th>Policy</th><th>Status</th><th>Visibility</th><th>Last Updated</th>"));
    expect(rows[0]!.audience).toBeNull();
    expect(bcsAudienceRestriction(rows[0]!.audience, policyManagementRecord(rows[0]!))).toBe("audience_unclear");
  });
});

describe("bcsAudienceRestriction for policies", () => {
  const managed = (audience: string) => policyManagementRecord({ id: bcsId(1), title: "A", status: "current", publication: "published", audience: [audience], updatedAt: null });

  it("\"Public\" on a management-table policy goes to review (not excluded); Targeted summaries stay restricted", () => {
    expect(bcsAudienceRestriction(["Public"], managed("Public"))).toBeNull();
    expect(bcsAudienceRestriction(["All Teams 8 Positions"], managed("All Teams 8 Positions"))).toBe("audience_restricted");
    expect(bcsAudienceRestriction(["All Teams All Positions"], managed("All Teams All Positions"))).toBe("audience_unverified");
  });

  it("\"Public\" anywhere else is still unverified", () => {
    expect(bcsAudienceRestriction(["Public"], { contentType: "policy", entityId: bcsId(1) })).toBe("audience_unverified");
    expect(bcsAudienceRestriction(["Public"], { contentType: "file_library", entityId: bcsId(1) })).toBe("audience_unverified");
  });
});
