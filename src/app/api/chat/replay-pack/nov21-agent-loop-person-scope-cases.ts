import { expect, vi } from "vitest";

import { COMPANY_LOCATIONS } from "@/lib/locations";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, firstMatch, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE LOOP'S PEOPLE ARE THE MANAGER'S OWN (the loop port, QA 21 Nov 2026; Pau's decisions 4 and 7)
 * ============================================================================
 *
 * Every tool is scoped to the signed-in manager's stores, as the forms are (`authorizedLocationIds`), never to what the
 * model asks for. Ported from the sibling app's scope guards (mechanism, not content), with this app's two decisions:
 *
 * - Decision 7 (21 Nov 2026): a district or region login covers ALL of its stores. This app's store list has no
 *   districts yet (`config/company/locations.ts`), so the district case puts two of the stores into an invented
 *   district for the case only (`inDistrict`), and puts them back after: the mechanism, not a real district.
 * - Decision 4 (21 Nov 2026): a name that matches someone no longer active in Woven is said to have left, not only
 *   "not on the staff list".
 *
 * A person outside the scope reads exactly as "not on the staff list": their existence elsewhere is never shown.
 * The stand-in plays a model that reaches for whoever it can; the route, roster, tools and Create are real. Invented
 * people only; the stores are this app's own (Omaha West Dodge is the pack's store; Bellevue and Dawley Farms are not).
 */

const REPORT = "QA, 21 Nov 2026 (the loop port): find_staff, list_staff and propose_form are scoped to the manager's stores";
const OMAHA = "loc-264";
const DAWLEY_FARMS = "loc-338";
const BELLEVUE = "loc-67";

const THADDEA = LOOP_THADDEA;
/** At Dawley Farms (Sioux Falls): outside the Omaha Dodge manager's scope, and outside the invented district. */
const FARAWAY: DirectoryRow = { id: "e-henrike-lusk", firstName: "Henrike", lastName: "Lusk", preferredFirstName: null, employmentStatus: "active", locationIds: [DAWLEY_FARMS], positionName: "Team Member Full Time" };
/** At Bellevue: inside the invented district below, outside the Omaha Dodge manager's scope. */
const BELLEVUE_ONE: DirectoryRow = { id: "e-wystan-ferraday", firstName: "Wystan", lastName: "Ferraday", preferredFirstName: null, employmentStatus: "active", locationIds: [BELLEVUE], positionName: "Team Member Part Time" };
/** Terminated in Woven, last at Omaha Dodge. */
const GONE: DirectoryRow = { id: "e-seraphine-dubrow", firstName: "Seraphine", lastName: "Dubrow", preferredFirstName: null, employmentStatus: "terminated", locationIds: [OMAHA], positionName: "Team Member Part Time" };

const results = (views: readonly LoopView[], tool: string) => views.flatMap((view) => view.results.filter((result) => result.tool === tool)).map((result) => JSON.stringify(result.output));
const lastSaid = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-13T22:40:00Z"));
  t.directory([...LOOP_STAFF, FARAWAY, BELLEVUE_ONE, GONE]);
  t.as("location_manager", WEST_DODGE);
}

/**
 * Two of this app's stores in an invented district, for one case only, then as they were. The store list ships with no
 * districts; decision 7 is about the mechanism (`locationIdsInArea` reads each store's district), which this exercises.
 */
const DISTRICT = "dist-invented-replay";
async function inDistrict(ids: readonly string[], run: () => Promise<void>): Promise<void> {
  const stores = COMPANY_LOCATIONS.filter((entry) => ids.includes(entry.id)) as { districtId: string | null }[];
  const before = stores.map((entry) => entry.districtId);
  try {
    for (const entry of stores) entry.districtId = DISTRICT;
    await run();
  } finally {
    stores.forEach((entry, index) => {
      entry.districtId = before[index]!;
    });
  }
}

export const NOV21_AGENT_LOOP_PERSON_SCOPE_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-scope-person-at-another-store",
    title: "a store manager asks for someone at another store: find_staff never finds them, propose_form refuses their roster id, no card, and nothing about the other store reaches the model",
    report: `${REPORT}: "every tool is scoped to the manager's stores"`,
    status: "fixed",
    async run(t) {
      start(t);
      const reaching = loopStandIn((view): LoopDecision => {
        if (!lastResult(view, "find_staff")) return { tool: "find_staff", input: { name: "henrike lusk" } };
        if (!lastResult(view, "propose_form")) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: FARAWAY.id, what_happened: "Henrike Lusk was late.", person_evidence: evidenceFrom(view, "henrike lusk") } };
        return { text: "Done." };
      });
      t.loopModel!(reaching);
      const thread = t.thread();
      await thread.say("ca for henrike lusk, she was late");
      expect(results(reaching.views, "find_staff")[0], "a person outside the manager's stores was found").toMatch(/"matches":\[\]/);
      expect(results(reaching.views, "propose_form")[0], "a person outside the manager's stores was carded").toMatch(/employee_id find_staff returned/);
      expect(thread.proposal ?? null, "a card was shown for someone at another store").toBeNull();
      expect(JSON.stringify(reaching.views.flatMap((view) => view.results)), "another store's roster leaked").not.toMatch(/e-henrike-lusk|loc-338|Dawley|Sioux Falls/);
    },
  },
  {
    id: "nov21-agent-loop-scope-list-staff-own-store-only",
    title: "\"who's on my staff?\" lists the manager's own store only (names and positions); \"who works at bellevue?\" is refused and never names Bellevue's staff",
    report: `${REPORT}; a plain staff-list question`,
    status: "fixed",
    async run(t) {
      start(t);
      const lister = loopStandIn((view): LoopDecision => {
        if (!lastResult(view, "list_staff")) return { tool: "list_staff", input: /bellevue/i.test(lastSaid(view)) ? { store: "Bellevue" } : {} };
        return { text: "Here is the staff list." };
      });
      t.loopModel!(lister);
      await t.thread().say("who's on my staff?");
      const own = results(lister.views, "list_staff").at(-1) ?? "";
      expect(own).toContain("Thaddea Kroll");
      expect(own, "another store's staff was listed").not.toContain("Henrike Lusk");
      expect(own, "a person no longer active was listed").not.toContain("Seraphine Dubrow");
      const rows = (JSON.parse(own) as { staff: Record<string, unknown>[] }).staff;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(Object.keys(row).sort(), "more than names and positions").toEqual(["name", "position"]);

      const before = results(lister.views, "list_staff").length;
      const other = await t.thread().say("who works at bellevue?");
      expect(other.content, "another store's staff reached the manager").not.toContain("Henrike Lusk");
      const refused = results(lister.views, "list_staff").slice(before);
      expect(refused.length, "list_staff was not asked for Bellevue (the case proves nothing)").toBeGreaterThan(0);
      for (const result of refused) expect(result).toMatch(/not one of this manager's stores/);
    },
  },
  {
    id: "nov21-agent-loop-scope-store-outside-scope-not-filed",
    title: "\"ca for thaddea kroll, she was late at the bellevue store\" from the Omaha Dodge manager: the card stays at the manager's own store and says Bellevue is not theirs (store_outside_scope); a card pointed at Bellevue is refused at Create",
    report: `${REPORT}; a store manager can't file a form for a store outside their scope`,
    status: "fixed",
    async run(t) {
      start(t);
      const model = loopStandIn((view): LoopDecision => {
        if (!lastResult(view, "find_staff")) return { tool: "find_staff", input: { name: "thaddea kroll" } };
        if (!lastResult(view, "propose_form")) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: firstMatch(view)?.employee_id, what_happened: "Thaddea Kroll was late on 11/12.", incident_date: "2026-11-12", store: "Bellevue" } };
        return { text: "Here is the Corrective Action Form for **Thaddea Kroll**." };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say("ca for thaddea kroll, she was late at the bellevue store on 11/12");
      const card = results(model.views, "propose_form").at(-1) ?? "";
      expect(card, "the store outside the scope was not said").toMatch(/"store_outside_scope":"[^"]*Bellevue/);
      expect(thread.proposal?.locationId ?? null, "the card was filed at a store outside the manager's scope").not.toBe(BELLEVUE);
      // The browser's card, pointed at Bellevue anyway: Create refuses it (server-side scope, `authorizeLocation`).
      expect(thread.proposal, "no card (the case proves nothing)").not.toBeNull();
      Object.assign(thread.proposal!, { locationId: BELLEVUE });
      await expect(thread.create(), "a form was created at a store outside the manager's scope").rejects.toThrow();
      expect(t.forms().filter((row) => row.location_id === BELLEVUE)).toEqual([]);
    },
  },
  {
    id: "nov21-agent-loop-scope-district-covers-all-its-stores",
    title: "Pau's decision 7: a district login covers all of its stores: find_staff finds people at each of them, list_staff lists either store on request, and someone at a store outside the district is never found",
    report: `${REPORT}; Pau's decision 7 (21 Nov 2026): a district or region login covers all its stores, as the forms' authorizedLocationIds does`,
    status: "fixed",
    async run(t) {
      start(t);
      await inDistrict([OMAHA, BELLEVUE], async () => {
        t.as("district_manager", { level: "district", primaryAreaId: DISTRICT, alsoCoversAreaIds: [] });
        const finder = loopStandIn((view): LoopDecision => {
          const said = lastSaid(view);
          if (/^who/i.test(said)) return lastResult(view, "list_staff") ? { text: "Here is the staff list." } : { tool: "list_staff", input: { store: /bellevue/i.test(said) ? "Bellevue" : "Omaha" } };
          const name = /wystan/i.test(said) ? "wystan ferraday" : /henrike/i.test(said) ? "henrike lusk" : "thaddea kroll";
          return lastResult(view, "find_staff") ? { text: "Noted." } : { tool: "find_staff", input: { name } };
        });
        t.loopModel!(finder);
        for (const [said, id] of [["is thaddea kroll on my roster", THADDEA.id], ["is wystan ferraday on my roster", BELLEVUE_ONE.id]] as const) {
          await t.thread().say(said);
          expect(results(finder.views, "find_staff").at(-1), `"${said}": a person in the district was not found`).toContain(id);
        }
        await t.thread().say("is henrike lusk on my roster");
        expect(results(finder.views, "find_staff").at(-1), "a person outside the district was found").toMatch(/"matches":\[\]/);
        expect(results(finder.views, "find_staff").at(-1)).not.toContain(FARAWAY.id);

        await t.thread().say("who works at bellevue?");
        const bellevue = results(finder.views, "list_staff").at(-1) ?? "";
        expect(bellevue, "a district store's staff was not listed").toContain("Wystan Ferraday");
        expect(bellevue).not.toContain("Henrike Lusk");
        await t.thread().say("who works at omaha?");
        expect(results(finder.views, "list_staff").at(-1), "the other district store's staff was not listed").toContain("Thaddea Kroll");
      });
    },
  },
  {
    id: "nov21-agent-loop-scope-inactive-person-said-to-have-left",
    title: "Pau's decision 4: a name that matches someone no longer active in Woven is said to have left (inactive_in_woven), the card has the name as typed; someone terminated at another store is never revealed",
    report: `${REPORT}; Pau's decision 4 (21 Nov 2026): an inactive staff match is said to have left, not only "not on the staff list"`,
    status: "fixed",
    async run(t) {
      start(t);
      const model = loopStandIn((view): LoopDecision => {
        const name = /seraphine/i.test(lastSaid(view)) ? "Seraphine Dubrow" : "Dorrit Toomey";
        if (!lastResult(view, "find_staff")) return { tool: "find_staff", input: { name, person_evidence: evidenceFrom(view, name.toLowerCase()) } };
        if (!lastResult(view, "propose_form")) return { tool: "propose_form", input: { template_key: "dpoa", employee_name: name, what_happened: `${name} was late on 11/12.`, incident_date: "2026-11-12" } };
        return { text: `**${name}** shows as no longer active in Woven; I've used the name as you typed it.` };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say("ca for seraphine dubrow, he was late on 11/12");
      expect(results(model.views, "find_staff")[0], "the inactive person is not a fact").toMatch(/"inactive_in_woven":"Seraphine Dubrow"/);
      /*
       * Changed on purpose (QA's live re-test B8, 21 Nov 2026: "isn't on the Woven staff list" and "no longer active" in one
       * reply): the card's inactive_in_woven is now the line to say (say_exactly), and an inactive person's card no longer
       * gives staff_list, the not-on-the-staff-list line's cue.
       */
      expect(results(model.views, "propose_form").at(-1)).toMatch(/"off_roster_name":"Seraphine Dubrow".*"inactive_in_woven":\{"say_exactly":"\*\*Seraphine Dubrow\*\* shows as no longer active in Woven/);
      expect(results(model.views, "propose_form").at(-1)).not.toContain('"staff_list"');
      expect(thread.proposal?.employeeName).toBe("Seraphine Dubrow");

      // Someone terminated at Dawley Farms (outside the scope) reads as anyone not on the list: never "left".
      t.directory([...LOOP_STAFF, { ...GONE, id: "e-dorrit-toomey", firstName: "Dorrit", lastName: "Toomey", locationIds: [DAWLEY_FARMS] }]);
      const before = results(model.views, "find_staff").length;
      await t.thread().say("ca for dorrit toomey, he was late on 11/12");
      const elsewhere = results(model.views, "find_staff").slice(before)[0] ?? "";
      expect(elsewhere, "find_staff was not asked (the case proves nothing)").not.toBe("");
      expect(elsewhere, "someone who left another store was revealed").not.toContain("inactive_in_woven");
    },
  },
];
