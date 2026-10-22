import { describe, expect, it, vi } from "vitest";

import type { ScopedRosterResult } from "@/lib/forms/employee-roster";
import { continuationFor } from "@/lib/forms/proposal-continuation";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import { buildStoreIndex, readStoreMentions } from "@/lib/stores/resolver";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * QA F-05, 22 OCT 2026 — TIMES, PRICES AND QUANTITIES ARE NOT STORES
 * ============================================================================
 *
 * The reference platform's branch read a bare number after "at" as a salon
 * ("she got here at 410 today" filed salon 0410). Ask Bubbles reads a number as
 * a store only after a place word or "#", and not when a unit follows it, so it
 * never had that defect; these pin it, with Bubbles' own 2–3 digit numbers.
 */

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
    loadScopedRosterResult: async (scope: AccessScope | null): Promise<ScopedRosterResult> =>
      scope ? { status: "ok", roster: [] } : { status: "not_checked", reason: "no_scope" },
  };
});

const index = buildStoreIndex({ stores: COMPANY_LOCATIONS });
const stores = (text: string) => readStoreMentions(text, index).mentions.flatMap((mention) => mention.locationIds);

/** A location manager covering Omaha West Dodge (264) and Kearney (66). */
const TWO_STORES: AccessScope = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: ["loc-66"] };

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
const LIBRARY = [template("coaching", "Coaching Form", "create_coaching_form", 1), template("dpoa", "Corrective Action Form", "create_corrective_action", 2)];

let counter = 0;
async function converse(...turns: string[]) {
  const { proposeFormForTurn } = await import("./form-proposal");
  const thread: ChatMessage[] = [];
  let last: Awaited<ReturnType<typeof proposeFormForTurn>> = null;
  for (const question of turns) {
    const history = [...thread];
    const user: ChatMessage = { id: `m${(counter += 1)}`, role: "user", content: question, createdAt: "2026-10-21T12:00:00Z" };
    thread.push(user);
    last = await proposeFormForTurn({
      history,
      question,
      questionMessageId: user.id,
      actor: { role: "location_manager" as never, scope: TWO_STORES },
      continueTemplateKey: continuationFor(history)?.templateKey,
      summaries: LIBRARY as never,
      today: "2026-10-21",
    });
    thread.push({
      id: `m${(counter += 1)}`,
      role: "assistant",
      content: last?.content ?? "(advice)",
      createdAt: "2026-10-21T12:00:00Z",
      ...(last?.formProposal ? { formProposal: last.formProposal } : {}),
    } as ChatMessage);
  }
  return last!;
}

describe("negative: a time, a price, a quantity or a date is never a store", () => {
  it.each([
    "she got here at 264 today",
    "she stayed at 66 for an hour",
    "she clocked in at 2:64",
    "she showed up at 264pm",
    "we met at 264 for lunch",
    "she sold a candle at 66",
    "rang up a sale at 66 dollars",
    "she sold it at $264",
    "she was 66 minutes late",
    "for 264 minutes",
    "she was late on 10/15",
    "she opened the store 30 minutes late",
  ])("%s", (text) => {
    expect(stores(text)).toEqual([]);
  });
});

describe("positive: a store the manager names by number", () => {
  it.each([
    ["store 264", ["loc-264"]],
    ["store #66", ["loc-66"]],
    ["#264", ["loc-264"]],
    ["at store 66 today", ["loc-66"]],
    ["location 236", ["loc-236"]],
  ])("reads %s", (text, ids) => {
    expect(stores(text)).toEqual(ids);
  });
});

describe("through the proposal, for a manager with two stores", () => {
  it.each([
    "coaching form for Jane Doe, she got here at 264 today",
    "coaching form for Jane Doe, she sold a candle at 66",
    "coaching form for Jane Doe, rang up a sale at 66 dollars",
  ])("%s files no store and asks among the manager's own", async (question) => {
    const last = await converse(question);
    expect(last.formProposal?.employeeName).toBe("Jane Doe");
    expect(last.formProposal?.locationId).toBeNull();
    expect([...(last.formProposal?.authorizedLocationIds ?? [])].sort()).toEqual(["loc-264", "loc-66"]);
  });

  it("multi-turn: a time does not move the form; the store the manager names does", async () => {
    const timed = await converse("coaching form for Jane Doe", "she got here at 264 today, again");
    expect(timed.formProposal?.employeeName).toBe("Jane Doe");
    expect(timed.formProposal?.locationId).toBeNull();
    const named = await converse("coaching form for Jane Doe", "she got here at 264 today, again", "store 66");
    expect(named.formProposal?.locationId).toBe("loc-66");
  });
});
