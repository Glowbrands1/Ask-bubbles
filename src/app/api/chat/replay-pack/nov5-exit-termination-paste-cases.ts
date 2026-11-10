import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A TERMINATION LETTER PASTED FOR AN EXIT FORM: NO INVENTED FACTS (QA, 5 Nov 2026, severe)
 * ============================================================================
 *
 * Ported from the sibling app (QA, 5 Nov 2026, severe, its production). There a manager pasted a termination letter (meeting "tomorrow 11/06", keys to return "today 11/06",
 * terminated "effective 11/06/2026") and asked for an exit form. The card said How Employee Resigned "Text
 * message" (the text that caused the termination), Key Returned "returned" (an instruction to
 * return them), and Last Day Worked "November 5, 2026" (the final paycheck's "all hours worked through
 * 11/05/2026"). Here the card's Job Title comes from Woven ("Team Member"). EXIT_STATED_ONLY_ENABLED: an Exit field only from what the manager said happened. The manager's
 * words; every person invented (checked against both apps' directories).
 */
const DORRAN: DirectoryRow = {
  id: "e-dorran-ashby",
  firstName: "Dorran",
  lastName: "Ashby",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

const LETTER = [
  "Meeting with Dorran tomorrow 11/06 at 7:30am ",
  "",
  "    This decision follows the text message you sent to your General Manager on 11/05, in which you said that if you were asked to clean up a toilet overflow, you would turn in your keys.",
  "    Cleaning up this kind of incident is part of the job. We covered it in our recent safety training, including the correct PPE and cleanup steps.",
  "    The tone of the message was also disrespectful to your General Manager, Philippa.",
  "    We expect every team member to treat our General Managers with respect, and we are not able to continue working with you.",
  "",
  "",
  "This meeting confirms that your employment is terminated, effective 11/06/2026.",
  "",
  "Please return your store keys and any other company property today 11/06. Your final paycheck, including all hours worked through 11/05/2026, will be issued on 11/27/2026.",
].join("\n");

const INVENTED = [
  [/\*\*How Employee Resigned:\*\*\s*Text message/i, "How Employee Resigned: Text message"],
  [/\*\*Store Key Returned:\*\*\s*Store key was returned/i, "Store Key Returned: returned"],
  [/\*\*Last Day Worked:\*\*\s*November 5, 2026/i, "Last Day Worked: November 5"],
  // The General Manager is the letter's other person ("your General Manager, Philippa"); the employee is a Team Member on Woven.
  [/\*\*Job Title:\*\*\s*General Manager/i, "Job Title: General Manager"],
] as const;

export const NOV5_EXIT_TERMINATION_PASTE_CASES: ReplayCase[] = [
  {
    id: "nov5-exit-termination-paste-no-invented-facts",
    title: "a termination letter, then \"I need an exit form with this information. …\", then \"For Dorran Ashby\": the exit card never says the employee resigned by text, returned the key, or last worked on 11/05",
    report: "QA, 5 Nov 2026 (severe, the sibling app's production): an Exit card from a termination paste with invented facts",
    // Fixed by flip 3 (6 Nov 2026): production now runs the name set + OFF_ROSTER_CONFIRM (docs/flag-classification/FLIP3D.md).
    status: "fixed",
    fixFlags: ["EXIT_STATED_ONLY_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-05T20:28:00Z"));
      t.directory([...STAFF, DORRAN]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(LETTER);
      await thread.say(`I need an exit form with this information. ${LETTER}`);
      const reply = await thread.say("For Dorran Ashby");
      for (const [pattern, what] of INVENTED) expect(reply.content, `the card states "${what}", which the manager never said happened:\n${reply.content}`).not.toMatch(pattern);
    },
  },
];
