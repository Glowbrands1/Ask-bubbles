import { afterEach, describe, expect, it, vi } from "vitest";

import type { DirectoryRosterRow, ScopedRosterResult } from "@/lib/forms/employee-roster";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import { buildStoreIndex, type StoreAlias } from "@/lib/stores/resolver";
import type { AccessScope } from "@/types";

/**
 * Pau, 24 Oct 2026: one close Woven name is a short note under the card.
 * The card in that same turn uses the typed name. It is not a question and
 * it does not block. No note when nothing is close. The flag off still asks
 * "Did you mean".
 */

const WOVEN_ALIASES: StoreAlias[] = [
  { storeId: "loc-264", kind: "woven_name", text: "NE Omaha Dodge" },
  { storeId: "loc-264", kind: "woven_number", text: "225" },
];

const state: { rows: DirectoryRosterRow[] } = { rows: [] };

vi.mock("@/lib/stores/woven-aliases", () => ({
  loadKnownTitles: async () => ["Team Member", "Store Director"],
  loadStoreIndex: async () => buildStoreIndex({ stores: COMPANY_LOCATIONS, extraAliases: WOVEN_ALIASES }),
}));

vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRosterResult: async (scope: AccessScope | null): Promise<ScopedRosterResult> => {
      if (!scope) return { status: "not_checked", reason: "no_scope" };
      return { status: "ok", roster: actual.scopeRoster(state.rows, scope) };
    },
  };
});

const saved = process.env.TYPED_NAME_ENABLED;

afterEach(() => {
  if (saved === undefined) delete process.env.TYPED_NAME_ENABLED;
  else process.env.TYPED_NAME_ENABLED = saved;
});

const fresh = () => new Date().toISOString();

function person(
  id: string,
  first: string,
  last: string,
  locationIds: string[],
): DirectoryRosterRow {
  return {
    id,
    firstName: first,
    lastName: last,
    preferredFirstName: null,
    employmentStatus: "active",
    locationIds,
    positionName: "Team Member",
    lastSyncedAt: fresh(),
  };
}

const JANE = person("e-jane", "Jane", "Doe", ["loc-264"]);
const JAYNE = person("e-jayne", "Jayne", "Doe", ["loc-264"]);

const template = (key: string, name: string, permission: string) => ({
  id: `tpl-${key}`,
  key,
  name,
  shortName: name,
  description: name,
  layoutFamily: "coaching",
  requiredPermission: permission,
  active: true,
  displayOrder: 1,
  currentVersion: { id: "v1", status: "published" },
  draftVersion: null,
  versionCount: 1,
  activeAsset: null,
  assetCount: 0,
});

const LIBRARY = [template("coaching", "Coaching Form", "create_coaching_form")];

const SCOPE: AccessScope = {
  level: "location",
  primaryAreaId: "loc-264",
  alsoCoversAreaIds: [],
};

async function ask(question: string, rows: DirectoryRosterRow[]) {
  state.rows = rows;
  vi.resetModules();
  const { proposeFormForTurn } = await import("@/lib/ai/form-proposal");
  return proposeFormForTurn({
    history: [],
    question,
    questionMessageId: "msg-current",
    actor: { role: "location_manager", scope: SCOPE },
    summaries: LIBRARY as never,
  });
}

describe("one close Woven name", () => {
  it("builds the card with the typed name and puts Woven has Jane Doe on the card", async () => {
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    const response = await ask("Create a coaching form for Jayne Doe at Omaha West Dodge", [JANE]);
    expect(response?.formProposal).toBeTruthy();
    expect(response!.formProposal!.employeeName).toBe("Jayne Doe");
    expect(response!.formProposal!.closeMatchNote).toBe("Woven has Jane Doe");
    expect(response!.formProposal!.closeMatchNote).not.toMatch(/\?/);
    expect(response!.content.startsWith("Did you mean")).toBe(false);
    expect(response!.content).not.toContain("Woven has");
    expect(response!.content).not.toMatch(/Did you mean/);
  });

  it("adds no note when Woven has nobody close", async () => {
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    const response = await ask("Create a coaching form for Test Employee at Omaha West Dodge", [JANE]);
    expect(response?.formProposal?.employeeName).toBe("Test Employee");
    expect(response?.formProposal?.closeMatchNote).toBeUndefined();
    expect(response!.content).not.toContain("Woven has");
    expect(response!.content).not.toMatch(/Did you mean/);
  });

  it("adds no note when the typed name is the Woven name", async () => {
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    const response = await ask("Create a coaching form for Jane Doe at Omaha West Dodge", [JANE]);
    expect(response?.formProposal?.employeeName).toBe("Jane Doe");
    expect(response?.formProposal?.closeMatchNote).toBeUndefined();
    expect(response!.content).not.toMatch(/^Woven has /);
  });

  it("still asks when two people are close, and does not attach the note", async () => {
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    const response = await ask("Create a coaching form for Jyne Doe at Omaha West Dodge", [JANE, JAYNE]);
    expect(response!.content).toMatch(/^Did you mean /);
    expect(response?.formProposal?.closeMatchNote).toBeUndefined();
  });

  it("asks Did you mean when the flag is off, and does not attach the note", async () => {
    delete process.env.TYPED_NAME_ENABLED;
    const response = await ask("Create a coaching form for Jayne Doe at Omaha West Dodge", [JANE]);
    expect(response!.content).toMatch(/^Did you mean \*\*Jane Doe\*\*\?/);
    expect(response?.formProposal?.closeMatchNote).toBeUndefined();
  });
});
