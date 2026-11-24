import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";
import { JBA_MANUAL_CA_CHUNKS } from "@/test/fixtures/jba-manual-ca-sections";

/**
 * ============================================================================
 * A LOOP CARD CITING "CARE AND CLEANING … p.21" SAVES IT (QA's Bubbles round 2, 22 Nov 2026; U06/U09/U15/U17)
 * ============================================================================
 *
 * The manager's turns, word for word (U21's, the person invented): T1 "corrective action", T2 "<P>", T3 "This is what
 * happened: She has recieved coaching on 9/22 for cleaning tasks not being completed. What was observed this weekend is
 * that trash liners were not put into the trash cans after collecting trash, laundry was not done". The card cited
 * "Standards of Conduct — Care and Cleaning of Equipment and Facilities, JBA Policy Manual p.21"; the saved form had no
 * Policy Violated and no Direct policy.
 *
 * Not the fixture (QA read production's pinned manual: the section is there, p.21): Create read the card's heading
 * through `namedPolicies`, which takes "of" as a sentence about a policy, so "Care and Cleaning of Equipment and
 * Facilities" named nothing. A loop card's heading is looked up as the manual heading it is (`manualSectionNamedBy`). Also
 * run with the chunk as production holds it (the heading 105 characters in, after the previous section's tail).
 */

const REPORT = "QA's Bubbles round 2 (22 Nov 2026; U06/U09/U15/U17): a card citing Care and Cleaning of Equipment and Facilities p.21 saved no Policy Violated or Direct policy";
const T1 = "corrective action";
const T2 = "Fenna Prewitt";
const T3 =
  "This is what happened: She has recieved coaching on 9/22 for cleaning tasks not being completed. What was observed this weekend is that trash liners were not put into the trash cans after collecting trash, laundry was not done";
const ACCOUNT = "Fenna Prewitt did not put trash liners into the trash cans after collecting trash this weekend, and laundry was not done.";
const HEADING = "Care and Cleaning of Equipment and Facilities";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";

const live = () =>
  loopStandIn((view): LoopDecision => {
    if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form." };
    if (said(view) === T1) return { text: "This Corrective Action Form needs a person. Who is it for?" };
    return {
      tool: "propose_form",
      input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, policy: headingWith(view, /care and cleaning/i), person_evidence: evidenceFrom(view, "Fenna Prewitt", said(view) === T2 ? 0 : 1), ...(said(view) === T3 ? { what_happened: ACCOUNT, incident_date: "2026-11-16" } : {}) },
    };
  });

async function createdForm(t: ReplayContext) {
  const thread = t.thread();
  t.loopModel!(live());
  for (const turn of [T1, T2, T3]) await thread.say(turn);
  const line = (thread.proposal as { policyLine?: string | null } | null)?.policyLine ?? "";
  expect(line, "the case proves nothing: the card does not cite Care and Cleaning").toMatch(/Care and Cleaning of Equipment and Facilities, JBA Policy Manual p\.21/);
  const id = await thread.create();
  return t.values(id);
}

function expectSaved(values: Record<string, string>) {
  expect(values.policy_violated ?? "", "Policy Violated does not name the card's section").toContain(HEADING);
  expect(values.policy_language ?? "", "Direct policy does not quote the card's section").toMatch(/Source: JBA Policy Manual — Care and Cleaning of Equipment and Facilities, p\. 21/);
  expect(values.policy_language ?? "", "the previous section's tail was quoted").not.toMatch(/approved messages/);
}

export const NOV22_AGENT_LOOP_CARE_AND_CLEANING_SAVED_CASES: ReplayCase[] = [
  {
    id: "nov22-care-and-cleaning-card-saved",
    title: "U06/U09/U15/U17: a card citing \"Care and Cleaning of Equipment and Facilities, JBA Policy Manual p.21\" — Create saves Policy Violated and Direct policy (p. 21) for it",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      expectSaved(await createdForm(t));
    },
  },
  {
    id: "nov22-care-and-cleaning-card-saved-production-chunk",
    title: "The same, with the manual's chunk as production holds it: the heading 105 characters in, after the previous section's tail",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.manualIs!(
        JBA_MANUAL_CA_CHUNKS.map((chunk) =>
          chunk.section === HEADING
            ? { ...chunk, content: `${"the store phone is for business calls only, and only for sending company-approved messages.".padStart(105, " ")}\n${chunk.content}` }
            : chunk,
        ) as never,
      );
      expectSaved(await createdForm(t));
    },
  },
];
