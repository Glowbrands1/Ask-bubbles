import { expect, vi } from "vitest";

import { ACTIVE_BRAND } from "@/lib/brand";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE COMPANY'S OWN NAME IS NEVER A PERSON (port of the sibling app's QA finding,
 * 7 Nov 2026; FORM_NAME_FROM_ROSTER_ENABLED)
 * ============================================================================
 *
 * There, with the name flags on, a termination letter's "… and it is a requirement for <the company's initials>."
 * made the exit reply say "I couldn't find **<initials>** in the Woven roster" — the company's own abbreviation said
 * back as a person not found. The company's names and their initials (from the brand config, `lib/brand`) are never a
 * person: no not-found note, no offer. The letter is this app's original case's, with that sentence's ending; the
 * initials are read from the brand config. Every person is invented.
 */
const INITIALS = ACTIVE_BRAND.brandName.split(/\s+/).map((word) => word[0]).join("");

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
  `    Cleaning up this kind of incident is part of the job. We covered it in our recent safety training, including the correct PPE and cleanup steps, and it is a requirement for ${INITIALS}.`,
  "    The tone of the message was also disrespectful to your General Manager, Philippa.",
  "    We expect every team member to treat our General Managers with respect, and we are not able to continue working with you.",
  "",
  "",
  "This meeting confirms that your employment is terminated, effective 11/06/2026.",
  "",
  "Please return your store keys and any other company property today 11/06. Your final paycheck, including all hours worked through 11/05/2026, will be issued on 11/27/2026.",
].join("\n");

const NAME_SET = [
  "FORM_NAME_FROM_ROSTER_ENABLED",
  "ROSTER_NEAR_MISS_ENABLED",
  "ROSTER_NAME_IN_CANDIDATE_ENABLED",
  "ROSTER_COMPOUND_SURNAME_ENABLED",
  "ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED",
  "OFF_ROSTER_CONFIRM_ENABLED",
  // Changed on purpose (QA's roster-set gate R16A, 10 Nov 2026): the set ships with FORM_NAME_OFF_ROSTER_ASK, whose rule keeps
  // "- **Name:** The employee" off an emptied exit card.
  "FORM_NAME_OFF_ROSTER_ASK_ENABLED",
];

/** The company's own name, or its initials, said back or offered as a person. */
function namesTheCompany(content: string): string | null {
  for (const name of [ACTIVE_BRAND.brandName, INITIALS]) {
    if (content.includes(`couldn't find **${name}**`) || content.includes(`reply **use ${name}**`) || content.includes(`Is this for **${name}**?`)) return name;
  }
  return null;
}

export const NOV7_BRAND_NOT_A_PERSON_CASES: ReplayCase[] = [
  {
    id: "nov7-brand-not-a-person-termination-letter",
    title: "a termination letter (\"… it is a requirement for <the company's initials>.\"), then \"I need an exit form with this information. …\": the company's abbreviation is never said back as a person not found",
    report: "The sibling app's QA finding (7 Nov 2026, name flags on): the company's initials said back as a person not in the Woven roster",
    status: "fixed",
    fixFlags: [...NAME_SET, "EXIT_STATED_ONLY_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-05T20:28:00Z"));
      t.directory([...STAFF, DORRAN]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      for (const turn of [LETTER, `I need an exit form with this information. ${LETTER}`]) {
        const reply = await thread.say(turn);
        expect(namesTheCompany(reply.content), `the company is said back as a person:\n${reply.content}`).toBeNull();
        // QA's roster-set gate R16A (10 Nov 2026): with FORM_NAME_FROM_ROSTER on the exit card read "- **Name:** The employee".
        expect(reply.content, `the card's Name is "The employee":\n${reply.content}`).not.toMatch(/\*\*Name:\*\*\s*The employee/i);
      }
    },
  },
];
