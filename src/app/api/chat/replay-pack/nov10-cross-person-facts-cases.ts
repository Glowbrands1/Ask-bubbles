import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * <B>'S CARD NEVER KEEPS <A>'S DATE OR PAYROLL ANSWER (B#166, 25 Oct 2026, and the sibling app's #236; the October triage's #2)
 * ============================================================================
 *
 * The sibling app's conv_mvoetxo92fraflz words (its #236; here B#166), the people invented (Ysolde Barrowmere, Fenna Calloway, and Corvin Ashdale named
 * in the account): <A>'s coaching document for an incident on 10-16-26, then "create a coaching document for <B>".
 * <B>'s card kept the Date 10/16/2026 (the October triage, 10 Nov 2026). The payroll case is this app's (B#166):
 * <A>'s "payroll deduct applies" read back on <B>'s card. CROSS_PERSON_FRESH_FACTS_ENABLED. Supersedes B#166.
 */

const person = (id: string, firstName: string, lastName: string): DirectoryRow => ({
  id, firstName, lastName, preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time",
});
const YSOLDE = person("e-cpf-ysolde", "Ysolde", "Barrowmere");
const FENNA = person("e-cpf-fenna", "Fenna", "Calloway");

export const NOV10_CROSS_PERSON_FACTS_CASES: ReplayCase[] = [
  {
    id: "nov10-cross-person-date-not-carried",
    title: "#236: after <A>'s coaching document for 10-16-26, \"create a coaching document for <B>\": <B>'s card has no Date 10/16/2026",
    report: "the sibling app's #236 (25 Oct 2026; B#166 here): B's card keeps A's Date 10/16",
    // A guard here (10 Nov 2026): this app's card already holds on production flags; the payroll case below is this
    // app's bug (B#166).
    status: "fixed",
    fixFlags: ["CROSS_PERSON_FRESH_FACTS_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
      t.directory([...STAFF, YSOLDE, FENNA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(
        "create a coaching document for Ysolde Barrowmere regarding On 10-16-26 Corvin Ashdale did not complete required policy acknowledgements during her onboarding and Ysolde did not follow up",
      );
      const reply = await thread.say("create a coaching document for Fenna Calloway");
      expect(thread.proposal, `no card for Fenna Calloway:\n${reply.content}`).toMatchObject({ employeeName: "Fenna Calloway" });
      expect(thread.proposal?.formDate ?? null, `A's date on B's card:\n${reply.content}`).not.toBe("2026-10-16");
      expect(reply.content, "A's date read back on B's card").not.toMatch(/10\/16\/2026/);
    },
  },
  {
    id: "nov10-cross-person-payroll-not-carried",
    title: "(B#166) after <A>'s CA with \"payroll deduct applies\", a CA for <B>: <B>'s card asks the payroll question",
    report: "B#166 (25 Oct 2026): A's payroll answer carried onto B's card",
    status: { open: "Fenna Calloway's card reads back Ysolde Barrowmere's payroll answer" },
    fixFlags: ["CROSS_PERSON_FRESH_FACTS_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
      t.directory([...STAFF, YSOLDE, FENNA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create a ca for Ysolde Barrowmere, she was late opening the store on 10-20-26, payroll deduct applies");
      const reply = await thread.say("create a ca for Fenna Calloway for being late on 10-22-26");
      expect(thread.proposal, `no card for Fenna Calloway:\n${reply.content}`).toMatchObject({ employeeName: "Fenna Calloway" });
      expect(reply.content, `A's payroll answer on B's card:\n${reply.content}`).not.toMatch(/Is payroll deduct applicable\?\s*\*\*Yes\*\*/i);
    },
  },
  {
    id: "nov10-cross-person-control-same-person",
    title: "control: the same person's next turn keeps the stored date",
    report: "coding 6, 10 Nov 2026: CROSS_PERSON_FRESH_FACTS_ENABLED's negative control",
    status: "fixed",
    fixFlags: ["CROSS_PERSON_FRESH_FACTS_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
      t.directory([...STAFF, YSOLDE, FENNA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create a ca for Ysolde Barrowmere, she was late opening the store on 10-20-26");
      const reply = await thread.say("written warning");
      expect(thread.proposal ?? null).toMatchObject({ employeeName: "Ysolde Barrowmere" });
      expect(thread.proposal?.formDate ?? null, `the same person's date was dropped:\n${reply.content}`).toBe("2026-10-20");
    },
  },
];
