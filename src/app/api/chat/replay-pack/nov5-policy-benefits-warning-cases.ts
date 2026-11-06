import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A BENEFITS "WARNING" NEVER GOES ONTO A CORRECTIVE ACTION (QA, 5 Nov 2026, severe)
 * ============================================================================
 *
 * A real location manager (4× 1-star), revising a Corrective Action Form: "in the previously recieved coaching
 * include that <name> signed the jba policy manual on 10-15-26". The reply said Direct policy "now cites
 * Standards of Conduct (page 12) and Warning (page 36)", and the saved Direct policy quoted the manual's 401k sheet
 * headed "Warning" ("… before your legal retirement age unless you transfer it to an IRA"). The bare "that" read as
 * a reference back, and the app's own "**Verbal Warning** or **Written Warning**?" named the heading
 * (`forms/chat-policy-change.ts`). The manager's words, with an invented person on the pack's roster.
 */
export const NOV5_POLICY_BENEFITS_WARNING_CASES: ReplayCase[] = [
  {
    id: "nov5-policy-benefits-warning-revision",
    title: "a CA asked its warning level, then \"in the previously recieved coaching include that marnie holloway signed the jba policy manual on 10-15-26\": Direct policy never cites the manual's benefits \"Warning\"",
    report: "QA, 5 Nov 2026 (severe; a location manager's revision): Direct policy cited the 401k sheet \"Warning\" (page 36)",
    // "warning" is no section (policy-change.ts NOT_A_SECTION, ported from the sibling's live code; Pau's exception, 6 Nov 2026),
    // so with production's flags the benefits sheet is never cited. That the turn reaches the ordinary revision is
    // POLICY_CHANGE_RELEVANT_ENABLED's, in its own pull request.
    status: "fixed",
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("corrective action");
      await thread.say("marnie holloway");
      await thread.say("marnie did not acknowledge woven policies by the due date 10/31");
      t.draftWrites({});
      const id = await thread.create();
      const reply = await thread.say("in the previously recieved coaching include that marnie holloway signed the jba policy manual on 10-15-26");
      expect(reply.content, `the reply cites the benefits "Warning":\n${reply.content}`).not.toMatch(/\*\*Warning\*\* \(page 36\)|income taxes|retirement age/);
      expect(t.values(id).policy_language ?? "", "Direct policy quotes the benefits sheet").not.toMatch(/legal retirement age|income taxes|\bIRA\b/);
    },
  },
];
