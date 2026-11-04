import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { MANAGER_MESSAGES, MANAGER_ROSTER, managerCriteria, type LiveOutcome, type ManagerMessage } from "./nov4-live-regressions-scenarios";

/**
 * ============================================================================
 * PAU, VIA QA (4 Nov 2026, 11:30 UTC): FIVE EXACT MANAGER MESSAGES ABOUT MSB
 * AND SALES CORRECTIVE ACTIONS
 * ============================================================================
 *
 * The managers' own words, kept word for word (metric names and "salon
 * metrics" included: quoted manager text), each name swapped for an invented
 * one on this case's roster only. The messages, the people and the four
 * criteria live in `nov4-live-regressions-scenarios.ts`, shared with the live
 * script (LIVE_SCENARIOS=managers):
 *
 *   card       a card is made for the person (#2: it asks ONCE which employee);
 *   no-ask     it never asks what happened when the metrics or reason are given;
 *   msb-name   MSB is never saved or shown as a name;
 *   cites-soc  the card or the draft cites the Standards of Conduct with the
 *              manual heading and page (a card message is created).
 *
 * `status` is per production's flags today; `fixFlags` where the glossary
 * (CHAT_GLOSSARY_ENABLED) and/or the sales policy (CA_SALES_POLICY_ENABLED)
 * make it hold.
 */

type T = ReplayContext;

const REPORT = "Pau via QA, 4 Nov 2026 (11:30 UTC), real manager messages";

async function runMessage(t: T, message: ManagerMessage): Promise<void> {
  vi.setSystemTime(new Date("2026-11-04T15:30:00Z"));
  t.directory(MANAGER_ROSTER);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  const reply = await thread.say(message.text);
  const card = thread.proposal ? { templateKey: thread.proposal.templateKey ?? null, employeeName: thread.proposal.employeeName ?? null } : null;
  let saved: Record<string, string> = {};
  let checked: Record<string, string[]> = {};
  if (message.person && card?.employeeName) {
    t.draftWrites(
      { observation: `Observed:\n${message.person.firstName} ${message.person.lastName} did not meet the expected performance standards.` },
      { offense_type: ["under_performance"] },
    );
    const id = await thread.create();
    saved = t.values(id);
    checked = t.checked(id);
  }
  const run: LiveOutcome = { card, reply: reply.content, replies: [reply.content], saved, checked, error: null };
  const failed = managerCriteria(message)
    .map((criterion) => ({ name: criterion.name, why: criterion.check(run) }))
    .filter((entry) => entry.why);
  expect(failed, `"${message.text}" fails ${failed.map((entry) => `${entry.name} (${entry.why})`).join("; ")}\n${reply.content}`).toEqual([]);
}

const byId = (id: string): ManagerMessage => MANAGER_MESSAGES.find((message) => message.id === id)!;

export const NOV4_MANAGER_MSB_CASES: ReplayCase[] = [
  {
    id: "nov4-mgr-1-verbal-metrics",
    title: `"${byId("mgr-1-verbal-metrics").text}" — a CA card, no "what happened", cites the Standards of Conduct`,
    report: `${REPORT}, #1`,
    // Run 4 Nov 2026 on main before #427: OPEN, the CA card and its draft cite no policy: no Standards of Conduct with heading and page (the card also says "I couldn't find **Club Close** or **Under** in the Woven roster").
    // Holds with production's flags since #427 (d55575c9): revision 7 of the form replaces Under Performance with the Standards of Conduct, so the draft cites it.
    status: "fixed",
    fixFlags: ["CA_SALES_POLICY_ENABLED"],
    run: (t) => runMessage(t, byId("mgr-1-verbal-metrics")),
  },
  {
    id: "nov4-mgr-2-msb-no-name",
    title: `"${byId("mgr-2-msb-no-name").text}" — asks once which employee; MSB is never a name`,
    report: `${REPORT}, #2`,
    // Run 4 Nov 2026 (production flags): fails as below.
    status: { open: "\"msb\" is looked up as a person (\"I couldn't find **msb** in the Woven roster\") and the reply lists the intake questions, \"What happened\" among them, instead of asking once which employee" },
    fixFlags: ["CHAT_GLOSSARY_ENABLED"],
    run: (t) => runMessage(t, byId("mgr-2-msb-no-name")),
  },
  {
    id: "nov4-mgr-3-salon-metrics",
    title: `"${byId("mgr-3-salon-metrics").text}" — a CA card, no "what happened", cites the Standards of Conduct`,
    report: `${REPORT}, #3`,
    // Run 4 Nov 2026 on main before #427: OPEN, the card says "Under Performance, as you said. The policy manual has no single section to quote for it": no Standards of Conduct citation, on the card or the draft.
    // Holds with production's flags since #427 (d55575c9): revision 7 of the form replaces Under Performance with the Standards of Conduct, so the draft cites it.
    status: "fixed",
    fixFlags: ["CA_SALES_POLICY_ENABLED"],
    run: (t) => runMessage(t, byId("mgr-3-salon-metrics")),
  },
  {
    id: "nov4-mgr-4-msb-october",
    title: `"${byId("mgr-4-msb-october").text}" — a CA card, MSB never a name, cites the Standards of Conduct`,
    report: `${REPORT}, #4`,
    // Run 4 Nov 2026 (production flags): fails as below.
    status: { open: "no card at all: \"MSB CA for …\" is answered as a policy question (the pack's stand-in answer) with production's flags" },
    // Holds with both flags (claude/ca-sales-msb-cases): a leading glossary term is the reason, not part of the request (`detectTemplateIntent`).
    fixFlags: ["CA_SALES_POLICY_ENABLED", "CHAT_GLOSSARY_ENABLED"],
    run: (t) => runMessage(t, byId("mgr-4-msb-october")),
  },
  {
    id: "nov4-mgr-5-msb-soc",
    title: `"${byId("mgr-5-msb-soc").text}" — asks once "Do you want a Corrective Action for …?"; the card only after "yes"`,
    report: `${REPORT}, #5`,
    /*
     * Pau, 4 Nov 2026: no request in the message, so it stays a policy answer
     * (no routing change). With CA_SALES_POLICY_ENABLED it asks once; the card
     * is made only after "yes", and cites the Standards of Conduct with the
     * manual heading and page; MSB is never a name. See `ai/ca-offer.ts`.
     */
    status: { open: "no offer: the policy answer ends without asking whether to start a Corrective Action" },
    fixFlags: ["CA_SALES_POLICY_ENABLED", "CHAT_GLOSSARY_ENABLED"],
    async run(t) {
      const message = byId("mgr-5-msb-soc");
      const name = `${message.person!.firstName} ${message.person!.lastName}`;
      vi.setSystemTime(new Date("2026-11-04T15:30:00Z"));
      t.directory(MANAGER_ROSTER);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(message.text);
      expect(thread.proposal ?? null, `a card was made before "yes":\n${reply.content}`).toBeNull();
      expect(reply.content.match(/Do you want a Corrective Action for /g) ?? [], `not asked exactly once:\n${reply.content}`).toHaveLength(1);
      expect(reply.content, "the question does not name the person and the Standards of Conduct").toContain(`**Do you want a Corrective Action for ${name}?**`);
      expect(reply.content).toMatch(/\*\*Standards of Conduct\*\*/);
      const yes = await thread.say("yes");
      expect(thread.proposal, `no card after "yes":\n${yes.content}`).toMatchObject({ templateKey: "dpoa", employeeName: name });
      expect(yes.content, "MSB shown as a name").not.toMatch(/\*\*Msb\*\*|couldn'?t find \*\*msb\*\*/i);
      t.draftWrites({ observation: `Observed:\n${name} did not follow the Must See Behaviors.` }, { offense_type: ["standards_of_conduct"] });
      const id = await thread.create();
      const values = t.values(id);
      expect(values.policy_violated ?? "", "Policy Violated").toMatch(/standards of conduct/i);
      expect(values.policy_language ?? "", "Direct policy heading").toMatch(/standards of conduct/i);
      expect(values.policy_language ?? "", "Direct policy page").toMatch(/\bp(?:age|\.)\s*\d+/i);
    },
  },
];
