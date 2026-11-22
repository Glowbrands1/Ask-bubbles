import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * "CORPORATE OFFICE, NOT A STORE" IS ANSWERED ONCE (QA's Bubbles round 2, 22 Nov 2026, U04)
 * ============================================================================
 *
 * The manager's turns, word for word (a global district manager, as in production; the person invented, on no
 * directory, an HR Generalist Woven lists at every store with no primary): T2 "show the policy review form", T3 "<P4>",
 * T4 "corporate office, not a store", T5 "confidential info policy", T6 "Create a form from this conversation.". T4 got
 * "\"corporate office\" isn't a store name I know. <P4> works at <seven stores> in Woven — which one?", and every later
 * turn asked for the store again.
 *
 * Mechanism (QA: "if the app has no such store, say so once and leave Store blank rather than re-asking every turn"):
 * the model passes no_store_evidence, the manager's words saying the form is for no store; for a login that may file a
 * form with no store (a global login) the card is filed with no store, said once (no_store), and never asked again. A
 * store manager's form still needs its store.
 */

const REPORT = "QA's Bubbles round 2 (22 Nov 2026, U04): \"corporate office, not a store\" was asked for a store on every turn";
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const P4: DirectoryRow = { id: "e-oriel-vantassel", firstName: "Oriel", lastName: "Vantassel", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67", "loc-264", "loc-225", "loc-338"], positionName: "Human Resources Generalist" };
const T2 = "show the policy review form";
const T3 = "Oriel Vantassel";
const T4 = "corporate office, not a store";
const T5 = "confidential info policy";

function start(t: ReplayContext, scope: unknown) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([P4, { ...P4, id: "e-ansel-moberg", firstName: "Ansel", lastName: "Moberg", locationIds: ["loc-264"], positionName: "Team Member Part Time" }]);
  t.as("location_manager", scope);
}

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
type Result = { card?: Record<string, unknown>; facts?: Record<string, unknown> } & Record<string, unknown>;

/** The model: the card for <P4>; from T4 on, the card again with the manager's "not a store" words (and the store it typed). */
const live = () =>
  loopStandIn((view): LoopDecision => {
    if (lastResult(view, "propose_form")) return { text: "Here's the Policy Review." };
    const message = said(view);
    if (message === T2) return { text: "Who is this Policy Review for?" };
    const base = { template_key: "policy-review", employee_id: P4.id, person_evidence: evidenceFrom(view, T3, message === T3 ? 0 : message === T4 ? 1 : 2) };
    if (message === T3) return { tool: "propose_form", input: base };
    return { tool: "propose_form", input: { ...base, store: "corporate office", no_store_evidence: evidenceFrom(view, T4, message === T4 ? 0 : 1) } };
  });

const results = (views: readonly LoopView[]) => views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form").map((result) => result.output as Result));

export const NOV22_AGENT_LOOP_NO_STORE_STATED_CASES: ReplayCase[] = [
  {
    id: "nov22-u04-corporate-office-not-a-store-filed-with-no-store",
    title: "U04: a global login's \"corporate office, not a store\" — the card is filed with no store, said once (no_store), never \"isn't a store name I know … which one?\", and T5 does not ask again",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, GLOBAL);
      const thread = t.thread();
      const model = live();
      t.loopModel!(model);
      await thread.say(T2);
      await thread.say(T3);
      const askedStore = results(model.views).at(-1)?.facts?.which_store;
      expect(askedStore, "the case proves nothing: the card did not ask which store").toBe(true);
      await thread.say(T4);
      const afterT4 = results(model.views).at(-1);
      expect(afterT4?.facts?.typed_store_not_found ?? null, "\"corporate office\" was offered stores again").toBeNull();
      expect(afterT4?.facts?.no_store, "the reply is not told the form has no store").toBeTruthy();
      await thread.say(T5);
      const afterT5 = results(model.views).at(-1);
      expect(afterT5?.facts?.which_store ?? null, "T5 asked for the store again").toBeNull();
      expect(afterT5?.facts?.typed_store_not_found ?? null).toBeNull();
      const id = await thread.create();
      expect(t.forms().find((form) => form.id === id)?.location_id ?? null, "a store nobody named was saved").toBeNull();
    },
  },
  {
    id: "nov22-u04-store-manager-no-store-still-needs-store",
    title: "U04, control: a store manager's \"not a store\" files nothing with no store — the card still needs its store",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, WEST_DODGE);
      const thread = t.thread();
      const model = live();
      t.loopModel!(model);
      await thread.say(T2);
      await thread.say(T3);
      await thread.say(T4);
      expect(results(model.views).at(-1)?.facts?.no_store ?? null).toBeNull();
    },
  },
];
