import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A SECTION THE MANAGER'S WORDS DESCRIBE IS AN ACCOUNT (coordinator via QA,
 * this app's production, 5 Nov 2026, message 83a93ef2)
 * ============================================================================
 *
 * "create a ca for <name> at dodge. he brought his new kitten to the store on
 * 10-22-26. verbal. no payroll deduct" — one reply said both "**You haven't
 * told me what happened yet**, so I can't cite the policy manual" and
 * "**Policy:** Animals in the Workplace, from what you described ("brought his
 * new kitten") — the policy manual's section on page 30". The policy reading
 * found the account; the account reading (two words left after the request
 * words) did not. The manager's turn is verbatim; the person is invented and on the
 * pack's directory, so the card is made (the pack refuses a name off the
 * roster; production on 27 Oct took it as typed).
 */

type T = ReplayContext;

const CORWIN: DirectoryRow = {
  id: "e-corwin-hale",
  firstName: "Corwin",
  lastName: "Hale",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

const REPORT = "Coordinator via QA, 5 Nov 2026 (this app's production, message 83a93ef2)";
const TURN = "create a ca for corwin hale at dodge. he brought his new kitten to the store on 10-22-26. verbal. no payroll deduct";

function start(t: T) {
  vi.setSystemTime(new Date("2026-10-27T02:15:00Z"));
  t.directory([...STAFF, CORWIN]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV5_DESCRIBED_TOPIC_ACCOUNT_CASES: ReplayCase[] = [
  {
    id: "nov5-kitten-account-not-awaiting",
    title: "\"he brought his new kitten to the store on 10-22-26\": the card cites Animals in the Workplace and never says \"You haven't told me what happened yet\"",
    report: `${REPORT}: the same reply said "You haven't told me what happened yet" and cited Animals in the Workplace p.30 "from what you described"`,
    status: { open: "with production's flags the card says \"You haven't told me what happened yet\" beside the Animals in the Workplace citation" },
    fixFlags: ["DESCRIBED_TOPIC_IS_ACCOUNT_ENABLED"],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(TURN);
      expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
      expect(reply.content, `the card does not cite Animals in the Workplace:\n${reply.content}`).toMatch(/Animals in the Workplace/);
      expect(reply.content, `the card says nothing happened beside a citation from what was described:\n${reply.content}`).not.toMatch(/You haven'?t told me what happened yet/);
    },
  },
  {
    id: "nov5-kitten-negative-name-alone",
    title: "negative control: a Corrective Action asked for on a name alone still says \"You haven't told me what happened yet\"",
    report: `${REPORT}, negative control`,
    status: "fixed",
    fixFlags: ["DESCRIBED_TOPIC_IS_ACCOUNT_ENABLED"],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("create a ca for corwin hale at dodge. verbal. no payroll deduct");
      expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
      expect(reply.content, `a name alone is not an account:\n${reply.content}`).toMatch(/You haven'?t told me what happened yet/);
    },
  },
];
