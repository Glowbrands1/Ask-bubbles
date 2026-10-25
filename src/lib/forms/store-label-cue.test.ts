import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { groundFormSlots } from "@/lib/ai/form-full-remap";
import { decideIntentTurn } from "@/lib/ai/intent-slots";
import { EMPTY_CONVERSATION_FORM_STATE } from "@/lib/ai/form-state";
import { COMPANY_LOCATIONS } from "@/lib/locations";

import { labelledStoreIds } from "./store-cue";

/**
 * ============================================================================
 * "LOCATION KEARNEY" AFTER "STORE IS GRAND ISLAND" IS KEARNEY
 * ============================================================================
 *
 * Ported from Ask Sunny, QA Round 4 (conv_mvmw4hwq292a6vq, 24 Oct 2026):
 * "name is test testyone, location st joe, today's date, …" after "salon is
 * wornall" left the card on Wornall. The same turns, word for word, with a
 * store in place of the salon (QA's own test names). The live path here is
 * form-full-remap (FORM_FULL_REMAP_ENABLED is on in production).
 */
const TURNS = [
  "create a ca form for test testy because she didnt do deep clean assigned by 9-15-26",
  "deep clean assigned 9-1-26 of room 1 and due by 9-15-26. no previous coaching or ca on file",
  "employee acknowledged the jba policy manual so do a ca form.",
  "Create a form from this conversation.",
  "name is test testy",
  "employee name is test testy and store is grand island",
  "Create a Corrective Action Form from this conversation.",
  "name is test testyone, location kearney, today's date, employee did not properly sanitize room 12 after guest. this is written. employee had verbal ca 9-1-26. employee is a tc-tanning consultant",
];

const storeId = (name: string) => COMPANY_LOCATIONS.find((store) => store.name === name)!.id;
const GRAND_ISLAND = storeId("Grand Island, NE");
const KEARNEY = storeId("Kearney, NE");

/** The remap's store on the last turn, with Grand Island already kept from turn 6. */
function remapStore(turns: readonly string[]): string | null {
  const { slots } = groundFormSlots({
    raw: null,
    history: turns.slice(0, -1).map((content) => ({ role: "user", content })),
    question: turns[turns.length - 1]!,
    today: "2026-10-24",
    people: [],
    continueTemplateKey: "dpoa",
    saved: { locationId: GRAND_ISLAND, store: "Grand Island, NE" },
  });
  return slots.locationId;
}

/** The intent-slot store on the last turn, with Grand Island saved. */
function intentStore(turns: readonly string[]): string | null {
  return decideIntentTurn({
    question: turns[turns.length - 1]!,
    history: turns.slice(0, -1).map((content) => ({ role: "user", content })),
    today: "2026-10-24",
    saved: { ...EMPTY_CONVERSATION_FORM_STATE, locationId: GRAND_ISLAND },
    raw: null,
    people: [],
    stores: COMPANY_LOCATIONS.map((store) => ({ id: store.id, name: store.name })),
    headings: [],
    templates: [{ key: "dpoa", name: "Corrective Action Form" }],
    formInProgress: true,
  }).state.locationId;
}

beforeEach(() => {
  vi.stubEnv("PLACE_SPAN_GUARD_ENABLED", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("QA Round 4 port: 'location kearney' (PLACE_SPAN_GUARD_ENABLED)", () => {
  it("off: the reported behaviour is unchanged (the remap stays on Grand Island)", () => {
    expect(remapStore(TURNS)).toBe(GRAND_ISLAND);
  });

  it("on: the newest turn's store replaces the earlier one on the remap", () => {
    vi.stubEnv("PLACE_SPAN_GUARD_ENABLED", "1");
    expect(remapStore(TURNS)).toBe(KEARNEY);
  });

  it("on: 'store <name>' and 'location <name>' are read as the store", () => {
    vi.stubEnv("PLACE_SPAN_GUARD_ENABLED", "1");
    for (const turn of ["location kearney", "store kearney", "location is kearney", "kearney location", "store: kearney"]) {
      expect(labelledStoreIds(turn), turn).toEqual([KEARNEY]);
    }
    expect(remapStore([...TURNS.slice(0, 7), "store kearney"])).toBe(KEARNEY);
  });

  it("on: the document-phrase guard and the label cue together", () => {
    vi.stubEnv("PLACE_SPAN_GUARD_ENABLED", "1");
    expect(remapStore([...TURNS.slice(0, 7), "cite animals in the workplace policy, location kearney"])).toBe(KEARNEY);
  });

  it("on: a turn that names no store keeps the earlier one", () => {
    vi.stubEnv("PLACE_SPAN_GUARD_ENABLED", "1");
    expect(remapStore([...TURNS.slice(0, 7), "this is written"])).toBe(GRAND_ISLAND);
  });

  it("intent path off: the saved store stays", () => {
    expect(intentStore(TURNS)).toBe(GRAND_ISLAND);
  });

  it("intent path on: the newest turn's store replaces the saved one", () => {
    vi.stubEnv("PLACE_SPAN_GUARD_ENABLED", "1");
    expect(intentStore(TURNS)).toBe(KEARNEY);
    expect(intentStore([...TURNS.slice(0, 7), "this is written"])).toBe(GRAND_ISLAND);
  });
});
