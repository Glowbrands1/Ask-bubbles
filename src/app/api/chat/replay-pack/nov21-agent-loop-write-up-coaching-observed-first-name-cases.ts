import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A COACHING OBSERVED LINE: THE FIRST NAME, AND WHAT WAS SEEN, NOT THE TOPIC (port from the sibling app: its QA's live test, 20 Nov 2026)
 * ============================================================================
 *
 * The manager typed "coaching for <P> on greeting guests, she didn't greet 3 guests today"; the saved coaching_details
 * read "Observed:\nGreeting guests, she didn't greet 3 guests.\n\nExpectation:\n…". Observed called the employee "she"
 * (an AI-written saved field) and opened with the coaching topic as a prefix. Expected: "<P> didn't greet 3 guests
 * today." On the real Create path; the person is invented (`loop-roster.ts`).
 */

const REPORT = "The sibling app's QA, live (20 Nov 2026), ported: the coaching Observed said \"she\" and opened with the topic";
const SAID = "coaching for Fenna Prewitt on greeting guests, she didn't greet 3 guests today";

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({
  id,
  title,
  report: REPORT,
  status: "fixed",
  async run(t) {
    vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    t.directory([...LOOP_STAFF]);
    t.as("location_manager", WEST_DODGE);
    await run(t);
  },
});

async function created(t: ReplayContext, account: string, drafted: string) {
  t.loopModel!(loopStandIn((view): LoopDecision => lastResult(view, "propose_form")
    ? { text: "Here's the Coaching Form for **Fenna**." }
    : {
        tool: "propose_form",
        input: {
          template_key: "coaching",
          employee_id: LOOP_FENNA.id,
          person_evidence: evidenceFrom(view, "Fenna Prewitt"),
          what_happened: account,
          topic: "greeting guests",
          topic_evidence: evidenceFrom(view, "greeting guests"),
          incident_date: "2026-11-20",
        },
      }));
  t.draftWrites({ coaching_details: drafted });
  const thread = t.thread();
  await thread.say(SAID);
  const id = await thread.create();
  return t.values(id).coaching_details ?? "";
}

const observedOf = (details: string) => /Observed:\s*\n?([\s\S]*?)(?=\n\s*(?:Expectation|Going Forward):|$)/i.exec(details)?.[1]?.trim() ?? "";

function expectSeenWithName(details: string) {
  const observed = observedOf(details);
  expect(observed, `no Observed was saved (the case proves nothing):\n${details}`).toMatch(/greet 3 guests/);
  expect(observed, `Observed calls the employee "she":\n${details}`).not.toMatch(/\b(?:she|her|he|him|his)\b/i);
  expect(observed, `Observed opens with the coaching topic:\n${details}`).not.toMatch(/^greeting guests\b/i);
  expect(observed, `Observed is not what was seen, by name:\n${details}`).toMatch(/^Fenna didn't greet 3 guests\b/);
}

export const NOV21_AGENT_LOOP_WRITE_UP_COACHING_OBSERVED_FIRST_NAME_CASES: ReplayCase[] = [
  fixed("nov21-coaching-observed-first-name-no-topic-prefix", `The sibling app's QA, live: "${SAID}", the drafter writes Observed as saved ("Greeting guests, she didn't greet 3 guests."): Observed reads "Fenna didn't greet 3 guests …"`, async (t) => {
    expectSeenWithName(await created(t, "Greeting guests, she didn't greet 3 guests today.", "Observed:\nGreeting guests, she didn't greet 3 guests.\n\nExpectation:\nFenna is expected to greet all guests as they arrive."));
  }),
  fixed("nov21-coaching-observed-from-card-account-no-topic-prefix", `The sibling app's QA, live: "${SAID}", Observed written as a coaching record and so rebuilt from the card's account ("Greeting guests, she didn't greet 3 guests today."): it reads "Fenna didn't greet 3 guests today."`, async (t) => {
    const details = await created(t, "Greeting guests, she didn't greet 3 guests today.", "Observed:\nCoaching was provided to Fenna on greeting guests.\n\nExpectation:\nFenna is expected to greet all guests as they arrive.");
    expectSeenWithName(details);
    expect(observedOf(details)).toBe("Fenna didn't greet 3 guests today.");
  }),
];
