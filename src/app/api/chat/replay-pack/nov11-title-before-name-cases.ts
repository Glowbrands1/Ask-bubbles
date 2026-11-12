import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "CORRECTIVE ACTION FOR TEAM MEMBER <NAME>": A REQUEST FOR <NAME>'S FORM (QA's Bubbles 17h live test, 11 Nov 2026;
 * TITLE_BEFORE_NAME_ENABLED)
 * ============================================================================
 *
 * As Admin, on main 8ff2e3ba, "Corrective action for Team Member <name not on the roster>" gave no card: the reply
 * answered from the Forms Register instead. "Team" cannot be a name, so the words after "for" were not read as one and
 * the message was taken as a question about corrective action. "Create a corrective action for Team Member <name>"
 * carded with no employee. The tester's wording; the person is invented and not on the roster.
 */
const NAME = "Wren Tallis";
const SAID = `Corrective action for Team Member ${NAME}`;
const FIX = ["TITLE_BEFORE_NAME_ENABLED"];
const REPORT = "QA's Bubbles 17h live test (11 Nov 2026): a job title before the name lost the Corrective Action card";
const EVERY_STORE = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

async function ask(t: ReplayContext, role: "admin" | "location_manager", words: string) {
  vi.setSystemTime(new Date("2026-11-11T15:00:00Z"));
  t.directory(STAFF);
  t.as(role, role === "admin" ? EVERY_STORE : WEST_DODGE);
  const thread = t.thread();
  const reply = await thread.say(words);
  return { reply, proposal: thread.proposal };
}

function forTheName(proposal: { templateKey?: string; employeeName?: string | null } | null | undefined, content: string): void {
  expect(proposal?.templateKey, `no Corrective Action card:\n${content}`).toBe("dpoa");
  expect(proposal?.employeeName ?? null, `the card is not for ${NAME}:\n${content}`).toBe(NAME);
}

export const NOV11_TITLE_BEFORE_NAME_CASES: ReplayCase[] = [
  {
    id: "nov11-title-before-name-admin",
    title: `"${SAID}" (admin): the Corrective Action card, for ${NAME}`,
    report: REPORT,
    status: { open: "no card: the message is read as a question about corrective action" },
    fixFlags: FIX,
    async run(t: ReplayContext) {
      const { reply, proposal } = await ask(t, "admin", SAID);
      forTheName(proposal, reply.content);
    },
  },
  {
    id: "nov11-title-before-name-location-manager",
    // A store manager is asked about a name on nobody's roster before the card (OFF_ROSTER_ASK_BEFORE_CARD), exactly as
    // "Corrective action for Wren Tallis" is; the question names the person, never "Team Member <name>".
    title: `"${SAID}" (location_manager): asked about ${NAME} as the plain name is, never about "Team Member ${NAME}"`,
    report: REPORT,
    status: { open: "no card and no question about the name: the message is read as a question about corrective action" },
    fixFlags: FIX,
    async run(t: ReplayContext) {
      const { reply } = await ask(t, "location_manager", SAID);
      expect(reply.content, reply.content).toContain(`I can't find **${NAME}** on your roster`);
      expect(reply.content, reply.content).not.toMatch(/Team Member Wren Tallis/);
    },
  },
  {
    id: "nov11-title-before-name-create-names-employee",
    title: `"Create a corrective action for Team Member ${NAME}": the card names ${NAME}`,
    report: REPORT,
    status: { open: "the card has no employee and asks who it is for" },
    fixFlags: FIX,
    async run(t: ReplayContext) {
      const { reply, proposal } = await ask(t, "admin", `Create a corrective action for Team Member ${NAME}`);
      forTheName(proposal, reply.content);
    },
  },
  /*
   * QA (12 Nov 2026): the created draft, not only the card. The titled card was refused at Create ("the conversation now
   * says the form is for Team Member <name>, not <name>"), and "for TM <name>" carded with no employee. The draft is
   * <name>'s and holds what the plain-name request's draft holds (its Action Plan included); the title is never the
   * account.
   */
  ...(
    [
      ["team-member", `Corrective action for Team Member ${NAME}`],
      ["create-team-member", `Create a corrective action for Team Member ${NAME}`],
      ["tm", `Corrective action for TM ${NAME}`],
    ] as const
  ).map(([key, words]) => ({
    id: `nov11-title-before-name-draft-${key}`,
    title: `"${words}" (admin): Create makes the same draft as for "${NAME}"`,
    report: REPORT,
    status: { open: "Create refuses the card, or the card has no employee" } as const,
    fixFlags: FIX,
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-11T15:00:00Z"));
      t.directory(STAFF);
      t.as("admin", EVERY_STORE);
      const plain = t.thread();
      await plain.say(`Corrective action for ${NAME}`);
      const expected = t.values(await plain.create());
      const thread = t.thread();
      await thread.say(words);
      const values = t.values(await thread.create());
      expect(values.employee_name, JSON.stringify(values)).toBe(NAME);
      expect(values.observation ?? "", JSON.stringify(values)).not.toMatch(/\b(?:Team Member|TM)\s+Wren Tallis/i);
      // The same draft as the plain-name request's, apart from a job title the manager stated.
      const rest = Object.fromEntries(Object.entries(values).filter(([field]) => field !== "job_title"));
      expect(rest, `titled: ${JSON.stringify(values)}\nplain: ${JSON.stringify(expected)}`).toEqual(expected);
    },
  })),
  {
    id: "nov11-title-before-name-plain-name-unchanged",
    title: `NEVER-BREAK: "Corrective action for ${NAME}" still cards for ${NAME}`,
    report: REPORT,
    status: "fixed",
    fixFlags: FIX,
    async run(t: ReplayContext) {
      const { reply, proposal } = await ask(t, "admin", `Corrective action for ${NAME}`);
      forTheName(proposal, reply.content);
    },
  },
];
