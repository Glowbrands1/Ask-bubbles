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
  loadKnownTitles: async () => ["Production Associate", "Store Manager"],
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
const ask = (question: string, scope: AccessScope | null = ALL, history: { role: string; content: string }[] = []) =>
  resolveChatEntities({ question, history, actor: actor(scope), now: NOW });

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

describe("follow-ups about someone the conversation has established", () => {
  const talk = (...lines: [string, string][]) => lines.map(([role, content]) => ({ role, content }));
  const ABOUT_SARAH = talk(["user", "Can you tell me about Sarah Miller?"], ["assistant", "Sure — what would you like to know about Sarah Miller?"]);

  it("'What about her title?' answers for the one person clearly in play", async () => {
    const { direct } = await ask("What about her title?", ALL, ABOUT_SARAH);
    expect(direct!.content).toContain("**Sarah Miller**'s job title in Woven is **Production Associate**");
  });

  it("works for 'his', 'their', and for a store question that rides along with the record", async () => {
    expect((await ask("And what is their job title?", ALL, ABOUT_SARAH)).direct!.content).toContain("Production Associate");
    const where = await ask("Where does she work?", ALL, ABOUT_SARAH);
    expect(where.direct).toBeNull();
    expect(where.block).toContain("Employee: Sarah Miller — Woven job title: Production Associate; Woven store: Grand Island, NE (Store 236)");
  });

  it("uses the most recent person, not an earlier one", async () => {
    const history = talk(["user", "What is Sarah Miller's job title?"], ["assistant", "…"], ["user", "And Dana Moss?"], ["assistant", "Dana Moss is …"]);
    expect((await ask("What about her title?", ALL, history)).direct!.content).toContain("**Dana Moss**");
  });

  it("asks who is meant when the last turn names two people — and states nothing", async () => {
    const history = talk(["user", "Compare Sarah Miller and Dana Moss for me"]);
    const { direct } = await ask("What about her title?", ALL, history);
    expect(direct!.content).toContain("Who do you mean?");
    expect(direct!.content).not.toMatch(/Production Associate|Store Manager/);
  });

  it("asks who is meant when nobody has been established", async () => {
    const { direct } = await ask("What about her title?", ALL, talk(["user", "What is the attendance policy?"]));
    expect(direct!.content).toContain("Who do you mean?");
  });

  it("never carries over somebody outside the asker's scope", async () => {
    const history = talk(["user", "What is Dana Moss's job title?"]);
    const { direct } = await ask("What about her title?", ONE, history);
    expect(direct!.content).toContain("Who do you mean?");
    expect(direct!.content).not.toContain("Store Manager");
  });

  it("does not treat an ordinary pronoun question as a lookup", async () => {
    expect(await ask("Should she be coached about attendance?", ALL, ABOUT_SARAH)).toEqual({ block: null, direct: null });
  });
});

describe("a Woven job title in the question is not a person", () => {
  it("'What does the Store Manager do at store 236?' names nobody", async () => {
    const { direct, block } = await ask("What is Sarah Miller's job title — is she the Production Associate?");
    expect(direct!.content).toContain("**Production Associate**");
    expect(block).toBeNull();
  });
});

describe("names typed in lower case are names too", () => {
  it.each([
    "whats sarah miller's title?",
    "what is sarah miller job title",
    "SARAH MILLER title?",
  ])("%s", async (question) => {
    const { direct } = await ask(question);
    expect(direct!.content).toContain("**Sarah Miller**'s job title in Woven is **Production Associate**");
  });

  it.each(["what about sarah miller?", "who is sarah miller"])("%s — the verified record rides along for the model", async (question) => {
    const { direct, block } = await ask(question);
    expect(direct).toBeNull();
    expect(block).toContain("Employee: Sarah Miller — Woven job title: Production Associate");
  });

  it("a possessive typed without its apostrophe is asked about, not guessed", async () => {
    expect((await ask("whats sarah millers title")).direct!.content).toContain("Did you mean **Sarah Miller**");
  });

  it("a lower-case name Woven does not have gets nothing invented: no record, no title", async () => {
    const out = await ask("whats zelda quinn's title?");
    expect(out.block ?? "").not.toMatch(/Production Associate|Store Manager/);
    expect(out.direct?.content ?? "").not.toMatch(/Production Associate|Store Manager/);
  });

  it("a lower-case close spelling is asked about", async () => {
    const { direct } = await ask("whats sara miler's title?");
    expect(direct!.content).toContain("Did you mean **Sarah Miller**");
  });

  it("lower-case names outside the asker's scope look like names Woven lacks", async () => {
    const outside = await ask("whats dana moss's title?", ONE);
    const missing = await ask("whats zelda quinn's title?", ONE);
    expect(JSON.stringify(outside)).not.toContain("Store Manager");
    expect(JSON.stringify(outside).replace("Dana Moss", "X")).toBe(JSON.stringify(missing).replace("Zelda Quinn", "X"));
  });

  it("ordinary lower-case questions still name nobody and read nothing", async () => {
    // A possible name costs one read to check; it is not anyone, so nothing is said.
    expect(await ask("whats the attendance policy title?")).toEqual({ block: null, direct: null });
    reads.roster = 0;
    expect(await ask("what is the dress code")).toEqual({ block: null, direct: null });
    expect(reads.roster).toBe(0);
  });
});

describe("stores, names and titles are read in any case in general chat", () => {
  it.each([
    ["which store is dawley farms", "Store 338"],
    ["WHICH STORE IS DAWLEY FARMS?", "Store 338"],
    ["what is store 236", "Grand Island, NE (Store 236)"],
    ["what store is ne grand island", "Store 236"],
  ])("%s", async (question, expected) => {
    expect((await ask(question)).direct!.content).toContain(expected);
  });

  it.each(["WHATS SARAH MILLER'S TITLE?", "whats SARAH miller's title", "what is sarah miller's job title at store 236"])("%s", async (question) => {
    expect((await ask(question)).direct!.content).toContain("**Production Associate**");
  });

  it("a lower-case title in the question does not turn into a person", async () => {
    const { direct } = await ask("is sarah miller a production associate? whats her title");
    expect(direct?.content ?? "").toContain("Production Associate");
  });
});
