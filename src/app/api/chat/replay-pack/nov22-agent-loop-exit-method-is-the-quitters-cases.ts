import { expect, vi } from "vitest";

import { TWO_STORES, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * HOW THE PERSON RESIGNED IS HOW THEY QUIT, NOT HOW THE MANAGER REACHED THEM (QA's Bubbles round 2, 22 Nov 2026, U26)
 * ============================================================================
 *
 * The manager's turn, word for word (the people invented, the former employee on no directory but this case's):
 * "I want to create an exit form for <P10>.  On 11-11-2026 <P11>, General Manager, called and left a voicemail for <P10>
 * when she did not show for her shift. Later that day <P10> returned the call and told <P1>, Assistant General Manager,
 * this job was not working out because of her other job and she quit effective immediately."
 *
 * The saved form said How Employee Resigned "Voicemail": the voicemail was the General Manager's, and she quit on the call
 * back. And the card asked "Bellevue or Omaha?" though Woven lists <P10> (no longer active) at Omaha West Dodge only.
 *
 * Mechanism:
 *   - the model reads how the person resigned (propose_form `exit_method`, one of the line's own methods) and quotes the
 *     manager's words for it (`exit_method_evidence`), kept when the quote names that method (`quoteNamesMethod`) and is
 *     this request's; Create writes it as the manager's statement after checking the quote in the chat's manager turns;
 *   - with none from the model, a loop card's draft reads the method only from the sentences the exit form's own reader
 *     reads a resignation type from (`resignationStatementMethod`), never from the rest of the account;
 *   - a former employee's own Woven stores in the manager's scope are offered first (`employee_store`), as an active
 *     person's are.
 */

const REPORT = "QA's Bubbles round 2 (22 Nov 2026, U26): an exit form saved How Employee Resigned \"Voicemail\" (the GM's voicemail, not how she quit) and asked Bellevue or Omaha for a former employee Woven lists at Omaha West Dodge";
const P10: DirectoryRow = { id: "e-ysolde-pellarin", firstName: "Ysolde", lastName: "Pellarin", preferredFirstName: null, employmentStatus: "terminated", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const T1 =
  "I want to create an exit form for Ysolde Pellarin.  On 11-11-2026 Caspian Dorrel, General Manager, called and left a voicemail for Ysolde Pellarin when she did not show for her shift. Later that day Ysolde Pellarin returned the call and told Thorvald Ashgrove, Assistant General Manager, this job was not working out because of her other job and she quit effective immediately.";
const WEST_DODGE_NAME = "Omaha, NE (West Dodge Rd)";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([P10]);
  t.as("location_manager", TWO_STORES);
}

type Result = { card?: Record<string, unknown>; facts?: Record<string, unknown> } & Record<string, unknown>;

/** The live model: the exit card for the name as typed; `method` and its quote when it reads how she quit; then the store it is offered. */
const live = (method: string | null, quote: string | null) =>
  loopStandIn((view: LoopView): LoopDecision => {
    const last = lastResult(view, "propose_form") as Result | null;
    const base = {
      template_key: "resignation-exit",
      employee_name: "Ysolde Pellarin",
      exit_type: "resignation",
      exit_evidence: { ...evidenceFrom(view, "I want to create an exit form for Ysolde Pellarin"), kind: "asks_for_exit_form" },
      person_evidence: evidenceFrom(view, "Ysolde Pellarin"),
      ...(method ? { exit_method: method, exit_method_evidence: evidenceFrom(view, quote ?? method) } : {}),
    };
    if (!last) return { tool: "propose_form", input: base };
    const offered = typeof last.facts?.employee_store === "string" ? last.facts.employee_store : null;
    const proposals = view.results.filter((result) => result.tool === "propose_form").length;
    if (offered && last.card?.status === "needs_location" && proposals < 2) return { tool: "propose_form", input: { ...base, store: offered } };
    return { text: `Here's the Employee Exit Form for **Ysolde Pellarin**.` };
  });

const results = (views: readonly LoopView[]) => views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form").map((result) => result.output as Result));

export const NOV22_AGENT_LOOP_EXIT_METHOD_IS_THE_QUITTERS_CASES: ReplayCase[] = [
  {
    id: "nov22-u26-exit-method-from-model-phone-call",
    title: "U26: \"… left a voicemail for <P> … <P> returned the call and told <P1> … she quit effective immediately\" — the model's \"Phone call\" (quoting \"returned the call\") is How Employee Resigned, never \"Voicemail\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      const model = live("Phone call", "Ysolde Pellarin returned the call");
      t.loopModel!(model);
      await thread.say(T1);
      expect(results(model.views).at(-1)?.card?.how_resigned, "the card does not state how she resigned").toBe("Phone call");
      const id = await thread.create();
      expect(t.values(id).resignation_method, "How Employee Resigned is not the model's reading").toBe("Phone call");
    },
  },
  {
    id: "nov22-u26-exit-method-none-not-the-voicemail",
    title: "U26, no method from the model: How Employee Resigned is read only from the sentence that states the resignation — never \"Voicemail\" from the GM's call before it",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      t.loopModel!(live(null, null));
      await thread.say(T1);
      const id = await thread.create();
      expect(t.values(id).resignation_method ?? "", "the GM's voicemail was saved as how she resigned").not.toMatch(/voicemail/i);
    },
  },
  {
    id: "nov22-u26-exit-method-quote-does-not-name-it",
    title: "U26, control: a method whose quote does not name it (\"Text message\" quoting \"she quit effective immediately\") is not kept",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      const model = live("Text message", "she quit effective immediately");
      t.loopModel!(model);
      await thread.say(T1);
      expect(results(model.views).at(-1)?.card?.how_resigned ?? null).toBeNull();
      const id = await thread.create();
      expect(t.values(id).resignation_method ?? "").not.toMatch(/text|voicemail/i);
    },
  },
  {
    id: "nov22-u26-former-employee-own-store-offered-first",
    title: "U26: a former employee Woven lists at Omaha West Dodge (in the manager's scope) — that store is offered first (employee_store), and the card is filed there",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      const model = live("Phone call", "Ysolde Pellarin returned the call");
      t.loopModel!(model);
      await thread.say(T1);
      const all = results(model.views);
      expect(all[0]?.card?.status, "the case proves nothing: the first card already had a store").toBe("needs_location");
      expect(all[0]?.facts?.employee_store, "her own Woven store was not offered").toBe(WEST_DODGE_NAME);
      expect(thread.proposal?.locationId, "the card was not filed at her Woven store").toBe("loc-264");
    },
  },
];
