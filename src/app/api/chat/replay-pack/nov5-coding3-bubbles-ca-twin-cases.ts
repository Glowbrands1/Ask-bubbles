import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * CODING-3 OPEN CASES, TWINS (the sibling app's production, relayed by QA,
 * 5 Nov 2026), in this app's terms (store): TWO CORRECTIVE ACTION CARD NOTES
 * ============================================================================
 *
 * Cases only: OPEN with today's production flags, no fixFlags until a fix
 * exists. The manager's turns are verbatim; every person is invented and on
 * this file's own fixture only. The manager is the actor.
 *
 *   prior coaching  "I need to write up <name> with a written warning for
 *                   leaving the front desk unattended for 30 minutes on
 *                   10/22. There's no prior coaching on file." → the card
 *                   said "Prior coaching note: prior coaching on file. No
 *                   finalized record was required." Expected: the note never
 *                   says prior coaching is on file when the manager said
 *                   there is none. (`typedPriorCoachingNote`,
 *                   ai/prior-coaching-optional.ts, is the same code here.)
 *   performance     "can you write me a Ca for <name> for performance for
 *                   october" → "You haven't told me what happened yet".
 *                   Expected, with CA_SALES_POLICY_ENABLED on: a CA for
 *                   performance is the sales-performance account; the card
 *                   cites the Standards of Conduct and does not ask what
 *                   happened.
 *
 * "Change <name> CA" in a new chat (a new form, not the CA on file) is
 * already nov5-twin-sf-s26-change-ca-new-chat (nov5-pau-sf-s26-s28-twin-cases.ts);
 * not repeated here.
 */

type T = ReplayContext;

const STORE = "loc-264";
const person = (id: string, firstName: string, lastName: string): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: [STORE],
  positionName: "Team Member Part Time",
});

const PERPETUA = person("e-perpetua-vandermolen", "Perpetua", "Vandermolen");
const OSWIN = person("e-oswin-larchfield", "Oswin", "Larchfield");
const PEOPLE: readonly DirectoryRow[] = [PERPETUA, OSWIN];

/** The invented people of this file (a function: the registry reads exported arrays as cases). */
export function coding3BubblesCaTwinPeople(): readonly DirectoryRow[] {
  return PEOPLE;
}

const REPORT = "QA, 5 Nov 2026 (the sibling app's production, coding-3 open items; twin)";
const NO_ACCOUNT = /haven'?t told me what happened/i;

function start(t: T) {
  vi.setSystemTime(new Date("2026-11-05T15:00:00Z"));
  t.directory([...STAFF, ...PEOPLE]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function policyLine(reply: ReplayAnswer): string {
  return reply.content.split("\n").find((line) => /\*\*Policy:?\*\*/i.test(line)) ?? "";
}

/** A line of the reply that says prior coaching is on file. */
function saysPriorCoachingOnFile(reply: ReplayAnswer): string[] {
  return reply.content
    .split("\n")
    .filter((line) => /prior coaching/i.test(line) && /\bon file\b/i.test(line) && !/\bno prior coaching\b|\bnot on file\b|\bnone\b/i.test(line));
}

export const NOV5_CODING3_BUBBLES_CA_TWIN_CASES: ReplayCase[] = [
  {
    id: "nov5-coding3-twin-prior-coaching-none-on-file",
    title: "\"… There's no prior coaching on file.\": the card's prior-coaching note never says prior coaching is on file",
    report: `${REPORT}: "I need to write up <name> with a written warning … There's no prior coaching on file." → "Prior coaching note: prior coaching on file. No finalized record was required."`,
    status: { open: "the note quotes \"prior coaching on file\" without the manager's \"no\": \"Prior coaching note: prior coaching on file.\"" },
    async run(t: T) {
      /*
       * PRIOR_COACHING_OPTIONAL_ENABLED writes the note this case reports. It
       * is not in this app's production-flags.json; on here so the case reads
       * the path the sibling report took.
       */
      vi.stubEnv("PRIOR_COACHING_OPTIONAL_ENABLED", "true");
      try {
        const thread = start(t);
        const reply = await thread.say(
          "I need to write up Perpetua Vandermolen with a written warning for leaving the front desk unattended for 30 minutes on 10/22. There's no prior coaching on file.",
        );
        expect(thread.proposal, `no Corrective Action card for Perpetua Vandermolen:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Perpetua Vandermolen" });
        expect(saysPriorCoachingOnFile(reply), `says prior coaching is on file although the manager said there is none:\n${reply.content}`).toEqual([]);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  },
  {
    id: "nov5-coding3-twin-ca-for-performance-is-an-account",
    title: "\"can you write me a Ca for <name> for performance for october\": with CA_SALES_POLICY_ENABLED the card cites the Standards of Conduct; never \"You haven't told me what happened yet\"",
    report: `${REPORT}: "can you write me a Ca for <name> for performance for october" → "You haven't told me what happened yet"`,
    status: { open: "no card at all (\"A grounded answer from the policy manual.\"): \"can you write me a Ca\" is no request here (WRITES_THE_FORM has no \"write me a\", as nov5-twin-sf-s28 records); behind it, \"for performance\" is no account and no sales reading" },
    /*
     * Two readings, both behind CA_SALES_POLICY_ENABLED: "can you write me a Ca" is the request
     * (`WRITES_THE_FORM_LOOSE`, forms/template-intent.ts, ported from the sibling app's main), and with
     * CA_PERFORMANCE_REASON_ENABLED (default off, not in production) "for performance" in that request is
     * the sales reading (`withSalesPolicy`, forms/ca-policy.ts).
     */
    fixFlags: ["CA_SALES_POLICY_ENABLED", "CA_PERFORMANCE_REASON_ENABLED"],
    async run(t: T) {
      /*
       * CA_SALES_POLICY_ENABLED is OFF in this app's production (production-
       * flags.json lists it under "off"); the report is what it must do once
       * on, so it is on inside the case, as the sibling case does.
       * CA_ASKS_WHAT_HAPPENED_ENABLED is on in the sibling's production; this
       * app has no such flag (it writes "You haven't told me what happened
       * yet" with none, as nov5-twin-sf-s28 records), so stubbing it is a
       * no-op kept for parity with the sibling case.
       *
       * Replayed 5 Nov 2026: here the turn makes no card at all ("can you
       * write me a Ca" is not read as a request, `WRITES_THE_FORM` in
       * forms/template-intent.ts has no "write me a"), so the case fails one
       * step before the sibling's; the "for performance" gap is behind it.
       */
      vi.stubEnv("CA_ASKS_WHAT_HAPPENED_ENABLED", "true");
      vi.stubEnv("CA_SALES_POLICY_ENABLED", "true");
      try {
        const thread = start(t);
        const reply = await thread.say("can you write me a Ca for Oswin Larchfield for performance for october");
        expect(thread.proposal, `no Corrective Action card for Oswin Larchfield:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Oswin Larchfield" });
        expect(reply.content, `asks what happened although the reason (performance) was given:\n${reply.content}`).not.toMatch(NO_ACCOUNT);
        expect(policyLine(reply), `the card does not cite Standards of Conduct:\n${reply.content}`).toMatch(/standards of conduct/i);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  },
];
