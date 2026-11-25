import { expect, vi } from "vitest";

import { STAFF, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * AN ADMIN'S CARD ASKS WHICH STORE WHEN WOVEN AND THE FORMS ON FILE DIFFER (port from the sibling app; ADMIN_CARD_ASKS_SALON)
 * ============================================================================
 *
 * the sibling app's QA (24 Nov 2026, live as an Admin), its wording with the person's first name swapped for an invented one:
 * "Draft a coaching form for <first name>" filed the store Woven lists her at, while her form on file is at another.
 * An admin's card with no store already asks here (A2, #1087); now a Woven store that differs from this person's forms
 * on file in the Forms Register is not taken: the card asks which, naming both. A store the manager named still wins.
 * Every person is invented.
 */
const FLAG = "ADMIN_CARD_ASKS_SALON_ENABLED";
const REPORT = `Port from the sibling app: its QA, 24 Nov 2026 (live, Admin): "Draft a coaching form for <first name>" filed the Woven store though her form on file is at another`;
const OPEN = { open: "ADMIN_CARD_ASKS_SALON_ENABLED is off in production (QA flips it)" };
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const BELLEVUE = "loc-67";
const WEST_DODGE_RD = "loc-264";
const YSOLDE: DirectoryRow = { id: "e-ysolde-marrick", firstName: "Ysolde", lastName: "Marrick", preferredFirstName: null, employmentStatus: "active", locationIds: [BELLEVUE], positionName: "Team Member Part Time" };
const TWO_SALON_PERSON: DirectoryRow = { id: "e-8", firstName: "Joelle", lastName: "Penrose", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67", "loc-264"], positionName: "Team Member Part Time" };

type Facts = { which_store?: boolean; store_from_woven?: string; which_store_woven_and_forms?: { woven: string; forms_on_file: string[]; ask_exactly: string } };

/** Her Coaching Form on file at the West Dodge Rd store. */
function onFileAtWestDodge(t: ReplayContext): void {
  (t.forms() as Record<string, unknown>[]).push({
    id: "coach-ysolde-west-dodge", ...t.templateIds!("coaching"), variant_key: null, employee_role: null, location_id: WEST_DODGE_RD, location_name: "Omaha, NE (West Dodge Rd)",
    created_by: "another-manager", created_by_role: "general_manager", source: "ask_bubbles", status: "finalized", follow_up_date: null, archived_at: null,
    revises_instance_id: null, template_key: "coaching", template_name: "Coaching Form", employee_name: "Ysolde Marrick", form_date: "2026-10-02",
    created_at: "2026-10-02T15:00:00Z", updated_at: "2026-10-02T15:00:00Z",
  });
}

/** The stand-in follows the rules book's which_store lines, as the model does. */
function model(employee: { id?: string; name: string }) {
  return loopStandIn((view: LoopView): LoopDecision => {
    const card = lastResult(view, "propose_form") as { facts?: Facts } | null;
    if (!card) {
      const who = employee.id ? { employee_id: employee.id } : { employee_name: employee.name };
      return { tool: "propose_form", input: { template_key: "coaching", ...who, person_evidence: { message_id: view.turns.filter((turn) => turn.role === "user").at(-1)?.messageIds?.at(-1) ?? "current", quote: employee.name }, what_happened: "A performance concern." } };
    }
    const facts = card.facts ?? {};
    const ask = facts.which_store_woven_and_forms?.ask_exactly ?? (facts.which_store ? "Which store is this about? The card is ready — choose the store before you create the draft, so it is not filed with no store." : "");
    return { text: `Here's the Coaching Form.${ask ? `\n\n${ask}` : ""}` };
  });
}

async function run(t: ReplayContext, said: string, employee: { id?: string; name: string }) {
  vi.setSystemTime(new Date("2026-11-24T18:00:00Z"));
  t.directory([...STAFF, YSOLDE, TWO_SALON_PERSON]);
  t.as("admin", ADMIN);
  const standIn = model(employee);
  t.loopModel!(standIn);
  const thread = t.thread();
  const reply = await thread.say(said);
  const facts = ([...standIn.views].reverse().map((view) => lastResult(view, "propose_form")).find(Boolean) as { facts?: Facts } | null)?.facts ?? {};
  return { reply, card: thread.proposal as { locationId?: string | null; status?: string; employeeName?: string | null } | null, facts };
}

const loopCase = (id: string, title: string, check: (t: ReplayContext) => Promise<void>, status: ReplayCase["status"] = OPEN): ReplayCase => ({
  id,
  title,
  report: REPORT,
  status,
  fixFlags: [FLAG],
  async run(t) {
    if (!t.loopOn?.() || process.env.AGENT_LOOP_LIVE === "1") return;
    await check(t);
  },
});

export const NOV24_ADMIN_CARD_ASKS_SALON_CASES: ReplayCase[] = [
  loopCase("nov24-admin-store-woven-differs-from-forms-on-file", `"Draft a coaching form for Ysolde" (an Admin): Woven lists her at Bellevue, her form on file is at West Dodge Rd — the card picks neither and asks which, naming both`, async (t) => {
    onFileAtWestDodge(t);
    const { reply, card, facts } = await run(t, "Draft a coaching form for Ysolde", { name: "Ysolde" });
    expect(card?.employeeName, JSON.stringify(card)).toBe("Ysolde Marrick");
    expect(card?.locationId ?? null, "the card silently took a store").toBeNull();
    expect(card?.status, "the card was held").toBe("ready");
    expect(facts.store_from_woven, "the card said it was filed at the Woven store").toBeUndefined();
    expect(facts.which_store_woven_and_forms?.woven).toBe("Bellevue, NE");
    expect(facts.which_store_woven_and_forms?.forms_on_file).toEqual(["Omaha, NE (West Dodge Rd)"]);
    expect(reply.content).toMatch(/Which store is this about\?[^\n]*\*\*Bellevue, NE\*\*[^\n]*\*\*Omaha, NE \(West Dodge Rd\)\*\*/);
  }),
  loopCase("nov24-admin-store-asks-once-no-woven-store", `Control (already so here): an Admin's card for a person Woven lists at two stores with no primary: no store is picked, and which_store is asked once (the card stays ready)`, async (t) => {
    const { card, facts } = await run(t, "Draft a coaching form for Joelle Penrose", { id: TWO_SALON_PERSON.id, name: "Joelle Penrose" });
    expect(card?.locationId ?? null).toBeNull();
    expect(card?.status, "the card was held").toBe("ready");
    expect(facts.which_store, "an admin's card with no store did not ask which store").toBe(true);
  }, "fixed"),
  loopCase("nov24-admin-store-named-in-request-wins", `Control: "Draft a coaching form for Ysolde at West Dodge" (an Admin): the store named wins, nothing is asked`, async (t) => {
    onFileAtWestDodge(t);
    const { card, facts } = await run(t, "Draft a coaching form for Ysolde at West Dodge", { name: "Ysolde" });
    expect(card?.locationId, JSON.stringify(card)).toBe(WEST_DODGE_RD);
    expect(facts.which_store).toBeUndefined();
    expect(facts.which_store_woven_and_forms).toBeUndefined();
  }, "fixed"),
  loopCase("nov24-admin-store-woven-agrees-no-forms", `Control: an Admin's card for a person at one Woven store with no forms elsewhere is filed there, nothing is asked`, async (t) => {
    const { card, facts } = await run(t, "Draft a coaching form for Ysolde", { name: "Ysolde" });
    expect(card?.locationId, JSON.stringify(card)).toBe(BELLEVUE);
    expect(facts.which_store).toBeUndefined();
    expect(facts.which_store_woven_and_forms).toBeUndefined();
  }, "fixed"),
];
