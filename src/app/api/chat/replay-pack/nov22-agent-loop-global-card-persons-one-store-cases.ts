import { expect, vi } from "vitest";

import type { DirectoryRow, ReplayCase, ReplayContext } from "./cases";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A GLOBAL LOGIN'S CARD FOR SOMEONE AT ONE STORE IS FILED THERE (QA's Bubbles round 2, 22 Nov 2026, U29; "Create
 * without a store")
 * ============================================================================
 *
 * The manager's turns, word for word (a global district manager, as in production; the person invented, on no
 * directory): T1 "create a coaching form about accountability", T2 "I want the same form for multiple employees", T3 "no
 * put the employee as <P20>". The card asked "Which store is this for? You have several stores", though Woven lists
 * <P20> at ONE store (Bellevue), and Create saved the form with no store.
 *
 * Mechanism (`agent-loop/tools.ts`, the global login's which-store step): the person's one Woven store (primary first,
 * then their stores) is the card's store, said as store_from_woven; a person at several stores, or none, is asked once,
 * as before.
 */

const REPORT = "QA's Bubbles round 2 (22 Nov 2026, U29): a global login's card asked which store for a person Woven lists at one store, and Create saved no store";
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const P20: DirectoryRow = { id: "e-brisa-tolland", firstName: "Brisa", lastName: "Tolland", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67"], positionName: "Assistant General Manager" };
const P21: DirectoryRow = { id: "e-corwin-ashby", firstName: "Corwin", lastName: "Ashby", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67", "loc-264"], positionName: "Team Member Part Time" };
const T1 = "create a coaching form about accountability";
const T3 = (name: string) => `no put the employee as ${name}`;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([P20, P21]);
  t.as("location_manager", GLOBAL);
}

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";

const live = (person: DirectoryRow) =>
  loopStandIn((view): LoopDecision => {
    if (lastResult(view, "propose_form")) return { text: "Here's the Coaching Form." };
    if (said(view) === T1) return { text: "Who is this Coaching Form for?" };
    const name = `${person.firstName} ${person.lastName}`;
    return {
      tool: "propose_form",
      input: { template_key: "coaching", employee_id: person.id, what_happened: "Coaching about accountability.", policy: headingWith(view, /standards of conduct/i), person_evidence: evidenceFrom(view, name) },
    };
  });

export const NOV22_AGENT_LOOP_GLOBAL_CARD_PERSONS_ONE_STORE_CASES: ReplayCase[] = [
  {
    id: "nov22-u29-global-card-person-at-one-store-filed-there",
    title: "U29: a global login, \"no put the employee as <P20>\" (Woven lists <P20> at Bellevue only) — the card is filed at Bellevue (store_from_woven), never \"Which store is this about?\", and Create saves the store",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      const model = live(P20);
      t.loopModel!(model);
      await thread.say(T1);
      const reply = await thread.say(T3("Brisa Tolland"));
      expect(thread.proposal?.locationId, "the card did not take the person's one Woven store").toBe("loc-67");
      const result = model.views.map((view) => lastResult(view, "propose_form")).filter(Boolean).at(-1) as { facts?: Record<string, unknown> } | undefined;
      expect(result?.facts?.which_store ?? null, "the card still asks which store").toBeNull();
      expect(result?.facts?.store_from_woven, "the reply is not told where the card was filed").toBeTruthy();
      expect(reply.content).not.toMatch(/which store is this about/i);
      const id = await thread.create();
      expect(t.forms().find((form) => form.id === id)?.location_id, "Create saved the form with no store").toBe("loc-67");
    },
  },
  {
    id: "nov22-u29-global-card-person-at-two-stores-asks-once",
    title: "U29, control: a person Woven lists at two stores — the global login's card asks which store, as before",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      const model = live(P21);
      t.loopModel!(model);
      await thread.say(T1);
      await thread.say(T3("Corwin Ashby"));
      expect(thread.proposal?.locationId ?? null).toBeNull();
      const result = model.views.map((view) => lastResult(view, "propose_form")).filter(Boolean).at(-1) as { facts?: Record<string, unknown> } | undefined;
      expect(result?.facts?.which_store).toBe(true);
    },
  },
];
