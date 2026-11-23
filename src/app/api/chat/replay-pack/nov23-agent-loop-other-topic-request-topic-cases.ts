import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A LOOP COACHING CARD'S "OTHER" TOPIC FALLS BACK TO THE TOPIC THE MANAGER NAMED AFTER THE PERSON'S NAME (follow-up to
 * #1097; QA, 17 Nov 2026 rule (b), as the sibling app's nov17-coaching-topic cases hold it)
 * ============================================================================
 *
 * #1097 (A1) stopped a loop card's empty Other write-in from being filled with a clause of the account. It also dropped
 * the topic the manager named after the person's name ("Coaching for <name> on greeting guests at the door" → "Greeting
 * guests at the door"), QA's 17 Nov fallback, which this app had no case for. Found porting #1097 to the sibling app,
 * whose cases caught it. The request's topic stays; an account clause never becomes the topic. Invented person (on no
 * fixture): Feodora Pendrell.
 */

const REPORT = "Porting #1097 to the sibling app (23 Nov 2026): its nov17 cases caught the after-the-name topic dropped for loop cards; QA's 17 Nov rule (b)";
const FEODORA: DirectoryRow = { id: "e-feodora-pendrell", firstName: "Feodora", lastName: "Pendrell", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const ACCOUNT = "Feodora is not greeting guests at the door.";

async function savedTopic(t: Parameters<ReplayCase["run"]>[0], said: string) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, FEODORA]);
  t.as("location_manager", WEST_DODGE);
  t.loopModel!(loopStandIn((view): LoopDecision => (lastResult(view, "propose_form")
    ? { text: "Here's the Coaching Form." }
    : { tool: "propose_form", input: { template_key: "coaching", employee_id: FEODORA.id, person_evidence: evidenceFrom(view, "feodora pendrell"), what_happened: ACCOUNT } })));
  /* The drafting model ticks Other and leaves its write-in empty. */
  t.draftWrites({ coaching_details: `Observed:\n${ACCOUNT}`, other_topic: "" }, { coaching_topics: ["other"] });
  const thread = t.thread();
  await thread.say(said);
  const id = await thread.create();
  return t.values(id).other_topic ?? "";
}

export const NOV23_AGENT_LOOP_OTHER_TOPIC_REQUEST_TOPIC_CASES: ReplayCase[] = [
  {
    id: "nov23-other-topic-falls-back-to-the-request-topic",
    title: "QA 17 Nov rule (b) after #1097: \"Coaching for feodora pendrell on greeting guests at the door\", no topic on the card: the saved Other topic is \"Greeting guests at the door\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      expect(await savedTopic(t, "Coaching for feodora pendrell on greeting guests at the door")).toBe("Greeting guests at the door");
    },
  },
  {
    id: "nov23-other-topic-never-an-account-clause",
    title: "Control (#1097, A1): \"coaching form for feodora pendrell\", no topic anywhere but the account: the saved Other topic stays empty",
    report: REPORT,
    status: "fixed",
    async run(t) {
      expect(await savedTopic(t, "coaching form for feodora pendrell, she is not greeting guests at the door")).toBe("");
    },
  },
];
