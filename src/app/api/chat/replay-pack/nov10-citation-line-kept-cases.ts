import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { REFUSAL_ROSTER } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * CITATION_LINE_KEPT_ON_REVISION (ported from the sibling app's #560; Pau-approved 10 Nov 2026, "Ok revision.ts citation line")
 * ============================================================================
 *
 * This app's Coaching drafts now carry the app's own "Policy reference: …, JBA Policy Manual p.N" line
 * (EDIT_POLICY_ASK_ENABLED, on in production: "… please list the policy"). A chat edit that rewords or adds to Details,
 * whose revision does not repeat that line: with production's flags here the edit is saved and the line is lost (in
 * `planRevision` alone it is refused for the line's missing page numbers: `citation-line-kept-on-revision.test.ts`). With
 * the flag on, the revision gets the line back before the checks run. The person is invented.
 */
const LINE = "Policy reference: Attendance Policy, JBA Policy Manual p.14";
const DETAILS = `Observed:\nOttoline Ormsworth was late on 10/14/26.\n\nExpectation:\nOttoline is expected to arrive on time for every shift.\n\n${LINE}`;

function edited(said: string, revised: string) {
  return async (t: ReplayContext) => {
    vi.setSystemTime(new Date("2026-11-10T11:30:00Z"));
    t.directory(REFUSAL_ROSTER);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    await thread.say("create a coaching form for Ottoline Ormsworth, she was late on 10/14/26");
    t.draftWrites({ coaching_details: DETAILS });
    const id = await thread.create();
    t.revisionWrites({ coaching_details: revised });
    const reply = await thread.say(said);
    const details = t.values(id).coaching_details ?? "";
    expect(reply.content, `the edit was refused:\n${reply.content}`).not.toMatch(/haven't changed|didn't change/i);
    expect(details, `the edit was not saved:\n${details}`).not.toBe(DETAILS);
    expect(details, `the app's policy line was lost:\n${details}`).toContain(LINE);
  };
}

const REPORT = "Pau-approved port of the sibling app's CITATION_LINE_KEPT_ON_REVISION (#560), 10 Nov 2026";
const OPEN = { open: "the edit is saved without the app's policy line (the revision did not repeat it)" };

export const NOV10_CITATION_LINE_KEPT_CASES: ReplayCase[] = [
  {
    id: "nov10-citation-line-kept-wording",
    title: "a rewording of Details on a draft carrying the app's \"Policy reference\" line, the revision not repeating it: saved, the line kept",
    report: REPORT,
    status: OPEN,
    fixFlags: ["CITATION_LINE_KEPT_ON_REVISION_ENABLED"],
    run: edited(
      "can you reword it so it sounds more professional",
      "Observed:\nOn 10/14/26, Ottoline Ormsworth arrived late for her scheduled shift.\n\nExpectation:\nOttoline is expected to arrive on time for every scheduled shift.",
    ),
  },
  {
    id: "nov10-citation-line-kept-additive",
    title: "an addition to Details on a draft carrying the app's \"Policy reference\" line, the revision not repeating it: saved, the line kept",
    report: REPORT,
    status: OPEN,
    fixFlags: ["CITATION_LINE_KEPT_ON_REVISION_ENABLED"],
    run: edited(
      "also add that she did not call ahead to say she would be late",
      "Observed:\nOttoline Ormsworth was late on 10/14/26. She did not call ahead to say she would be late.\n\nExpectation:\nOttoline is expected to arrive on time for every shift.",
    ),
  },
];
