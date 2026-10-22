import { describe, expect, it, vi } from "vitest";

import type { DirectoryRosterRow, ScopedRosterResult } from "@/lib/forms/employee-roster";
import { continuationFor } from "@/lib/forms/proposal-continuation";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import { buildStoreIndex } from "@/lib/stores/resolver";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * QA, 21 OCTOBER 2026 — CAPITALS, POSSESSIVES, PUNCTUATED STORES
 * ============================================================================
 *
 * Reported on the reference platform and reproduced here in Buff City Soap's
 * terms, through the real server path:
 *
 *   1. "COACHING FORM PAULYNE CAMACHO LATE 3 TIMES" asked who the form was for.
 *   2. "Paulyne Camacho's CA for no call no show 10/18" gave no card at all, and
 *      "Ellie Sendgraff's coaching form" asked "Did you mean Ellie Sendgraff?".
 *   3. "at kearney about bed cleaning": what the form was about hid the store.
 *   4. "paulyne camacho" was printed in lower case on the cards and in the
 *      note about a name the employee list lacks.
 *   5. "brandi algya asm grand island" named nobody, where the capitalised
 *      line worked.
 *   6. "coaching form for will turner" named nobody.
 *
 * The reference platform's Google store codes and its own store nicknames are
 * its data, not ported: Buff City Soap's equivalents are the Woven mappings
 * and `COMPANY_LOCATION_NICKNAMES`, read by the same store resolver.
 *
 * The directory holds three people; everybody else is off the directory, so
 * the name on the card can only come from the manager's words.
 */

const state = vi.hoisted(() => ({ rows: [] as DirectoryRosterRow[] }));

vi.mock("@/lib/forms/repository", () => ({
  listTemplateSummaries: async () => {
    throw new Error("the proposal takes the library from its caller");
  },
  getTemplateByKey: async () => {
    throw new Error("the proposal must not read the library");
  },
}));

vi.mock("@/lib/stores/woven-aliases", () => ({
  loadKnownTitles: async () => [],
  loadStoreIndex: async () => buildStoreIndex({ stores: COMPANY_LOCATIONS }),
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

function person(first: string, last: string, locationIds: string[]): DirectoryRosterRow {
  return {
    id: `emp-${first}-${last}`.toLowerCase(),
    firstName: first,
    lastName: last,
    preferredFirstName: null,
    employmentStatus: "active",
    locationIds,
    positionName: "Production Associate",
    lastSyncedAt: new Date().toISOString(),
  };
}

state.rows = [
  person("Paulyne", "Camacho", ["loc-236"]),
  person("Ellie", "Sendgraff", ["loc-236"]),
  person("Shannon", "McAllister", ["loc-66"]),
];

const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

const template = (key: string, name: string, permission: string, order: number) => ({
  id: `tpl-${key}`,
  key,
  name,
  shortName: name,
  description: name,
  layoutFamily: key,
  requiredPermission: permission,
  active: true,
  displayOrder: order,
  currentVersion: { id: `v-${key}`, status: "published", variants: [] },
  draftVersion: null,
  versionCount: 1,
  activeAsset: null,
  assetCount: 0,
});

const LIBRARY = [
  template("coaching", "Coaching Form", "create_coaching_form", 1),
  template("dpoa", "Corrective Action Form", "create_corrective_action", 2),
  template("follow-up-coaching", "Follow-up Coaching Form", "create_coaching_form", 3),
  template("policy-review", "Policy Review", "create_policy_review", 4),
  template("resignation-exit", "Resignation/Exit Form", "create_exit_form", 5),
  template("demotion", "Demotion Form", "create_employment_change_form", 6),
  template("position-transfer", "Position Transfer Form", "create_employment_change_form", 7),
];

let counter = 0;
function id(): string {
  counter += 1;
  return `msg-${counter}`;
}

/** Sends each turn the way the chat screen does; returns the latest assistant turn. */
async function converse(...turns: string[]): Promise<ChatMessage> {
  const { proposeFormForTurn } = await import("./form-proposal");
  const thread: ChatMessage[] = [];
  for (const question of turns) {
    const history = [...thread];
    const user: ChatMessage = { id: id(), role: "user", content: question, createdAt: "2026-10-21T12:00:00Z" };
    thread.push(user);
    const answer = await proposeFormForTurn({
      history,
      question,
      questionMessageId: user.id,
      actor: { role: "admin" as never, scope: GLOBAL },
      continueTemplateKey: continuationFor(history)?.templateKey,
      summaries: LIBRARY as never,
      today: "2026-10-21",
    });
    thread.push({
      id: id(),
      role: "assistant",
      content: answer?.content ?? "(grounded advice answer)",
      createdAt: "2026-10-21T12:00:00Z",
      ...(answer?.formProposal ? { formProposal: answer.formProposal } : {}),
    });
  }
  return thread[thread.length - 1]!;
}

function expectCard(last: ChatMessage, templateKey: string, employee: string) {
  expect(last.formProposal, last.content).toBeDefined();
  expect(last.formProposal!.templateKey).toBe(templateKey);
  expect(last.formProposal!.employeeName, last.content).toBe(employee);
}

describe("1. an all-caps message reads the name like any other", () => {
  it("COACHING FORM PAULYNE CAMACHO LATE 3 TIMES", async () => {
    const last = await converse("COACHING FORM PAULYNE CAMACHO LATE 3 TIMES");
    // On the directory: the directory's spelling, and her store.
    expectCard(last, "coaching", "Paulyne Camacho");
    expect(last.formProposal!.locationId).toBe("loc-236");
  }, 15_000);

  // QA 22 Oct 2026 decision: off the directory the manager's spelling is kept as typed.
  it.each([["COACHING FORM JANE DOE LATE 3 TIMES", "JANE DOE"], ["coaching form jane doe late 3 times", "jane doe"]])("%s", async (question, employee) => {
    // Off the directory: as typed.
    expectCard(await converse(question), "coaching", employee);
  });

  it("one word before the topic is still not read as a name", async () => {
    const last = await converse("coaching form floor late 3 times");
    expect(last.formProposal?.employeeName ?? null).toBeNull();
  });
});

describe("2. a possessive names the person, and the 's is not part of the name", () => {
  it("Paulyne Camacho's CA for no call no show 10/18 is a Corrective Action Form", async () => {
    const last = await converse("Paulyne Camacho's CA for no call no show 10/18");
    expectCard(last, "dpoa", "Paulyne Camacho");
    expect(last.formProposal!.formDate).toBe("2026-10-18");
  });

  it.each([
    ["Ellie Sendgraff's coaching form", "coaching"],
    ["Ellie Sendgraff’s coaching form", "coaching"],
    ["start ellie sendgraff's coaching form", "coaching"],
    ["start Ellie Sendgraff's CA, she was late again", "dpoa"],
  ])("%s", async (question, templateKey) => {
    const last = await converse(question);
    expectCard(last, templateKey, "Ellie Sendgraff");
    expect(last.content).not.toMatch(/did you mean/i);
  });

  it.each(["Ellie's coaching form", "Ellie's CA - she was late 3 times this week"])(
    "%s confirms the first name against the directory",
    async (question) => {
      const last = await converse(question);
      expect(last.formProposal).toBeDefined();
      expect(last.content).toMatch(/^Did you mean \*\*Ellie Sendgraff\*\*\?/);
    },
  );

  it("a remark about somebody's CA is still not a request for one", async () => {
    const last = await converse("Ellie's CA was filed last week");
    expect(last.formProposal).toBeUndefined();
  });

  it("a contraction is not a possessive", async () => {
    expectCard(await converse("I need a coaching form", "It's Jane Doe"), "coaching", "Jane Doe");
  });
});

describe("3. a store set off by punctuation, or followed by what the form is about", () => {
  it("a store followed by what the form is about still names the store", async () => {
    const last = await converse("coaching form for paulyne camacho at kearney about bed cleaning");
    expectCard(last, "coaching", "Paulyne Camacho");
    // Named in the message, so it wins over her directory store (Grand Island).
    expect(last.formProposal!.locationId).toBe("loc-66");
  });

  it.each([
    ["coaching form for Jane Doe, Lee's Summit", "loc-219"],
    ["coaching form for Jane Doe (Lee's Summit)", "loc-219"],
    ["coaching form for Jane Doe at kearney, she was late", "loc-66"],
  ])("%s", async (question, store) => {
    const last = await converse(question);
    expectCard(last, "coaching", "Jane Doe");
    expect(last.formProposal!.locationId).toBe(store);
  });

  it("a store's road on its own is still a road", async () => {
    const last = await converse("coaching form for Jane Doe, she parked on west dodge again");
    expect(last.formProposal!.locationId).toBeNull();
  });
});

describe("4. the employee's name is printed capitalised, on every form", () => {
  it.each([
    ["create a demotion form for paulyne camacho from ASM to production associate", "demotion", "Paulyne Camacho"],
    ["create a policy review for paulyne camacho", "policy-review", "Paulyne Camacho"],
    // The directory's own spelling, mid-word capital included.
    ["create a demotion form for shannon mcallister from ASM to production associate", "demotion", "Shannon McAllister"],
    ["create a policy review for shannon mcallister", "policy-review", "Shannon McAllister"],
  ])("on the directory: %s", async (question, templateKey, employee) => {
    expectCard(await converse(question), templateKey, employee);
  });

  it.each([
    // QA 22 Oct 2026 decision: off the directory the manager's spelling is kept as typed.
    ["create a demotion form for jane doe from ASM to production associate", "demotion", "jane doe"],
    ["position transfer form for mary-kate o'neil to kearney", "position-transfer", "mary-kate o'neil"],
    ["create a policy review for jane doe", "policy-review", "jane doe"],
    ["exit form for jane doe", "resignation-exit", "jane doe"],
    ["coaching form for jane doe", "coaching", "jane doe"],
    // Capitalised by the manager: theirs, as typed.
    ["create a policy review for Jane McDonald", "policy-review", "Jane McDonald"],
    ["create a policy review for DeShawn Smith", "policy-review", "DeShawn Smith"],
  ])("off the directory: %s", async (question, templateKey, employee) => {
    expectCard(await converse(question), templateKey, employee);
  });

  it("the note about a name the directory lacks uses the printed spelling", async () => {
    const last = await converse("create a policy review for jane doe");
    // QA 22 Oct 2026 decision: off the directory the manager's spelling is kept as typed.
    expect(last.content).toContain("I didn't find **jane doe** in the employee list");
  });
});

describe("5. name, role and store typed in lower case", () => {
  it("brandi algya asm grand island coaching form", async () => {
    const last = await converse("brandi algya asm grand island coaching form");
    // QA 22 Oct 2026 decision: off the directory the manager's spelling is kept as typed.
    expectCard(last, "coaching", "brandi algya");
    expect(last.formProposal!.employeeRole).toBe("Assistant Manager");
    expect(last.formProposal!.locationId).toBe("loc-236");
  });

  it("the replayed conversation: the form, a date, then the line on its own", async () => {
    const last = await converse(
      "can you create a coaching form for a manager on the onboarding process",
      "Oct 9",
      "brandi algya asm grand island",
    );
    // QA 22 Oct 2026 decision: off the directory the manager's spelling is kept as typed.
    expectCard(last, "coaching", "brandi algya");
    expect(last.formProposal!.employeeRole).toBe("Assistant Manager");
    expect(last.formProposal!.locationId).toBe("loc-236");
    expect(last.formProposal!.formDate).toBe("2026-10-09");
  });

  it("one name word before the role still names nobody", async () => {
    const last = await converse("I need a coaching form", "sarah asm grand island");
    expect(last.formProposal?.employeeName ?? "").not.toMatch(/grand island/i);
  });
});

describe("6. 'will' followed by a surname is a name", () => {
  it("coaching form for will turner", async () => {
    // QA 22 Oct 2026 decision: off the directory the manager's spelling is kept as typed.
    expectCard(await converse("coaching form for will turner"), "coaching", "will turner");
  });

  it.each(["coaching form for will", "the coaching form for will be done tomorrow"])(
    "%s names nobody",
    async (question) => {
      const last = await converse(question);
      expect(last.formProposal?.employeeName ?? null).toBeNull();
    },
  );
});
