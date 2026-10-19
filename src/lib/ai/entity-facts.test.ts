import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DirectoryRosterRow, ScopedRosterResult } from "@/lib/forms/employee-roster";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import { buildStoreIndex, type StoreAlias } from "@/lib/stores/resolver";
import type { AccessScope } from "@/types";

const ALIASES: StoreAlias[] = [
  { storeId: "loc-236", kind: "woven_name", text: "NE Grand Island" },
  { storeId: "loc-236", kind: "woven_number", text: "123" },
  { storeId: "loc-264", kind: "woven_number", text: "225" },
  { storeId: "loc-338", kind: "woven_name", text: "SD Dawley Farms" },
];
const reads = { roster: 0 };
const state: { rows: DirectoryRosterRow[]; outcome: "ok" | "unavailable" | "not_checked" } = { rows: [], outcome: "ok" };

vi.mock("@/lib/stores/woven-aliases", () => ({
  loadStoreIndex: async () => buildStoreIndex({ stores: COMPANY_LOCATIONS, extraAliases: ALIASES }),
}));
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRosterResult: async (scope: AccessScope | null): Promise<ScopedRosterResult> => {
      reads.roster += 1;
      if (state.outcome === "unavailable") return { status: "unavailable" };
      if (state.outcome === "not_checked" || !scope) return { status: "not_checked", reason: scope ? "area_scope" : "no_scope" };
      return { status: "ok", roster: actual.scopeRoster(state.rows, scope) };
    },
  };
});

const { resolveChatEntities } = await import("./entity-facts");

const NOW = Date.parse("2026-10-19T15:00:00Z");
const row = (id: string, first: string, last: string, locationIds: string[], positionName: string | null, extra: Partial<DirectoryRosterRow> = {}): DirectoryRosterRow => ({
  id, firstName: first, lastName: last, preferredFirstName: null, employmentStatus: "active", locationIds, positionName,
  lastSyncedAt: new Date(NOW - 3_600_000).toISOString(), ...extra,
});
const ALL: AccessScope = { level: "location", primaryAreaId: "loc-236", alsoCoversAreaIds: ["loc-66", "loc-67", "loc-219", "loc-225", "loc-264", "loc-338"] };
const ONE: AccessScope = { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] };
const actor = (scope: AccessScope | null = ALL) => ({ role: "location_manager" as never, scope });
const ask = (question: string, scope: AccessScope | null = ALL) => resolveChatEntities({ question, actor: actor(scope), now: NOW });

beforeEach(() => {
  reads.roster = 0;
  state.outcome = "ok";
  state.rows = [row("1", "Sarah", "Miller", ["loc-236"], "Production Associate"), row("2", "Dana", "Moss", ["loc-264"], "Store Manager")];
});

describe("a title question is answered from Woven, outright", () => {
  it("states the verified title, store and sync date, with no model call", async () => {
    const { direct, block } = await ask("What is Sarah Miller's job title?");
    expect(block).toBeNull();
    expect(direct!.content).toContain("**Sarah Miller**'s job title in Woven is **Production Associate**");
    expect(direct!.content).toContain("Grand Island, NE (Store 236)");
    expect(direct!.content).toContain("Woven record last synced Oct 19, 2026");
  });

  it("flags a store the question names that Woven does not have them at", async () => {
    const { direct } = await ask("What's Sarah Miller's title at the Omaha store?");
    expect(direct!.content).toContain("**Production Associate**");
    expect(direct!.content).toContain("Woven has **Sarah Miller** at **Grand Island, NE (Store 236)**");
  });

  it("never offers a title Woven does not hold or has not refreshed", async () => {
    state.rows = [row("1", "Sarah", "Miller", ["loc-236"], null)];
    expect((await ask("What is Sarah Miller's title?")).direct!.content).toContain("no job title on record");
    state.rows = [row("1", "Sarah", "Miller", ["loc-236"], "Production Associate", { lastSyncedAt: "2026-09-01T00:00:00Z" })];
    const stale = (await ask("What is Sarah Miller's title?")).direct!.content;
    expect(stale).toContain("hasn't been refreshed");
    expect(stale).not.toContain("Production Associate");
  });

  it("says Woven was unavailable, and that no match was found", async () => {
    state.outcome = "unavailable";
    expect((await ask("What is Sarah Miller's job title?")).direct!.content).toContain("couldn't reach the Woven employee records");
    state.outcome = "ok";
    const none = (await ask("What is Zelda Quinn's job title?")).direct!.content;
    expect(none).toContain("couldn't verify **Zelda Quinn** in Woven");
  });

  it("asks about a close spelling instead of answering for someone else", async () => {
    const { direct } = await ask("What is Sara Miler's job title?");
    expect(direct!.content).toContain("Did you mean **Sarah Miller**");
    expect(direct!.content).not.toContain("Production Associate");
  });

  it("asks which store when two people share a name, and uses the store named", async () => {
    state.rows = [row("1", "Sarah", "Smith", ["loc-236"], "Production Associate"), row("2", "Sarah", "Smith", ["loc-67"], "Store Manager")];
    const asked = await ask("What is Sarah Smith's job title?");
    expect(asked.direct!.content).toContain("More than one **Sarah Smith** works at your stores");
    expect(asked.direct!.content).not.toContain("Store Manager");
    const resolved = await ask("What is Sarah Smith's job title at Store 67?");
    expect(resolved.direct!.content).toContain("**Store Manager**");
  });
});

describe("authorised scope only", () => {
  it("does not reveal an employee outside the asker's stores — the same answer as someone Woven lacks", async () => {
    const outside = (await ask("What is Dana Moss's job title?", ONE)).direct!.content;
    const missing = (await ask("What is Zelda Quinn's job title?", ONE)).direct!.content;
    expect(outside).not.toContain("Store Manager");
    expect(outside.replace("Dana Moss", "X")).toBe(missing.replace("Zelda Quinn", "X"));
  });

  it("reports an unresolved area scope as not checked, and says nothing in preview mode", async () => {
    state.outcome = "not_checked";
    expect((await ask("What is Sarah Miller's job title?", ALL)).direct!.content).toContain("isn't available for your account");
    expect(await ask("What is Sarah Miller's job title?", null)).toEqual({ block: null, direct: null });
  });
});

describe("a store question is answered from the registered stores", () => {
  it.each([
    ["What is store 236?", "Grand Island, NE (Store 236)"],
    ["Which store is Dawley Farms?", "Sioux Falls, SD (E 18th St) (Store 338)"],
    ["What store is number 123?", "Grand Island, NE (Store 236)"],
  ])("%s", async (question, label) => {
    expect((await ask(question)).direct!.content).toContain(label);
  });

  it("says plainly when there is no such store, and does not invent one", async () => {
    const { direct } = await ask("What is store 102?");
    expect(direct!.content).toContain("couldn't find a registered store matching");
    expect(direct!.content).not.toMatch(/\(Store 102\)/);
  });

  it("explains a number the two systems disagree about", async () => {
    const { direct } = await ask("What is store 225?");
    expect(direct!.content).toContain("could be");
    expect(direct!.content).toContain("Sioux Falls, SD (W 41st St) (Store 225)");
    expect(direct!.content).toContain("Omaha, NE (West Dodge Rd) (Store 264)");
  });
});

describe("any other question that names someone rides along with the verified record", () => {
  it("attaches the record for the model, with the rule about titles", async () => {
    const { direct, block } = await ask("How should I coach Sarah Miller about arriving late at Grand Island?");
    expect(direct).toBeNull();
    expect(block).toContain("VERIFIED RECORDS");
    expect(block).toContain("Employee: Sarah Miller — Woven job title: Production Associate");
    expect(block).toContain("Store: the question names Grand Island, NE (Store 236)");
  });

  it("tells the model a store does not exist rather than letting it guess", async () => {
    const { block } = await ask("What is the opening checklist at Store 102?");
    expect(block).toContain('"Store 102" is not a registered Buff City Soap store');
  });

  it("attaches nothing, and reads nothing, when the question names nobody and no store", async () => {
    expect(await ask("What is the attendance policy?")).toEqual({ block: null, direct: null });
    expect(await ask("how many sick days do part time employees get")).toEqual({ block: null, direct: null });
    expect(reads.roster).toBe(0);
  });

  it("never throws: a failure leaves the question to be answered as before", async () => {
    state.rows = null as never;
    expect(await ask("How should I coach Sarah Miller?")).toEqual({ block: null, direct: null });
  });
});
