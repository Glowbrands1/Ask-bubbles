import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayAnswer, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * R3 / R5 / R7 (QA's testers, 5 Nov 2026, flags ON): A ROSTER SURNAME TYPED
 * WITH ONE LETTER WRONG OR MISSING
 * ============================================================================
 *
 * Real managers typed a real, active roster person's surname with a typo.
 * Before the flip the card's Employee was the name as typed. With
 * FORM_NAME_FROM_ROSTER_ENABLED on (production since the flip), the Employee
 * is "Not yet", the reply still names the person (in the Action Plan), and
 * then asks "Who is this form for?": the person is dropped AND the reply
 * contradicts itself. The same contradiction for a name on no roster: the
 * reply says "I can create a CA for <A>" or "Name: <B>" while the card is
 * empty.
 *
 * QA's ask: (a) a near-miss of a roster name (the same first name, one letter
 * of the surname wrong or missing) gets "Is this for <roster full name>?" or
 * the roster person, never dropped silently; (b) when the employee is
 * removed, no reply text names them.
 *
 * Every person here is invented; the shapes are QA's.
 */

const person = (id: string, firstName: string, lastName: string, positionName: string): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName,
});

const IGNATIUS = person("e-ignatius-wexlerby", "Ignatius", "Wexlerby", "Team Member Part Time");
const ROSALIND = person("e-rosalind-quenneville", "Rosalind", "Quenneville", "Team Member Part Time");

/*
 * The flip's flags, on inside every case: production had them on when the testers found this, and
 * they were rolled back the same day (#462), so the cases no longer depend on production's flags.
 */
const FLIP = ["FORM_NAME_FROM_ROSTER_ENABLED", "CA_SALES_POLICY_ENABLED", "CHAT_GLOSSARY_ENABLED"];

function withFlip(run: ReplayCase["run"]): ReplayCase["run"] {
  return async (t) => {
    for (const flag of FLIP) vi.stubEnv(flag, "true");
    try {
      await run(t);
    } finally {
      vi.unstubAllEnvs();
    }
  };
}

const REPORT = "QA's testers, 5 Nov 2026 (R3, R5, R7; flags on): a roster surname typed with one letter wrong or missing";

const ASKS_WHO = /Who is this (?:\*\*[^*]+\*\* |form )?for\?/i;

async function said(t: Parameters<ReplayCase["run"]>[0], message: string, when = "2026-11-03T16:00:00Z") {
  vi.setSystemTime(new Date(when));
  t.directory([...STAFF, IGNATIUS, ROSALIND]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  const reply = await thread.say(message);
  return { reply, employee: thread.proposal?.employeeName ?? null, thread };
}

/** (a) The roster person is on the card, or the reply asks for them by their roster name. Never dropped silently. */
function offersTheRosterPerson(reply: ReplayAnswer, employee: string | null, rosterName: string): void {
  if (employee === rosterName) return;
  expect(employee, `the card's employee is neither empty nor ${rosterName}:\n${reply.content}`).toBeNull();
  expect(reply.content, `dropped silently: no "Is this for **${rosterName}**?":\n${reply.content}`).toContain(`Is this for **${rosterName}**?`);
}

/** (b) With no employee on the card, no reply text names the typed person. */
function namesNobodyOffTheCard(reply: ReplayAnswer, employee: string | null, typed: readonly string[]): void {
  if (employee) return;
  const offered = /Is this for \*\*[^*]+\*\*\?/.exec(reply.content)?.[0] ?? "";
  // "I couldn't find **<name>** in the Woven roster, so that name is not on the form." says why the card is empty: not a contradiction.
  const text = reply.content
    .replace(offered, "")
    .split("\n")
    .filter((line) => !/I couldn['’]t find \*\*/.test(line))
    .join("\n");
  for (const word of typed) {
    expect(text, `the card is empty but the reply names "${word}":\n${reply.content}`).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
  }
}

export const NOV5_R3_ROSTER_SURNAME_TYPO_CASES: ReplayCase[] = [
  {
    id: "nov5-r3-surname-one-letter-wrong",
    title: "R3 shape: \"create a CA for Ignatius Wexlarby …\" (roster: Ignatius Wexlerby): the card is his, or the reply asks \"Is this for **Ignatius Wexlerby**?\"; never dropped silently",
    report: `${REPORT}: one letter wrong; Employee "Not yet", the reply names him and asks who`,
    status: { open: "the card is emptied and the reply asks \"Who is this form for?\" while its Action plan names Ignatius" },
    fixFlags: ["ROSTER_NEAR_MISS_ENABLED"],
    run: withFlip(async (t) => {
      const { reply, employee, thread } = await said(t, "create a CA for Ignatius Wexlarby, he was 40 minutes late opening the store on 11/2. action plan: Ignatius will be on time for every opening shift");
      offersTheRosterPerson(reply, employee, "Ignatius Wexlerby");
      namesNobodyOffTheCard(reply, employee, ["Ignatius", "Wexlarby"]);
      if (employee) return;
      // "yes" to "Is this for **Ignatius Wexlerby**?" is him, with the request as asked.
      const answer = await thread.say("yes");
      expect(thread.proposal?.employeeName ?? null, `"yes" did not put him on the card:\n${answer.content}`).toBe("Ignatius Wexlerby");
      expect(answer.content, "the account is lost").toMatch(/late opening the store/i);
    }),
  },
  {
    id: "nov5-r5-surname-one-letter-missing",
    title: "R5 shape: \"write up Ignatius Wexlrby …\" (one letter missing): the card is his, or the reply asks \"Is this for **Ignatius Wexlerby**?\"",
    report: `${REPORT}: one letter missing`,
    status: "fixed",
    run: withFlip(async (t) => {
      const { reply, employee } = await said(t, "I need a corrective action for Ignatius Wexlrby. He left the register drawer open and unattended on 11/1. Action plan: Ignatius will lock the drawer every time he leaves the register");
      offersTheRosterPerson(reply, employee, "Ignatius Wexlerby");
      namesNobodyOffTheCard(reply, employee, ["Ignatius", "Wexlrby"]);
    }),
  },
  {
    id: "nov5-r7-coaching-surname-typo",
    title: "R7 shape: a coaching form for \"Rosalind Quennevile\" (one letter missing): the card is hers, or the reply asks \"Is this for **Rosalind Quenneville**?\"",
    report: `${REPORT}: coaching form, one letter missing; the Action Plan names her while the card is empty`,
    status: "fixed",
    run: withFlip(async (t) => {
      const { reply, employee } = await said(t, "make a coaching form for Rosalind Quennevile, she did not restock the shelves before close on 11/2. action plan: Rosalind will restock before every close");
      offersTheRosterPerson(reply, employee, "Rosalind Quenneville");
      namesNobodyOffTheCard(reply, employee, ["Rosalind", "Quennevile"]);
    }),
  },
  {
    id: "nov5-r3-off-roster-lowercase-action-plan",
    title: "R3 (off roster, typed in lowercase): \"create a CA for zebulon marchbanks …\" with an action plan naming him: the card is empty, and no reply text names him",
    report: `${REPORT}: off roster, the reply names the person while the card is empty`,
    // production-flags.json corrected to Vercel (QA, 5 Nov 2026): GROUNDED_ENTITIES_ENABLED is off in production since 24 Oct (a deliberate rollback), so a name on no roster goes on the card, and the reply names him. Recorded OPEN, a production defect.
    status: { open: "production: GROUNDED_ENTITIES_ENABLED off since 24 Oct (deliberate rollback: dropped non-roster names while ANTI_LOOP off; Vercel comment) — a name on no roster goes on the card, and the reply names him" },
    run: withFlip(async (t) => {
      const { reply, employee } = await said(t, "create a CA for zebulon marchbanks, he was 40 minutes late opening the store on 11/2. action plan: zebulon will be on time for every opening shift");
      expect(employee, "a name on no roster is the employee").toBeNull();
      namesNobodyOffTheCard(reply, employee, ["Zebulon", "Marchbanks"]);
    }),
  },
  {
    id: "nov5-r3-off-roster-name-line-unsaid",
    title: "R3 (b), off roster: \"I need a coaching form for Zebulon Marchbanks. Name: Zebulon Marchbanks. …\": the card is empty, so the reply never says it has the employee, never names him beyond \"I couldn't find\", and asks who",
    report: `${REPORT}: off roster, the reply names the person ("Name: …", "<name>'s position") and says "I have the employee" while the card is empty`,
    // holds only because GROUNDED_ENTITIES is off in production; re-open if GROUNDED is turned on.
    status: "fixed",
    fixFlags: ["ROSTER_NEAR_MISS_ENABLED"],
    run: withFlip(async (t) => {
      const { reply, employee } = await said(t, "I need a coaching form for Zebulon Marchbanks. Name: Zebulon Marchbanks. He did not restock the shelves before close on 11/2. Action plan: Zebulon will restock before every close");
      expect(employee, "a name on no roster is the employee").toBeNull();
      expect(reply.content, `says it has the employee:\n${reply.content}`).not.toMatch(/Everything I need is here|I have the employee/i);
      expect(reply.content, `does not ask who:\n${reply.content}`).toMatch(ASKS_WHO);
      namesNobodyOffTheCard(reply, employee, ["Zebulon", "Marchbanks"]);
    }),
  },
  {
    id: "nov5-r3-off-roster-names-nobody",
    title: "R3 (off roster): \"create a CA for Zebulon Marchbanks …\", on no roster: the card is empty, asks who, and no reply text names him (\"I can create a CA for …\", \"Name: …\", the Action Plan)",
    report: `${REPORT}: off roster, the reply says "I can create a CA for <A>" / "Name: <B>" while the card is empty`,
    // production-flags.json corrected to Vercel (QA, 5 Nov 2026): GROUNDED_ENTITIES_ENABLED is off in production since 24 Oct (a deliberate rollback), so a name on no roster goes on the card, and the reply names him. Recorded OPEN, a production defect.
    status: { open: "production: GROUNDED_ENTITIES_ENABLED off since 24 Oct (deliberate rollback: dropped non-roster names while ANTI_LOOP off; Vercel comment) — a name on no roster goes on the card, and the reply names him" },
    run: withFlip(async (t) => {
      const { reply, employee } = await said(t, "create a CA for Zebulon Marchbanks, he was 40 minutes late opening the store on 11/2. action plan: Zebulon will be on time for every opening shift");
      expect(employee, "a name on no roster is the employee").toBeNull();
      expect(reply.content, `does not ask who:\n${reply.content}`).toMatch(ASKS_WHO);
      namesNobodyOffTheCard(reply, employee, ["Zebulon", "Marchbanks"]);
    }),
  },
];
