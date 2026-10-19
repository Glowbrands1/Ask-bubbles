import { describe, expect, it, vi } from "vitest";

import type { RosterEmployee } from "@/lib/forms/employee-match";
import type { DirectoryRosterRow, ScopedRosterResult } from "@/lib/forms/employee-roster";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import { buildStoreIndex, type StoreAlias } from "@/lib/stores/resolver";
import type { AccessScope } from "@/types";

/*
 * END TO END, THROUGH THE REAL FORM PROPOSAL, on the REAL registered roster
 * (seven Buff City Soap stores — nothing mocked there). Only the two reads that
 * touch the database are replaced: the Woven store names a person mapped, and
 * the Woven employee directory. Scoping is the production `scopeRoster`.
 */

const WOVEN_ALIASES: StoreAlias[] = [
  { storeId: "loc-236", kind: "woven_name", text: "NE Grand Island" },
  { storeId: "loc-236", kind: "woven_number", text: "123" },
  { storeId: "loc-264", kind: "woven_name", text: "NE Omaha Dodge" },
  { storeId: "loc-264", kind: "woven_number", text: "225" },
  { storeId: "loc-225", kind: "woven_name", text: "SD Sioux Falls" },
  { storeId: "loc-225", kind: "woven_number", text: "264" },
  { storeId: "loc-338", kind: "woven_name", text: "SD Dawley Farms" },
];

const state: { rows: DirectoryRosterRow[]; outage: boolean } = { rows: [], outage: false };

vi.mock("@/lib/stores/woven-aliases", () => ({
  loadStoreIndex: async () => buildStoreIndex({ stores: COMPANY_LOCATIONS, extraAliases: WOVEN_ALIASES }),
}));

vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRosterResult: async (scope: AccessScope | null): Promise<ScopedRosterResult> => {
      if (state.outage) return { status: "unavailable" };
      if (!scope) return { status: "not_checked", reason: "no_scope" };
      return { status: "ok", roster: actual.scopeRoster(state.rows, scope) };
    },
  };
});

const fresh = () => new Date().toISOString();

function person(
  id: string,
  first: string,
  last: string,
  locationIds: string[],
  positionName: string | null,
  extra: Partial<DirectoryRosterRow> = {},
): DirectoryRosterRow {
  return { id, firstName: first, lastName: last, preferredFirstName: null, employmentStatus: "active", locationIds, positionName, lastSyncedAt: fresh(), ...extra };
}

const template = (key: string, name: string, permission: string, order: number) => ({
  id: `tpl-${key}`, key, name, shortName: name, description: name, layoutFamily: "coaching",
  requiredPermission: permission, active: true, displayOrder: order,
  currentVersion: { id: "v1", status: "published" }, draftVersion: null, versionCount: 1, activeAsset: null, assetCount: 0,
});
const LIBRARY = [
  template("coaching", "Coaching Form", "create_coaching_form", 1),
  template("dpoa", "Corrective Action Form", "create_corrective_action", 2),
];

const ALL_STORES: AccessScope = {
  level: "location",
  primaryAreaId: "loc-236",
  alsoCoversAreaIds: ["loc-66", "loc-67", "loc-219", "loc-225", "loc-264", "loc-338"],
};
const ADMIN: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

async function ask(question: string, scope: AccessScope = ALL_STORES, rows: DirectoryRosterRow[] = []) {
  state.rows = rows;
  vi.resetModules();
  vi.doMock("@/lib/forms/repository", () => ({
    listTemplateSummaries: async () => {
      throw new Error("the library comes from the caller");
    },
    getTemplateByKey: async () => {
      throw new Error("must not read or write the library");
    },
  }));
  const { proposeFormForTurn } = await import("@/lib/ai/form-proposal");
  const response = await proposeFormForTurn({
    history: [],
    question,
    questionMessageId: "msg-1",
    actor: { role: (scope.level === "global" ? "admin" : "location_manager") as never, scope },
    summaries: LIBRARY as never,
  });
  return response!;
}

const SARAH = [person("e1", "Sarah", "Miller", ["loc-236"], "Production Associate")];

describe("the expected outcome: a form from a code and a name", () => {
  it("'Create a coaching form for Sarah Miller at Store 236' identifies the store and verifies the title", async () => {
    const { formProposal: p, content } = await ask("Create a coaching form for Sarah Miller at Store 236", ALL_STORES, SARAH);
    expect(p).toMatchObject({
      employeeName: "Sarah Miller",
      locationId: "loc-236",
      locationName: "Grand Island, NE",
      locationResolution: "resolved",
      employeeRole: "Production Associate",
      status: "ready",
      employeeVerification: { status: "verified", title: "Production Associate" },
    });
    expect(content).not.toMatch(/Woven/);
  });

  it("a first name alone is confirmed against Woven, not guessed", async () => {
    const { formProposal: p, content } = await ask("Create a coaching form for Sarah at Store 236", ALL_STORES, SARAH);
    expect(p!.locationId).toBe("loc-236");
    expect(content).toMatch(/Did you mean \*\*Sarah Miller\*\*/);
  });
});

describe("1–6. every way of naming the store reaches the same record", () => {
  it.each([
    ["1. full name", "Create a corrective action form for Sarah Miller at Grand Island, NE", "loc-236"],
    ["2. code", "Create a corrective action form for Sarah Miller at store 236", "loc-236"],
    ["3. Woven name", "Create a corrective action form for Sarah Miller at NE Grand Island", "loc-236"],
    ["4. partial name", "Create a corrective action form for Sarah Miller at the Grand Island store", "loc-236"],
    ["4. partial, Woven-only name", "Create a corrective action form for Sarah Miller at Dawley Farms", "loc-338"],
    ["4. partial, one word of two", "Create a coaching form for Sarah Miller at Dawley", "loc-338"],
    ["Woven number", "Create a coaching form for Sarah Miller at store 123", "loc-236"],
  ])("%s", async (_name, question, locationId) => {
    const { formProposal: p } = await ask(question, ALL_STORES, [person("e1", "Sarah", "Miller", [locationId], "Production Associate")]);
    expect(p!.locationId).toBe(locationId);
    expect(p!.locationResolution).toBe("resolved");
    expect(p!.locationName).toBe(COMPANY_LOCATIONS.find((store) => store.id === locationId)!.name);
    expect(p!.status).toBe("ready");
  });

  it("works for a global actor too, and fills the store", async () => {
    const { formProposal: p } = await ask("Create a coaching form for Sarah Miller at Kearney", ADMIN, [person("e1", "Sarah", "Miller", ["loc-66"], "Production Associate")]);
    expect(p!.locationId).toBe("loc-66");
  });

  it("5/6. a typo or an abbreviation is asked about, never used silently", async () => {
    for (const [question, typed] of [
      ["Create a corrective action form for Sarah Miller at Kearny", "Kearny"],
      ["Create a corrective action form for Sarah Miller at GI", "gi"],
    ] as const) {
      const { formProposal: p, content } = await ask(question, ALL_STORES, SARAH);
      expect(p!.locationId, question).toBeNull();
      expect(p!.locationResolution).toBe("needs_selection");
      expect(p!.locationSelection).toMatchObject({ reason: "confirm" });
      expect(p!.authorizedLocationIds).toHaveLength(1);
      expect(p!.status).toBe("needs_location");
      expect(content).toMatch(/is that the store\?/);
      expect(content.toLowerCase()).toContain(typed.toLowerCase());
    }
  });

  it("9. two stores that share initials are both offered", async () => {
    const { formProposal: p, content } = await ask("Create a coaching form for Sarah Miller at SF", ALL_STORES, SARAH);
    expect(p!.locationId).toBeNull();
    expect(p!.locationSelection).toMatchObject({ reason: "ambiguous" });
    expect([...p!.authorizedLocationIds].sort()).toEqual(["loc-225", "loc-338"]);
    expect(content).toContain("Sioux Falls, SD (W 41st St) (Store 225)");
    expect(content).toContain("Sioux Falls, SD (E 18th St) (Store 338)");
  });

  it("a city two stores share is a question, offered only from the actor's own stores", async () => {
    const scope: AccessScope = { level: "location", primaryAreaId: "loc-225", alsoCoversAreaIds: ["loc-66"] };
    const { formProposal: p } = await ask("Create a coaching form for Sarah Miller at the Sioux Falls store", scope, SARAH);
    expect(p!.locationId).toBe("loc-225");
  });

  it("a store number two systems give to different stores is a question", async () => {
    const { formProposal: p, content } = await ask("Create a coaching form for Sarah Miller at store 225", ALL_STORES, SARAH);
    expect(p!.locationSelection).toMatchObject({ reason: "number_collision" });
    expect([...p!.authorizedLocationIds].sort()).toEqual(["loc-225", "loc-264"]);
    expect(content).toMatch(/different stores in different systems/);
  });

  it("a store that does not exist is said so, with nothing invented", async () => {
    const { formProposal: p, content } = await ask("Create a coaching form for Sarah Miller at Store 102", ALL_STORES, SARAH);
    expect(p!.locationId).toBeNull();
    expect(p!.locationSelection).toEqual({ reason: "not_found", typed: "Store 102" });
    expect(p!.status).toBe("needs_location");
    expect(content).toContain("I couldn't find a store matching **Store 102** in the registered stores");
    expect(content).not.toMatch(/Store 102\)/);
  });

  it("a store outside the manager's assignment is still never filled in", async () => {
    const scope: AccessScope = { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] };
    const { formProposal: p, content } = await ask("Create a coaching form for Sarah Miller at store 338", scope, SARAH);
    expect(p!.locationId).toBeNull();
    expect(p!.namedLocationOutOfScope).toBe("Sioux Falls, SD (E 18th St)");
    expect(content).toContain("isn't a store on your assignment");
  });
});

describe("7. the job title is Woven's", () => {
  it("replaces the title the manager's wording implied", async () => {
    const { formProposal: p } = await ask("Create a coaching form for Sarah Miller at Store 236, she's our shift lead", ALL_STORES, SARAH);
    expect(p!.employeeRole).toBe("Production Associate");
  });

  it("is not filled in from the template or the sentence when Woven has none", async () => {
    const { formProposal: p, content } = await ask("Create a coaching form for Sarah Miller at Store 236", ALL_STORES, [person("e1", "Sarah", "Miller", ["loc-236"], null)]);
    expect(p!.employeeRole).toBeNull();
    expect(p!.employeeVerification).toMatchObject({ status: "unverified", reason: "no_title" });
    expect(content).toContain("Woven has no job title");
  });
});

describe("8. two employees share a name", () => {
  const TWO = [
    person("e1", "Sarah", "Smith", ["loc-236"], "Production Associate"),
    person("e2", "Sarah", "Smith", ["loc-67"], "Store Manager"),
  ];

  it("asks which store, naming both, rather than choosing", async () => {
    const { formProposal: p, content } = await ask("Create a coaching form for Sarah Smith", ALL_STORES, TWO);
    expect(p!.employeeName).toBeNull();
    expect(content).toContain("More than one **Sarah Smith** works at your stores");
    expect(content).toContain("Grand Island, NE (Store 236)");
    expect(content).toContain("Bellevue, NE (Store 67)");
  });

  it("is settled by the store the manager names, and takes that person's title", async () => {
    const { formProposal: p } = await ask("Create a coaching form for Sarah Smith at Store 67", ALL_STORES, TWO);
    expect(p).toMatchObject({ employeeName: "Sarah Smith", locationId: "loc-67", employeeRole: "Store Manager", status: "ready" });
    expect(p!.employeeVerification).toMatchObject({ status: "verified", title: "Store Manager" });
  });

  it("asks about similar first names with last names that are close", async () => {
    const { content } = await ask("Create a coaching form for Sara Miler at Store 236", ALL_STORES, [
      person("e1", "Sarah", "Miller", ["loc-236"], "Production Associate"),
      person("e2", "Sara", "Millar", ["loc-236"], "Retail Associate"),
    ]);
    expect(content).toContain("**Sarah Miller**");
    expect(content).toContain("**Sara Millar**");
  });
});

describe("10. Woven has no matching employee", () => {
  it("keeps the typed name, says it is unverified, and fills no title", async () => {
    const { formProposal: p, content } = await ask("Create a coaching form for Zelda Quinn at Store 236, she's a manager", ALL_STORES, SARAH);
    expect(p!.employeeName).toBe("Zelda Quinn");
    expect(p!.employeeVerification).toMatchObject({ status: "unverified", reason: "not_found", title: null });
    expect(content).toContain("I didn't find **Zelda Quinn** in the employee list for your stores");
  });
});

describe("11. Woven is temporarily unavailable", () => {
  it("says verification failed and fills nothing from Woven", async () => {
    state.outage = true;
    try {
      const { formProposal: p, content } = await ask("Create a coaching form for Sarah Miller at Store 236", ALL_STORES, SARAH);
      expect(p!.locationId).toBe("loc-236");
      expect(p!.employeeName).toBe("Sarah Miller");
      expect(p!.employeeRole).toBeNull();
      expect(p!.employeeVerification).toMatchObject({ status: "unverified", reason: "unavailable", title: null });
      expect(content).toContain("couldn't reach the Woven employee records");
    } finally {
      state.outage = false;
    }
  });
});

describe("12. the employee and the store do not match", () => {
  it("files against the store the manager named and flags the difference", async () => {
    const { formProposal: p, content } = await ask("Create a coaching form for Sarah Miller at Store 67", ALL_STORES, SARAH);
    expect(p!.locationId).toBe("loc-67");
    expect(p!.employeeVerification).toMatchObject({ status: "verified", storeMismatch: true });
    expect(content).toContain("Woven has **Sarah Miller** at **Grand Island, NE (Store 236)**");
    expect(content).toContain("check that it's the right one");
  });
});

describe("a record Woven has not refreshed", () => {
  it("is not used for a title", async () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const { formProposal: p } = await ask("Create a coaching form for Sarah Miller at Store 236", ALL_STORES, [person("e1", "Sarah", "Miller", ["loc-236"], "Production Associate", { lastSyncedAt: old })]);
    expect(p!.employeeRole).toBeNull();
    expect(p!.employeeVerification).toMatchObject({ status: "unverified", reason: "stale" });
  });
});

describe("terminology", () => {
  it("never says Salon or Location to a manager in the store questions", async () => {
    const replies = await Promise.all([
      ask("Create a coaching form for Sarah Miller at Store 102", ALL_STORES, SARAH),
      ask("Create a coaching form for Sarah Miller at SF", ALL_STORES, SARAH),
      ask("Create a coaching form for Sarah Miller at store 225", ALL_STORES, SARAH),
    ]);
    for (const { content } of replies) {
      expect(content).not.toMatch(/\bsalon\b/i);
      expect(content).not.toMatch(/\blocation\b/i);
    }
  });
});

// Keeps the shared type honest: a roster row must carry what verification reads.
const _row: RosterEmployee = { id: "x", firstName: "A", lastName: "B", locationIds: [], positionName: null, employmentStatus: "active", lastSyncedAt: null };
void _row;
