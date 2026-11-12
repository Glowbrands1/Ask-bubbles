import { expect } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A TYPED DATE STAYS THE FORM'S DATE; A ONE-WORD ANSWER IS NEVER THE JOB TITLE (the live replays of 24 Oct 2026;
 * PR #92 rebuilt on main in QA's stale-PR cleanup, 11 Nov 2026; FORM_INPUT_FIDELITY_ENABLED)
 * ============================================================================
 *
 * The reporter's wording ("Oct 20", "10/20", "yesterday", "verbal", "written", "yes"), the person invented (Tamsin
 * Orrell, on this store's directory with no position in Woven, so the card asks for the job title). Reported: a
 * draft dated today when the manager typed "yesterday", and a bare "verbal" / "written" / "yes" / "yesterday" after
 * the card's question saved as the Job Title.
 */
const TAMSIN: DirectoryRow = {
  id: "e-fi-tamsin-orrell",
  firstName: "Tamsin",
  lastName: "Orrell",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: null,
};

/** The invented person of this file (a function: the registry reads exported arrays as cases). */
export function formInputFidelityPeople(): readonly DirectoryRow[] {
  return [TAMSIN];
}

/** The harness's today is 2026-10-26, so "yesterday" is 2026-10-25. */
const YESTERDAY = "2026-10-25";

/*
 * Checked on main with production's flags, 11 Nov 2026: every typed date already dates the card, and a bare "verbal",
 * "written" or "yes" is already read as the warning or the payroll answer, never the Job Title (those cases are fixed).
 * A bare "yesterday" after the position question is still saved as Job Title "Yesterday": open.
 */
function dateCase(slug: string, said: string, date: string, templateKey: string): ReplayCase {
  return {
    id: `nov11-form-input-fidelity-date-${slug}`,
    title: `"${said}": the card is dated ${date}`,
    report: `PR #92 (live replays, 24 Oct 2026): a typed incident day ("Oct 20", "10/20", "yesterday") did not stay the form's date; "${said}"`,
    status: "fixed",
    async run(t) {
      t.directory([...STAFF, TAMSIN]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(said, { employeeName: "Tamsin Orrell" });
      expect(thread.proposal, `no card:\n${reply.content}`).toMatchObject({ templateKey });
      expect(thread.proposal?.formDate ?? null, `the card's date:\n${reply.content}`).toBe(date);
    },
  };
}

function titleCase(answer: string, open: boolean): ReplayCase {
  return {
    id: `nov11-form-input-fidelity-title-${answer}`,
    title: `a Corrective Action card asking the warning, payroll and job title, then a bare "${answer}": never the Job Title`,
    report: `PR #92 (live replays, 24 Oct 2026): a bare "${answer}" after the card's questions was saved as the Job Title`,
    ...(open
      ? { status: { open: `the card's job title is "${answer[0]!.toUpperCase()}${answer.slice(1)}"` }, fixFlags: ["FORM_INPUT_FIDELITY_ENABLED"] }
      : { status: "fixed" as const }),
    async run(t) {
      t.directory([...STAFF, TAMSIN]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const first = await thread.say("create a corrective action for Tamsin Orrell. She was late on Oct 20.", { employeeName: "Tamsin Orrell" });
      expect(thread.proposal, `no Corrective Action card:\n${first.content}`).toMatchObject({ templateKey: "dpoa" });
      const reply = await thread.say(answer);
      const role = thread.proposal?.employeeRole ?? "";
      expect(role.toLowerCase(), `"${answer}" became the job title:\n${reply.content}`).not.toBe(answer.toLowerCase());
      expect(reply.content, `the card shows "${answer}" as the position:\n${reply.content}`).not.toMatch(new RegExp(String.raw`\*\*Position:\*\*\s*${answer}\b`, "i"));
    },
  };
}

export const NOV11_FORM_INPUT_FIDELITY_CASES: ReplayCase[] = [
  dateCase("ca-oct-20", "create a corrective action for Tamsin Orrell. She was late on Oct 20.", "2026-10-20", "dpoa"),
  dateCase("ca-10-20", "create a corrective action for Tamsin Orrell. She was late on 10/20.", "2026-10-20", "dpoa"),
  dateCase("ca-yesterday", "create a corrective action for Tamsin Orrell. She was late yesterday.", YESTERDAY, "dpoa"),
  dateCase("coaching-10-20", "create a coaching form for Tamsin Orrell. She was late on 10/20.", "2026-10-20", "coaching"),
  dateCase("coaching-yesterday", "create a coaching form for Tamsin Orrell. She was late yesterday.", YESTERDAY, "coaching"),
  titleCase("verbal", false),
  titleCase("written", false),
  titleCase("yes", false),
  titleCase("yesterday", true),
];
