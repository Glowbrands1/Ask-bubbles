import { describe, expect, it, vi } from "vitest";

import type { DirectoryRosterRow, ScopedRosterResult } from "@/lib/forms/employee-roster";
import { continuationFor } from "@/lib/forms/proposal-continuation";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import { buildStoreIndex } from "@/lib/stores/resolver";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * QA, 22 OCTOBER 2026 — B3: "today" ENDED THE OPEN INTAKE
 * ============================================================================
 *
 * QA's conversation, typed exactly:
 *
 *   "create coaching form for pat rivera, late 3 times this week"
 *   "i already told you"
 *   "today"
 *
 * The first two turns kept the Coaching card for Pat Rivera; the third named
 * no calendar date, so it left the intake for a grounded answer and a form
 * picker, and the card had to be asked for again. A reply that is only a day
 * now carries the open form forward; a question that mentions today, or a day
 * with no form open, still does not.
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

state.rows = [person("Pat", "Rivera", ["loc-264"])];

const MANAGER: AccessScope = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] };

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

/** Sends each turn the way the chat screen does; returns the latest assistant turn (null: left the forms path). */
async function converse(...turns: string[]): Promise<ChatMessage | null> {
  const { proposeFormForTurn } = await import("./form-proposal");
  const thread: ChatMessage[] = [];
  let last: ChatMessage | null = null;
  for (const question of turns) {
    const history = [...thread];
    const user: ChatMessage = { id: id(), role: "user", content: question, createdAt: "2026-10-22T12:00:00Z" };
    thread.push(user);
    const answer = await proposeFormForTurn({
      history,
      question,
      questionMessageId: user.id,
      actor: { role: "location_manager" as never, scope: MANAGER },
      continueTemplateKey: continuationFor(history)?.templateKey,
      summaries: LIBRARY as never,
      today: "2026-10-22",
    });
    last = answer?.formProposal
      ? { id: id(), role: "assistant", content: answer.content, createdAt: "2026-10-22T12:00:00Z", formProposal: answer.formProposal }
      : null;
    thread.push(last ?? { id: id(), role: "assistant", content: "(grounded advice answer)", createdAt: "2026-10-22T12:00:00Z" });
  }
  return last;
}

const REQUEST = "create coaching form for pat rivera, late 3 times this week";

describe("QA B3 — a day on its own answers the open form", () => {
  it("\"today\" after \"i already told you\" keeps the Coaching card for Pat Rivera (QA's exact turns)", async () => {
    const reply = await converse(REQUEST, "i already told you", "today");
    expect(reply?.formProposal?.templateKey).toBe("coaching");
    expect(reply?.formProposal?.employeeName).toMatch(/^pat rivera$/i);
    expect(reply?.formProposal?.locationId).toBe("loc-264");
  });

  it.each(["today", "yesterday", "it was yesterday", "on Monday", "this morning", "Today."])(
    "\"%s\" straight after the card keeps it",
    async (day) => {
      const reply = await converse(REQUEST, day);
      expect(reply?.formProposal?.templateKey).toBe("coaching");
      expect(reply?.formProposal?.employeeName).toMatch(/^pat rivera$/i);
    },
  );

  it("a question about today still leaves the intake", async () => {
    expect(await converse(REQUEST, "what is the attendance policy today?")).toBeNull();
  });

  it("a day with no form open starts nothing", async () => {
    expect(await converse("today")).toBeNull();
  });
});
