import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "THE MEETING WAS ACTUALLY ON 10-19-26": THE CARD AND THE SAVED FORM TAKE THE CORRECTED DATE (QA, 8 Nov 2026)
 * ============================================================================
 *
 * QA's round-5 trace (8 Nov 2026) of corrective-action-conversation-qa-e2e "Q6 corrections before the draft is
 * created", with production's flags (and with the round-5 gate's ON flags too): "the meeting was actually on 10-19-26"
 * dated the card 10-19, but "sorry, the verbal ca was on 9-2-26 not 9-1-26" then dated it 09-02, the prior step's
 * corrected date, and Create saved 09-02 (`correctedIncidentDate` took the latest correction). In the sibling app the
 * same chat dropped the date instead. CORRECTED_DATE_KEPT_ENABLED (`forms/incident-dates.ts`). The test's chat word for word; the person is
 * invented ("Tess Varga", on no directory).
 */
const TESS: DirectoryRow = {
  id: "e-tess-varga",
  firstName: "Tess",
  lastName: "Varga",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};
const REQUEST = "create a CA for tess varga for not attending the monthly meeting on 10-20-26. previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26";
const FIX = ["CORRECTED_DATE_KEPT_ENABLED"];
const REPORT = "QA's round-5 trace (8 Nov 2026), corrective-action-conversation-qa Q6 with production's flags: the prior step's corrected date became the form's date";

/** The card's date (the replay's card type does not list it). */
const cardDate = (thread: { proposal: unknown }) => (thread.proposal as { formDate?: string | null } | null)?.formDate ?? null;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-21T15:00:00Z"));
  t.directory([...STAFF, TESS]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_CORRECTED_DATE_KEPT_CASES: ReplayCase[] = [
  {
    id: "nov8-corrected-date-kept-q6",
    title: "Q6: \"the meeting was actually on 10-19-26\", then a prior step's correction and \"no payroll deduct\": the card is dated 10-19 on every turn after, and Create saves 10-19",
    report: REPORT,
    status: { open: "the card's date is 2026-09-02 from the prior step's correction on, and Create saves 2026-09-02" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(REQUEST);
      await thread.say("actually make it verbal");
      for (const turn of ["the meeting was actually on 10-19-26", "sorry, the verbal ca was on 9-2-26 not 9-1-26", "no payroll deduct"]) {
        const reply = await thread.say(turn);
        expect(cardDate(thread), `after "${turn}":\n${reply.content}`).toBe("2026-10-19");
      }
      t.draftWrites({ observation: "Observed:\nTess Varga did not attend the monthly meeting on October 19, 2026." });
      const id = await thread.create();
      expect(t.values(id).form_date, "the saved form's Date").toBe("2026-10-19");
    },
  },
  {
    id: "nov8-corrected-date-kept-prior-step-only",
    title: "only the prior step's date is corrected (\"sorry, the verbal ca was on 9-2-26 not 9-1-26\"): the form keeps the meeting's date",
    report: `${REPORT} (the same chat without the incident correction)`,
    status: { open: "the card's date is 2026-09-02" },
    fixFlags: FIX,
    // Open with the flag too, for a different cause (QA, 8 Nov 2026): the intent read writes "It happened on 9/2/2026."
    // in front of this turn, reading the prior step's corrected date as the incident's, and the proposal takes it.
    // CORRECTED_DATE_KEPT only stops a correction from moving the date; it does not touch that line.
    fixStatus: { open: "the intent read's \"It happened on 9/2/2026.\" line dates the card 2026-09-02" },
    async run(t) {
      const thread = start(t);
      await thread.say(REQUEST);
      const reply = await thread.say("sorry, the verbal ca was on 9-2-26 not 9-1-26");
      expect(cardDate(thread), `the prior step's date became the form's:\n${reply.content}`).not.toBe("2026-09-02");
    },
  },
  {
    id: "nov8-corrected-date-kept-two-incidents",
    title: "negative: two incidents and no correction (\"… late on 10/19 and again on 10/20\"): the flag changes nothing",
    report: `${REPORT} (the condition: only a correction settles the date)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("create a CA for tess varga, she was late on 10/19/26 and again on 10/20/26");
      expect(cardDate(thread), `a date was chosen without a correction:\n${reply.content}`).not.toBe("2026-10-19");
    },
  },
];
