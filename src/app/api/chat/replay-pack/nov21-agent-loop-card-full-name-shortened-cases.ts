import { expect, vi } from "vitest";

import type { ChatFormProposal } from "@/types";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE CARD'S PERSON BY FIRST NAME, NOT THE FULL NAME (port from the sibling app: its QA, 20 Nov 2026, live)
 * ============================================================================
 *
 * QA typed "ca for <full name>, late 11/18" (a test name off the staff list) and got "Here's the Corrective Action Form
 * for **<full name>**", "Observation of Offense: <full name> was late on 11/18", and a saved Observed of "<full name> was
 * late to work on November 18, 2026." (Expectation and Going Forward said the first name). Pau's rule is the first name.
 * Code now puts the reply name in place of the full name on the card's account, in the reply (except the lines that
 * confirm which person it is: the not-on-the-staff-list line keeps the full name in bold), and in the saved write-up.
 * The stand-in model and drafter here write the full name, as the live ones did. Brisa Talloway is invented and is on no
 * roster (the loop cases' own people are `loop-roster.ts`). No policy is cited: the pack has no policy manual to read
 * for a loop card here, and the name is the point.
 */

const REPORT = "The sibling app's QA (20 Nov 2026), ported: \"Here's the Corrective Action Form for **<full name>**\" and Observed \"<full name> was late to work\" after Pau's first-name rule";
const SAID = "ca for Brisa Talloway, late 11/18";
const LIVE_REPLY = [
  "Here's the Corrective Action Form for **Brisa Talloway**.",
  "",
  "**Brisa Talloway** isn't on the Woven staff list, so I've used the name as you typed it. Check the spelling before you press Create.",
  "",
  "**Observation of Offense:** Brisa Talloway was late on 11/18.",
].join("\n");

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-20T22:05:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

const managerTurns = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);

/** The live model: the full name on the card's account and in its reply. */
function fullNameModel(reply: string) {
  return loopStandIn((view): LoopDecision => {
    if (view.results.some((entry) => entry.tool === "propose_form")) return { text: reply };
    const quote = { message_id: managerTurns(view).at(-1)?.messageIds?.at(-1) ?? "current", quote: "Brisa Talloway" };
    return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Brisa Talloway", person_evidence: quote, what_happened: "Brisa Talloway was late on 11/18.", incident_date: "2026-11-18" } };
  });
}

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({
  id,
  title,
  report: REPORT,
  status: "fixed",
  async run(t) {
    start(t);
    await run(t);
  },
});

export const NOV21_AGENT_LOOP_CARD_FULL_NAME_SHORTENED_CASES: ReplayCase[] = [
  fixed("nov21-agent-loop-card-full-name-becomes-first-name-in-reply-and-card", `"${SAID}": the model writes "Brisa Talloway" on the card's account and in its reply; the card and the reply say "Brisa", and the not-on-the-staff-list line keeps "**Brisa Talloway**"`, async (t) => {
    t.loopModel!(fullNameModel(LIVE_REPLY));
    const reply = await t.thread().say(SAID);
    const card = reply.formProposal as ChatFormProposal | undefined;
    expect(card?.employeeName, "the card's name field keeps the full name").toBe("Brisa Talloway");
    expect(card?.issue, "the card's account named the person in full").toBe("Brisa was late on 11/18.");
    expect(reply.content, reply.content).toContain("Here's the Corrective Action Form for **Brisa**.");
    expect(reply.content, reply.content).toContain("**Observation of Offense:** Brisa was late on 11/18.");
    expect(reply.content, "the line that confirms which person it is lost the full name").toContain("**Brisa Talloway** isn't on the Woven staff list");
  }),
  fixed("nov21-agent-loop-card-full-name-saved-observed-starts-with-first-name", `"${SAID}", then Create, and the drafter writes "Brisa Talloway was late to work on November 18, 2026.": the saved Observed starts "Brisa was late"`, async (t) => {
    t.loopModel!(fullNameModel(LIVE_REPLY));
    const thread = t.thread();
    await thread.say(SAID);
    t.draftWrites({ observation: "Observed:\nBrisa Talloway was late to work on November 18, 2026.\n\nExpectation:\nBrisa is expected to arrive on time for every scheduled shift." });
    const id = await thread.create();
    const observation = t.values(id).observation ?? "";
    expect(observation, observation).toMatch(/^Observed:\s*Brisa was late to work on November 18, 2026\./);
    expect(observation, observation).not.toMatch(/\bBrisa Talloway\b/);
  }),
  fixed("nov21-agent-loop-card-full-name-question-keeps-it", `Control: a reply that asks a question naming "Brisa Talloway" keeps the full name there (the which-person and did-you-mean questions are read back by the app)`, async (t) => {
    t.loopModel!(fullNameModel(`${LIVE_REPLY}\n\nIs this for Brisa Talloway at West Dodge?`));
    const reply = await t.thread().say(SAID);
    expect(reply.content, reply.content).toContain("Is this for Brisa Talloway at West Dodge?");
    expect(reply.content, reply.content).toContain("**Observation of Offense:** Brisa was late on 11/18.");
  }),
];
