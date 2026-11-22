import { expect, vi } from "vitest";

import { TWO_STORES, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";
import { TAMSIN } from "./nov22-agent-loop-u23-tamsin-chat-cases";

/**
 * ============================================================================
 * CREATE NEVER SAVES A FORM WITH NO STORE WHEN THE PERSON HAS ONE WOVEN STORE (board f140; QA's round 2, R01/R19/U05–U07)
 * ============================================================================
 *
 * The card asked "Which store?" (or, for an admin, filed no store at all) and Create saved the draft with NO store, for a
 * person Woven lists at exactly one of the manager's stores. U29's fix (a global non-admin login) reads the person's
 * Woven stores (`wovenStoresOf`: Woven's primary store and the roster's stores); the store manager's path read only
 * Woven's primary store, which a directory row can lack, and an admin's card never looked. Now both read the same way:
 * one Woven store among the login's stores is the card's store (said as store_from_woven); several still ask which.
 * Every person invented (`LOOP_STAFF`; Joelle Penrose at two stores with no Woven primary).
 */

const REPORT = "Board f140 (QA's Bubbles round 2, R01/R19/U05–U07): Create saved the draft with no store while the card still asked \"Which store?\"";
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

async function ca(t: ReplayContext, role: string, scope: unknown, person: { id: string; name: string }) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, TAMSIN, JOELLE]);
  t.as(role, scope);
  const first = person.name.split(" ")[0]!;
  t.loopModel!(loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as { card?: { store?: string | null } } | null;
    if (result) return { text: `Here's the Corrective Action Form for **${first}**.` };
    return { tool: "propose_form", input: { template_key: "dpoa", employee_id: person.id, person_evidence: evidenceFrom(view, person.name), what_happened: `${first} was late to open on 11/21/26.`, incident_date: "2026-11-21", policy: "Late Opening" } };
  }));
  const thread = t.thread();
  await thread.say(`ca for ${person.name}, late to open on 11/21`);
  const card = thread.proposal as { locationId?: string | null; status?: string } | null;
  let id: string | null = null;
  let refused: string | null = null;
  try {
    id = await thread.create();
  } catch (thrown) {
    refused = String((thrown as Error)?.message ?? thrown);
  }
  const saved = id ? (t.forms() as Array<{ id: string; location_id?: string | null }>).find((row) => row.id === id) : undefined;
  return { card, saved: saved?.location_id ?? null, refused };
}

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({ id, title, report: REPORT, status: "fixed", run });

const WYNNE: DirectoryRow = { id: "e-wynne-albright", firstName: "Wynne", lastName: "Albright", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Assistant General Manager" };
const JOELLE: DirectoryRow = { id: "e-joelle-penrose", firstName: "Joelle", lastName: "Penrose", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67", "loc-264"], positionName: "Team Member Part Time" };
const GLOBAL_DM = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const R01 = "i need a verbal corrective action for Wynne Albright for leaving out confidential information in associates view";
const U06_T1 = "create verbal ca for Joelle Penrose. Previous coaching: JBA Policy Manual 5-2-25";
const U06_T2 = "On 11/14/2026, Joelle Penrose had a closing shift and did not put trash liners into the trash cans after\ncollecting trash, and laundry was not done.";

/** The tester's turns; the card proposed on each with the account; then Create from the last card. */
async function tester(t: ReplayContext, person: DirectoryRow, first: string, account: string, second?: string) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, WYNNE, JOELLE]);
  t.as("district_manager", GLOBAL_DM);
  const name = `${person.firstName} ${person.lastName}`;
  t.loopModel!(loopStandIn((view): LoopDecision => {
    if (lastResult(view, "propose_form")) return { text: `Here's the Corrective Action Form for **${person.firstName}**.` };
    return { tool: "propose_form", input: { template_key: "dpoa", employee_id: person.id, person_evidence: evidenceFrom(view, name, second && view.turns.filter((turn) => turn.role === "user").length > 1 ? 1 : 0), what_happened: account, policy: "Standards of Conduct", warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal", second && view.turns.filter((turn) => turn.role === "user").length > 1 ? 1 : 0) } };
  }));
  const thread = t.thread();
  await thread.say(first);
  if (second) await thread.say(second);
  const card = thread.proposal as { locationId?: string | null; status?: string } | null;
  let id: string | null = null;
  let error: string | null = null;
  try {
    id = await thread.create();
  } catch (thrown) {
    error = String((thrown as Error)?.message ?? thrown);
  }
  const saved = id ? ((t.forms() as Array<{ id: string; location_id?: string | null }>).find((row) => row.id === id)?.location_id ?? null) : null;
  return { card, saved, created: { id, error } };
}

export const NOV22_AGENT_LOOP_F140_ONE_WOVEN_STORE_CASES: ReplayCase[] = [
  fixed("nov22-f140-store-manager-two-stores-person-at-one", "A store manager over two stores; Fenna is at one in Woven: the card is filed there and Create saves that store, never none", async (t) => {
    const { card, saved } = await ca(t, "location_manager", TWO_STORES, { id: LOOP_FENNA.id, name: "Fenna Prewitt" });
    expect(card?.locationId, JSON.stringify(card)).toBe("loc-264");
    expect(saved, "Create saved the form with no store").toBe("loc-264");
  }),
  fixed("nov22-f140-admin-person-at-one-store", "An admin (global): Fenna is at one store in Woven: the card is filed there and Create saves that store, never none", async (t) => {
    const { card, saved } = await ca(t, "admin", ADMIN, { id: LOOP_FENNA.id, name: "Fenna Prewitt" });
    expect(card?.locationId, JSON.stringify(card)).toBe("loc-264");
    expect(saved, "Create saved the form with no store").toBe("loc-264");
  }),
  fixed("nov22-f140-control-person-at-two-stores-still-asks", "Control: a store manager over two stores; Joelle is at both in Woven, with no primary: the card still asks which store (no guess), and Create on it saves nothing", async (t) => {
    const before = (t.forms() as unknown[]).length;
    const { card, refused } = await ca(t, "location_manager", TWO_STORES, { id: JOELLE.id, name: "Joelle Penrose" });
    expect(card?.locationId ?? null, JSON.stringify(card)).toBeNull();
    expect(card?.status, JSON.stringify(card)).toBe("needs_location");
    // Create on that card saves nothing (the second half of f140): the card's question, in one line.
    expect(refused, "Create on a card still asking which store was not refused").toMatch(/Which store is this about\?/);
    expect((t.forms() as unknown[]).length, "Create saved a form while the card still asked which store").toBe(before);
  }),
  /*
   * The tester's round-2 chats verbatim (offline replay on 4fd060f; a global district manager covering every store; invented
   * people). R01: Wynne Albright, Woven one store (West Dodge). U06: Joelle Penrose, Woven two stores (Bellevue primary +
   * West Dodge); the card asked "Which store?" and Create saved the draft with no store.
   */
  fixed("nov22-f140-r01-global-dm-one-woven-store-saved-there", `R01 verbatim: "${R01}" (global district manager): Wynne's one Woven store is the card's store, and Create saves it`, async (t) => {
    const { card, saved } = await tester(t, WYNNE, R01, "Wynne was reported for leaving confidential information out in associates view.");
    expect(card?.locationId, JSON.stringify(card)).toBe("loc-264");
    expect(saved, "Create saved the form with no store").toBe("loc-264");
  }),
  fixed("nov22-f140-u06-create-on-a-card-still-asking-saves-nothing", "U06 verbatim (global district manager; Joelle at two Woven stores): the card asks which store; Create on it says the store is needed in one line and saves nothing, never a form with no store", async (t) => {
    const before = (t.forms() as unknown[]).length;
    const { card, created } = await tester(t, JOELLE, U06_T1, "On 11/14/2026, Joelle Penrose had a closing shift and did not put trash liners into the trash cans after collecting trash, and laundry was not done.", U06_T2);
    expect(card?.locationId ?? null, JSON.stringify(card)).toBeNull();
    expect(created.error, "Create on a card still asking which store was not refused").toMatch(/Which store is this about\?/);
    expect(created.error!.split("\n").length, created.error!).toBe(1);
    expect((t.forms() as Array<{ location_id?: string | null }>).length, "Create saved a form while the card still asked which store").toBe(before);
  }),
];
