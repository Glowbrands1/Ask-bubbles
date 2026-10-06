import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { WOVEN_TENANT } from "@/config/company/woven";
import { MemoryKnowledgeSink, MemoryKnowledgeSyncStore } from "../../memory-store";
import { readWovenKnowledgeConfig, type WovenKnowledgeConfig } from "../config";
import { WovenTeamClient } from "../http";
import { createWovenKnowledgeConnector, runWovenKnowledgeSync, testWovenConnection, type WovenRunOutcome } from "../sync";
import { BuffCitySoapWovenConnector } from "./connector";
import {
  BCS_COMPANY,
  BCS_COMPANY_ID,
  FakeBcsWoven,
  JBA_COMPANY,
  JBA_COMPANY_ID,
  PASSWORD,
  UNKNOWN_COMPANY_ID,
  USERNAME,
  noSleep,
} from "./test-support";

/**
 * ============================================================================
 * ASK BUBBLES WOVEN = BUFF CITY SOAP / MIDWEST SOAP MAKERS ONLY
 * ============================================================================
 *
 * The fake Woven login opens THREE companies — Midwest Soap Makers, a fake
 * JB & Associates (with its own content) and an unknown one — exactly so these
 * tests can prove Ask Bubbles reads only the pinned one, by Company ID, and
 * fails rather than falls back.
 *
 * KNOWLEDGE ONLY. This suite covers the Woven KNOWLEDGE connector. The
 * employee directory is a separate integration with its own tests
 * (`src/lib/employees/woven`), not part of this phase.
 */

const PINNED = "55839F24-9241-418C-8405-37BAF9A42A87";

const ENV_OK = {
  WOVEN_KNOWLEDGE_SYNC_ENABLED: "true",
  WOVEN_BCS_USERNAME: USERNAME,
  WOVEN_BCS_PASSWORD: PASSWORD,
  WOVEN_BCS_COMPANY_ID: PINNED,
} as const;

function harness(env: Record<string, string> = ENV_OK) {
  const fake = new FakeBcsWoven();
  const store = new MemoryKnowledgeSyncStore();
  const sink = new MemoryKnowledgeSink();
  let config: WovenKnowledgeConfig = readWovenKnowledgeConfig(env);
  const client = () => new WovenTeamClient({ baseUrl: config.baseUrl, fetch: fake.fetch, sleep: noSleep, transport: { minIntervalMs: 0, baseBackoffMs: 0 } });
  let clock = new Date("2026-10-06T12:00:00Z");
  const run = async (mode: "preview" | "sync"): Promise<WovenRunOutcome> => {
    const outcome = await runWovenKnowledgeSync(
      { mode, trigger: "manual", requestedBy: "admin:test" },
      {
        config,
        store,
        sink,
        connector: config.credentials && !config.tenantProblem ? createWovenKnowledgeConnector(config, client()) : undefined,
        now: () => clock,
      },
    );
    clock = new Date(clock.getTime() + 86_400_000);
    return outcome;
  };
  return {
    fake,
    store,
    sink,
    run,
    client,
    get config() {
      return config;
    },
    setEnv(next: Record<string, string>) {
      config = readWovenKnowledgeConfig(next);
    },
  };
}

const failedWith = (outcome: WovenRunOutcome, code: string) => expect(outcome).toMatchObject({ status: "failed", errorCode: code });

describe("the pin", () => {
  it("is Buff City Soap / Midwest Soap Makers / 55839F24-9241-418C-8405-37BAF9A42A87, in code", () => {
    expect(WOVEN_TENANT).toEqual({ brand: "Buff City Soap", companyName: "Midwest Soap Makers", companyId: PINNED });
  });
});

describe("1–2. Midwest Soap Makers, by ID and by name + ID, succeeds", () => {
  it("chooses the Midwest Soap Makers entry by its Company ID (other companies listed first), proves it on /Company, and reads", async () => {
    const h = harness();
    const outcome = await h.run("preview");
    expect(outcome.status).toBe("succeeded");
    const chose = h.fake.log.filter((r) => r.method === "POST" && new URLSearchParams(r.body).get("CompanyID"));
    expect(chose.map((r) => new URLSearchParams(r.body).get("CompanyID"))).toEqual([BCS_COMPANY_ID]);
    expect(h.fake.contentReads().every((r) => r.company === BCS_COMPANY_ID)).toBe(true);
    expect(h.fake.contentReads().length).toBeGreaterThan(0);
  });

  it("with WOVEN_BCS_COMPANY_NAME confirming the name as well", async () => {
    const h = harness({ ...ENV_OK, WOVEN_BCS_COMPANY_NAME: "Midwest Soap Makers" });
    expect(h.config.tenantProblem).toBeNull();
    expect((await h.run("preview")).status).toBe("succeeded");
  });
});

describe("3. a JB & Associates session is rejected", () => {
  it("a login that lands in JB & Associates fails before any content is read", async () => {
    const h = harness();
    h.fake.requireCompanySelection = false;
    h.fake.defaultCompanyId = JBA_COMPANY_ID;
    failedWith(await h.run("preview"), "woven_company_mismatch");
    expect(h.fake.contentReads()).toEqual([]);
  });

  it("choosing Midwest Soap Makers but being put in JB & Associates is caught", async () => {
    const h = harness();
    h.fake.companyForLogin = () => JBA_COMPANY_ID;
    failedWith(await h.run("preview"), "woven_company_mismatch");
    expect(h.fake.contentReads()).toEqual([]);
  });

});

describe("4. the Sun Tan City / JB & Associates company ID is rejected", () => {
  it("on the Company page", async () => {
    const h = harness();
    h.fake.companyPageOverride = { id: JBA_COMPANY_ID, name: BCS_COMPANY };
    failedWith(await h.run("preview"), "woven_company_mismatch");
    expect(h.fake.contentReads()).toEqual([]);
  });

  it("in configuration: WOVEN_BCS_COMPANY_ID, and an inherited WOVEN_TEAM_COMPANY_ID", async () => {
    for (const env of [
      { ...ENV_OK, WOVEN_BCS_COMPANY_ID: JBA_COMPANY_ID },
      { ...ENV_OK, WOVEN_TEAM_COMPANY_ID: JBA_COMPANY_ID },
    ]) {
      const h = harness(env);
      expect(h.config).toMatchObject({ credentials: null });
      expect(h.config.tenantProblem).toMatch(/Buff City Soap/);
      expect(await h.run("preview")).toMatchObject({ status: "disabled" });
      expect(h.fake.log).toHaveLength(0);
    }
  });
});

describe("5. an unknown company is rejected", () => {
  it("a session in a company Ask Bubbles does not know fails before any content is read", async () => {
    const h = harness();
    h.fake.requireCompanySelection = false;
    h.fake.defaultCompanyId = UNKNOWN_COMPANY_ID;
    failedWith(await h.run("preview"), "woven_company_mismatch");
    expect(h.fake.contentReads()).toEqual([]);
  });

  it("a chooser that does not offer Midwest Soap Makers is a failure, never a fallback to what is offered", async () => {
    const h = harness();
    h.fake.accounts = [
      { id: JBA_COMPANY_ID, name: JBA_COMPANY },
      { id: UNKNOWN_COMPANY_ID, name: "Unknown Example Co" },
    ];
    failedWith(await h.run("preview"), "woven_company_not_listed");
    expect(h.fake.log.some((r) => new URLSearchParams(r.body).get("CompanyID"))).toBe(false);
    expect(h.fake.contentReads()).toEqual([]);
  });
});

describe("6. a missing company ID is rejected", () => {
  it("no Company ID on the Company page", async () => {
    const h = harness();
    h.fake.companyPage = "missing";
    failedWith(await h.run("preview"), "woven_company_not_verified");
    expect(h.fake.contentReads()).toEqual([]);
  });

  it("no WOVEN_BCS_COMPANY_ID: not configured, nothing reaches Woven", async () => {
    const { WOVEN_BCS_COMPANY_ID: _omit, ...env } = ENV_OK;
    void _omit;
    const h = harness(env);
    expect(await h.run("preview")).toEqual({ status: "not_configured", missing: ["WOVEN_BCS_COMPANY_ID"] });
    expect(h.fake.log).toHaveLength(0);
  });

});

describe("7. a wrong environment company disables the connector", () => {
  it.each([
    ["WOVEN_BCS_COMPANY_ID", { WOVEN_BCS_COMPANY_ID: UNKNOWN_COMPANY_ID }],
    ["WOVEN_BCS_COMPANY_NAME", { WOVEN_BCS_COMPANY_NAME: JBA_COMPANY }],
    ["WOVEN_TEAM_COMPANY (inherited)", { WOVEN_TEAM_COMPANY: JBA_COMPANY }],
    ["WOVEN_TEAM_COMPANY (inherited, location)", { WOVEN_TEAM_COMPANY: "JB & Associates - Corporate" }],
    ["WOVEN_TEAM_COMPANY_ID (inherited)", { WOVEN_TEAM_COMPANY_ID: JBA_COMPANY_ID }],
    ["WOVEN_TEAM_BASE_URL (inherited)", { WOVEN_TEAM_BASE_URL: "https://woven.example.test" }],
  ])("%s", async (_name, extra) => {
    const h = harness({ ...ENV_OK, ...extra });
    expect(h.config.tenantProblem).not.toBeNull();
    expect(h.config.credentials).toBeNull();
    expect(await h.run("preview")).toMatchObject({ status: "disabled" });
    expect(await h.run("sync")).toMatchObject({ status: "disabled" });
    expect(await testWovenConnection({ config: h.config, client: h.client() })).toMatchObject({ status: "disabled" });
    expect(h.fake.log).toHaveLength(0);
    /* No value is ever echoed: only variable names. */
    for (const value of Object.values(extra)) expect(h.config.tenantProblem).not.toContain(value);
  });

  it("inherited variables holding the pinned values are accepted (and still select nothing)", () => {
    const config = readWovenKnowledgeConfig({ ...ENV_OK, WOVEN_TEAM_COMPANY: "Midwest Soap Makers", WOVEN_TEAM_COMPANY_ID: PINNED.toLowerCase(), WOVEN_TEAM_BASE_URL: "https://app.woven.team" });
    expect(config.tenantProblem).toBeNull();
    expect(config.baseUrl).toBe("https://app.woven.team");
  });

  it("the inherited credentials configure nothing", () => {
    const config = readWovenKnowledgeConfig({ WOVEN_KNOWLEDGE_SYNC_ENABLED: "true", WOVEN_TEAM_USERNAME: USERNAME, WOVEN_TEAM_PASSWORD: PASSWORD, WOVEN_TEAM_COMPANY_ID: PINNED });
    expect(config.credentials).toBeNull();
    expect(config.missingCredentials).toEqual(["WOVEN_BCS_USERNAME", "WOVEN_BCS_PASSWORD", "WOVEN_BCS_COMPANY_ID"]);
  });
});

describe("8–9. name and ID must BOTH match", () => {
  it("8. the right ID under another name is not chosen", async () => {
    const h = harness();
    h.fake.accounts = [{ id: BCS_COMPANY_ID, name: JBA_COMPANY }];
    failedWith(await h.run("preview"), "woven_company_not_verified");
    expect(h.fake.contentReads()).toEqual([]);
  });

  it("8. the right ID on the Company page under another name fails", async () => {
    const h = harness();
    h.fake.companyPageOverride = { id: BCS_COMPANY_ID, name: JBA_COMPANY };
    failedWith(await h.run("preview"), "woven_company_not_verified");
    expect(h.fake.contentReads()).toEqual([]);
  });

  it("9. the right name under another ID is not chosen", async () => {
    const h = harness();
    h.fake.accounts = [
      { id: JBA_COMPANY_ID, name: BCS_COMPANY },
      { id: UNKNOWN_COMPANY_ID, name: JBA_COMPANY },
    ];
    failedWith(await h.run("preview"), "woven_company_not_listed");
    expect(h.fake.contentReads()).toEqual([]);
  });

  it("9. the right name on the Company page with another ID fails", async () => {
    const h = harness();
    h.fake.companyPageOverride = { id: JBA_COMPANY_ID, name: BCS_COMPANY };
    failedWith(await h.run("preview"), "woven_company_mismatch");
  });
});

describe("10. an automatic re-sign-in into JB & Associates is detected before reading or writing", () => {
  it("the session expires mid-listing; the re-sign-in lands in JB & Associates; nothing of it is read, nothing is written", async () => {
    const h = harness();
    h.fake.requireCompanySelection = false;
    h.fake.companyForLogin = (n) => (n === 1 ? BCS_COMPANY_ID : JBA_COMPANY_ID);
    h.fake.expireSessionAfter = 4;
    const outcome = await h.run("preview");
    expect(outcome.status).toBe("failed");
    expect(h.fake.logins).toBe(2);
    expect(h.fake.contentReads().filter((r) => r.company !== BCS_COMPANY_ID)).toEqual([]);
    expect(h.store.items.size).toBe(0);
    expect(h.sink.ingestCalls + h.sink.retireCalls + h.sink.metadataCalls).toBe(0);
  });
});

describe("11–12. production builds only the Buff City Soap connector", () => {
  it("11. the factory returns the BCS connector, whatever the configuration — it has no tenant input", () => {
    const configs: WovenKnowledgeConfig[] = [
      readWovenKnowledgeConfig(ENV_OK),
      readWovenKnowledgeConfig({ ...ENV_OK, WOVEN_BCS_FILE_LIBRARY_DOWNLOAD_ENABLED: "true" }),
      { ...readWovenKnowledgeConfig(ENV_OK), downloads: { fileLibrary: false } },
    ];
    for (const config of configs) {
      const connector = createWovenKnowledgeConnector(config, new WovenTeamClient({ baseUrl: config.baseUrl }));
      expect(connector).toBeInstanceOf(BuffCitySoapWovenConnector);
      expect(connector.constructor.name).toBe("BuffCitySoapWovenConnector");
    }
    expect(createWovenKnowledgeConnector.length).toBe(2);
  });

  it("12. no production module imports the reference (Ask Sunny) connector, its routes or its name-based company selection", () => {
    const offenders = productionSources().filter(({ text }) =>
      /from\s+["'][^"']*(?:\/|^\.\/|^\.\.\/)reference\/[^"']*["']|from\s+["']\.\/reference["']|\bWovenKnowledgeConnector\b|nameContinueLoginSubmission|wovenCompanySelector|markupCompanySelector|dropdownCompanyVerifier/.test(text),
    );
    expect(offenders.map((o) => o.path)).toEqual([]);
  });

  it("12. no production module reads an inherited tenant variable except to refuse it, and none names another company", () => {
    const readers = productionSources().filter(({ text }) => /WOVEN_TEAM_COMPANY|WOVEN_TEAM_BASE_URL/.test(text));
    expect(readers.map((r) => r.path)).toEqual(["src/lib/knowledge-sync/woven/config.ts"]);
    const naming = productionSources().filter(({ text }) => /JB\s*&(?:amp;)?\s*Associates|Sun\s*Tan\s*City|Ask\s*Sunny|1BA00000/i.test(text));
    expect(naming.map((n) => n.path)).toEqual([]);
  });
});

describe("13. nothing is written or reconciled after a company mismatch", () => {
  it("a company switch after listing aborts the sync: no manifest change, no ingest, no retirement, no settings change", async () => {
    const h = harness();
    expect((await h.run("preview")).status).toBe("succeeded");
    await h.store.saveDecision({ source: "woven", audienceKey: "all positions", decision: "company_wide", decidedBy: "admin:test", decidedAt: "2026-10-06T12:00:00Z" });
    expect((await h.run("sync")).status).toMatch(/^succeeded/);
    const manifest = JSON.stringify([...h.store.items.values()]);
    const settings = JSON.stringify(await h.store.loadSettings());
    const calls = { ingest: h.sink.ingestCalls, retire: h.sink.retireCalls, metadata: h.sink.metadataCalls };

    /* Remove content so a reconciliation WOULD retire it — then switch company mid-run. */
    h.fake.content[BCS_COMPANY_ID]!.procedures = [];
    h.fake.switchCompanyAfter = 3;
    failedWith(await h.run("sync"), "woven_company_mismatch");

    expect(JSON.stringify([...h.store.items.values()])).toBe(manifest);
    expect(JSON.stringify(await h.store.loadSettings())).toBe(settings);
    expect({ ingest: h.sink.ingestCalls, retire: h.sink.retireCalls, metadata: h.sink.metadataCalls }).toEqual(calls);
    expect(h.sink.searchable().some((d) => /Bed Cleaning|Spray Tan|Tanning/.test(d.title))).toBe(false);
  });

  it("a mismatch at sign-in writes nothing at all, not even a preview inventory", async () => {
    const h = harness();
    h.fake.requireCompanySelection = false;
    h.fake.defaultCompanyId = JBA_COMPANY_ID;
    failedWith(await h.run("preview"), "woven_company_mismatch");
    expect(h.store.items.size).toBe(0);
    expect(await h.store.loadPreviewInventory()).toEqual([]);
    expect(h.fake.writes()).toEqual([]);
  });
});

/* ------------------------------------------------------------- sources -- */

const ROOT = join(__dirname, "../../../../..");

/** Every production source file: not a test, not test support, not the reference folder. */
function productionSources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "node_modules" || name === "reference" || full.endsWith(join("src", "test"))) continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js)$/.test(name)) continue;
      if (/\.test\.(ts|tsx|mjs)$|test-support|integration-support|\.dry-run\.test\./.test(name)) continue;
      out.push({ path: relative(ROOT, full).split("\\").join("/"), text: readFileSync(full, "utf8") });
    }
  };
  walk(join(ROOT, "src"));
  return out;
}
