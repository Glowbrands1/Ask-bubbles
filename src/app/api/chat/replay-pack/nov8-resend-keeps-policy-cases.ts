import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * THE SAME REQUEST SENT TWICE KEEPS ITS POLICY (ported from the sibling app: its sf-s38, QA's round-6 gate, 8 Nov
 * 2026). With SECOND_REQUEST_OWN_ACCOUNT_ENABLED on there, a request sent a second time was read as a new request
 * (`ai/form-state.ts` stateForTurn): the second card lost its Policy line and its Action Plan said "the applicable
 * company policy". The same mechanism is here (the flag is off in this app's production): the draft made after the
 * resend still names the Attendance policy. This app's words; the person
 * is the pack's invented Remy Calder. Also one near-identical resend: a typo fixed and a closing "please".
 */
const ASKED = "create a corrective action for Remy Calder, he missed his saturday and sunday shifts at the store and didnt call in";
const REPORT = "The sibling app's sf-s38 (QA's round-6 gate, 8 Nov 2026): the same request sent twice lost its Policy line";

function policyLine(content: string): string {
  return content.split("\n").find((line) => /\*\*Policy:?\*\*/i.test(line)) ?? "";
}

export const NOV8_RESEND_KEEPS_POLICY_CASES: ReplayCase[] = [
  ...(
    [
      ["twice", ASKED],
      ["typo-fixed-please", `${ASKED.replace("didnt", "didn't")} please`],
    ] as const
  ).map(
    ([key, again]): ReplayCase => ({
      id: `nov8-resend-keeps-policy-${key}`,
      title: `the same request sent again (${key}): the second card keeps the Attendance policy and its Action Plan`,
      report: REPORT,
      // A guard: this app's route shows no loss even before the fix (its card has no Policy line, and the draft's prompt
      // keeps Attendance either way). The mechanism is the sibling's, ported as is; its unit rows
      // (`ai/form-state-resend.test.ts`) fail before the fix and pass after.
      status: "fixed",
      fixFlags: ["SECOND_REQUEST_OWN_ACCOUNT_ENABLED"],
      async run(t) {
        vi.setSystemTime(new Date("2026-11-07T16:14:00Z"));
        t.directory(STAFF);
        t.as("location_manager", WEST_DODGE);
        // The models read Attendance for "missed his saturday and sunday shifts … didnt call in".
        t.slotsRead({ policyHeading: "Attendance" });
        const thread = t.thread();
        await thread.say(ASKED);
        await thread.say(again);
        // This app's card shows no Policy line: the policy the conversation grounded reaches the draft's prompt.
        t.draftWrites({ observation: "Observed:\nRemy Calder missed his Saturday and Sunday shifts and did not call in." }, { offense_type: ["attendance_policy"] });
        await thread.create();
        const prompt = t.draftPrompts().at(-1) ?? "";
        expect(prompt, "the draft's prompt lost the Attendance policy").toMatch(/Attendance/);
      },
    }),
  ),
];
