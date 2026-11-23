import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * AN ADMIN'S CARD WITH NO STORE TO FILL ASKS WHICH STORE (QA's live re-run on 9340334 + #1072, A2, 23 Nov 2026)
 * ============================================================================
 *
 * An admin (global) made a card for a person who shows as no longer active in Woven, naming no store: the card never asked
 * which store, and Create saved the draft with location null. #1072's Create guard only blocks a card that is asking. Now
 * an admin's card with no store: the person's one Woven store (an active or a former employee's) is the card's store;
 * with none or several, the card asks which store (a picker of every store) and Create on it saves nothing. Every person
 * invented.
 */

const REPORT = "QA's live re-run (23 Nov 2026, A2): an admin's card for a former employee, no store named, never asked which store, and Create saved location null";
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const FORMER_NONE: DirectoryRow = { id: "e-linnea-vosk", firstName: "Linnea", lastName: "Vosk", preferredFirstName: null, employmentStatus: "terminated", locationIds: [], positionName: "Team Member Part Time" };
const FORMER_ONE: DirectoryRow = { id: "e-anselm-greer", firstName: "Anselm", lastName: "Greer", preferredFirstName: null, employmentStatus: "terminated", locationIds: ["loc-67"], positionName: "Team Member Part Time" };
/** The tester's A2, masked: terminated 2026-10-17; Woven's primary store West Dodge, no store listed for them (a former employee's row in the directory facts is dropped, as in production). */
const WREN: DirectoryRow = { id: "e-wren-tollefsen", firstName: "Wren", lastName: "Tollefsen", preferredFirstName: null, employmentStatus: "terminated", locationIds: [], positionName: "Team Member Part Time", primaryLocationId: "loc-264" };
const A2_T1 = "create a written CA for wren tollefsen for not attending the monthly meeting on 10-20-26. previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26. payroll deduct not applicable";
const ACTIVE_TWO: DirectoryRow = { id: "e-ilsabet-moraine", firstName: "Ilsabet", lastName: "Moraine", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67", "loc-264"], positionName: "Team Member Part Time" };

type Out = { card?: { status?: string; store?: string | null; choose_store_from?: unknown }; facts?: Record<string, unknown> } | null;

async function card(t: ReplayContext, name: string, byId?: string, said?: string) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, FORMER_NONE, FORMER_ONE, ACTIVE_TWO, WREN]);
  t.as("admin", ADMIN);
  const first = name.split(" ")[0]!;
  const model = loopStandIn((view): LoopDecision => {
    if (lastResult(view, "propose_form")) return { text: `Here's the Corrective Action Form for **${first}**.` };
    return { tool: "propose_form", input: { template_key: "dpoa", ...(byId ? { employee_id: byId } : { employee_name: name }), person_evidence: evidenceFrom(view, name), what_happened: `${first} did not return the store keys on 11/20/26.`, incident_date: "2026-11-20", policy: "Standards of Conduct" } };
  });
  t.loopModel!(model);
  const thread = t.thread();
  await thread.say(said ?? `ca for ${name}, did not return the store keys on 11/20`);
  const result = model.views.flatMap((view) => view.results.filter((entry) => entry.tool === "propose_form")).at(-1)?.output as Out;
  const proposal = thread.proposal as { locationId?: string | null; locationResolution?: string; authorizedLocationIds?: string[] } | null;
  const before = (t.forms() as unknown[]).length;
  let saved: string | null | undefined;
  let refused: string | null = null;
  try {
    const id = await thread.create();
    saved = (t.forms() as Array<{ id: string; location_id?: string | null }>).find((row) => row.id === id)?.location_id ?? null;
  } catch (thrown) {
    refused = String((thrown as Error)?.message ?? thrown);
  }
  return { result, proposal, saved, refused, added: (t.forms() as unknown[]).length - before };
}

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({ id, title, report: REPORT, status: "fixed", run });

export const NOV23_AGENT_LOOP_A2_ADMIN_NO_STORE_ASKS_CASES: ReplayCase[] = [
  fixed("nov23-a2-verbatim-never-saved-without-store", `A2 verbatim: "${A2_T1}" (admin; the person terminated, Woven primary West Dodge, no store listed for them): the card is filed at their store or asks which store; Create never saves location null`, async (t) => {
    const { proposal, saved, refused, added } = await card(t, "Wren Tollefsen", undefined, A2_T1);
    if (proposal?.locationId) {
      expect(saved, "Create saved a different store").toBe(proposal.locationId);
    } else {
      /* The directory's facts hold no former employee, so Woven's primary is not readable for them: the card asks (the tester's second acceptable outcome). */
      expect(proposal?.locationResolution, "the card neither has a store nor asks which").toBe("needs_selection");
      expect(refused, "Create on the card was not refused").toMatch(/Which store is this about\?/);
      expect(added, "Create saved a form with no store").toBe(0);
    }
  }),
  fixed("nov23-a2-admin-former-employee-no-store-asks", "A2's shape: an admin, a former employee with no Woven store, no store named: the card asks which store (every store offered), and Create on it saves nothing", async (t) => {
    const { result, proposal, saved, refused, added } = await card(t, "Linnea Vosk");
    expect(result?.card, JSON.stringify(result)).toBeTruthy();
    expect(proposal?.locationId ?? null, JSON.stringify(proposal)).toBeNull();
    expect(proposal?.locationResolution, "the card does not ask which store").toBe("needs_selection");
    expect((proposal?.authorizedLocationIds ?? []).length, "no store offered to pick").toBeGreaterThan(1);
    expect(result?.facts?.which_store, "the reply is not told to ask which store").toBe(true);
    expect(saved ?? null, "Create saved a form with no store").toBeNull();
    expect(refused, "Create on the card was not refused").toMatch(/Which store is this about\?/);
    expect(added).toBe(0);
  }),
  fixed("nov23-a2-admin-former-employee-one-store-filed", "An admin, a former employee Woven lists at one store: the card is filed there and Create saves it", async (t) => {
    const { proposal, saved } = await card(t, "Anselm Greer");
    expect(proposal?.locationId, JSON.stringify(proposal)).toBe("loc-67");
    expect(saved).toBe("loc-67");
  }),
  fixed("nov23-a2-admin-active-two-stores-asks", "An admin, an active person at two stores in Woven (no primary): the card asks which store, and Create on it saves nothing", async (t) => {
    const { proposal, refused, added } = await card(t, "Ilsabet Moraine", ACTIVE_TWO.id);
    expect(proposal?.locationId ?? null, JSON.stringify(proposal)).toBeNull();
    expect(proposal?.locationResolution).toBe("needs_selection");
    expect(refused).toMatch(/Which store is this about\?/);
    expect(added).toBe(0);
  }),
];
