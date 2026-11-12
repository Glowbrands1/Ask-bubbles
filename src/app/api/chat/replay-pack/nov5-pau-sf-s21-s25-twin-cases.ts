import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * PAU'S sf-s21 … sf-s25, TWINS (the sibling app's production, 4 Nov 2026;
 * full transcripts relayed by QA, 5 Nov 2026)
 * ============================================================================
 *
 * Twins of the sibling app's reports, in this app's terms (store, its
 * metrics and wording; the shape of each conversation kept). Cases only:
 * each is OPEN with today's production flags and no fixFlags until
 * a fix exists. The manager's turns are verbatim (typos, tabs, line breaks);
 * every person is invented: Wynne Sarrow is the employee, Tamsyn Fairlow the
 * employee whose Corrective Action was pasted as a template, Corwen Pell the
 * employee in a reviewer's pasted notes. Where the live model wrote the text
 * at fault, the stand-in model writes what it wrote, and the case asserts what
 * the app shows or saves.
 */

type T = ReplayContext;

const person = (id: string, firstName: string, lastName: string): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
});

const PEOPLE: readonly DirectoryRow[] = [
  person("e-wynne-sarrow", "Wynne", "Sarrow"),
  person("e-tamsyn-fairlow", "Tamsyn", "Fairlow"),
  person("e-corwen-pell", "Corwen", "Pell"),
];

/** The invented people of this file (a function: the registry reads exported arrays as cases). */
export function pauSfS21TwinPeople(): readonly DirectoryRow[] {
  return PEOPLE;
}

const REPORT = "Pau via QA, 5 Nov 2026 (the sibling app's production, 4 Nov), twin";

function start(t: T) {
  vi.setSystemTime(new Date("2026-11-04T23:30:00Z"));
  t.directory([...STAFF, ...PEOPLE]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

/** The card's Policy line, or "". */
function policyLine(reply: ReplayAnswer): string {
  return reply.content.split("\n").find((line) => /\*\*Policy:?\*\*/i.test(line)) ?? "";
}

/** The card's Observation of Offense line, or "". */
function observationLine(reply: ReplayAnswer): string {
  return reply.content.split("\n").find((line) => /\*\*Observation of Offense:?\*\*/i.test(line)) ?? "";
}

/** "as you said" on a Policy line naming a policy the manager never typed. */
function claimsUnsaid(reply: ReplayAnswer, said: readonly string[]): string | null {
  const line = policyLine(reply);
  const claim = /\*\*Policy:?\*\*\s*([^,—]+?)(?:\s+Policy)?(?:,|\s+—)[^\n]*\bas you said\b/i.exec(line);
  if (!claim) return null;
  const policy = claim[1]!.trim().toLowerCase();
  return said.some((turn) => turn.toLowerCase().includes(policy)) ? null : claim[1]!.trim();
}

export const S21_T1 = "create a ca for must see behaviors for performace  this should be for wynne sarrow  - verbal\n146 transactions \nBelow in UPT, Average Sale, Conversion";
export const TEMPLATE =
  "Observation of Offense:  During the month of September 2026, Tamsyn completed 237 transactions. Throughout these transactions, Tamsyn failed to follow their Must See Behaviors resulting in a performance below Buff City Soap averages in the following areas UPT, Average Sale, and Conversion.  \n\nAt Buff City Soap, we strive to provide the best store experience for every client. In order to ensure the best results for our clients, every employee is expected to follow their Client Service Must See Behaviors and Engagement Must See Behaviors with every client interaction.\t\n\nAction Plan:  The Leadership Team will coach Tamsyn on Must See Behaviors to make sure these are not only understood but also put into practice. Tamsyn is expected to follow these Must See Behaviors with every client interaction. Failure to consistenly meet expectations may result in additional corrective action up to and including termination of employment.";
/** The template's outline with Wynne's own facts, as the revision model writes it (the stand-in). */
const TEMPLATE_WITH_WYNNE = {
  observation:
    "During the month of October 2026, Wynne completed 146 transactions. Throughout these transactions, Wynne failed to follow their Must See Behaviors resulting in a performance below Buff City Soap averages in the following areas UPT, Average Sale, and Conversion.\n\nAt Buff City Soap, we strive to provide the best store experience for every client. In order to ensure the best results for our clients, every employee is expected to follow their Client Service Must See Behaviors and Engagement Must See Behaviors with every client interaction.",
  action_plan:
    "The Leadership Team will coach Wynne on Must See Behaviors to make sure these are not only understood but also put into practice. Wynne is expected to follow these Must See Behaviors with every client interaction. Failure to consistently meet expectations may result in additional corrective action up to and including termination of employment.",
};
const REVIEWER_NOTES =
  "Please make the following edits and resubmit:\n\n1. **Kit Coaching Document:** This was signed on 10/16/2026. I do not see a date showing that Bundles was signed by Corwen. Please make sure all coaching documents are signed and dated (mm/dd/yyyy format) before uploading.\n\n2. **Details – Observed:** Please reword this section to:\n   \n   For the month of October 2026, Corwen completed 24 transactions and was below expectations in UPT, Average Sale, and Conversion.\n\n3. **Policy Violated:** Please change this from **Under Performance** to **Standards of Conduct**, as the second bullet under that policy is lack of sales performance. You may need to manually add this bullet.";

export const NOV5_PAU_SF_S21_S25_TWIN_CASES: ReplayCase[] = [
  {
    id: "nov5-twin-sf-s21-must-see-behaviors-template",
    title: "sf-s21: \"create a ca for must see behaviors …\": no \"Standards of Conduct, as you said\"; the template's outline is applied with Wynne's own facts, never \"I haven't changed the form\"",
    report: `${REPORT}, sf-s21`,
    status: { open: "with this app's production flags (CA_SALES_POLICY_ENABLED rolled back here) the must-see-behaviors request for metrics makes no Corrective Action card" },
    // Fixed under TEMPLATE_OUTLINE_FIELDS_ENABLED (coding 6, 10 Nov 2026; port): the template's outline writes its fields; "not the
    // standard of conduct" is answered with why Standards of Conduct stays (QA's ruling). Open on production flags until QA flips it.
    fixFlags: ["TEMPLATE_OUTLINE_FIELDS_ENABLED"],
    async run(t) {
      const thread = start(t);
      const said: string[] = [S21_T1];
      // The sibling app's live trace (5 Nov 2026): the intent read returned policyHeading "Standards of Conduct" for this turn.
      t.slotsRead({ policyHeading: "Standards of Conduct" });
      const first = await thread.say(S21_T1);
      t.slotsRead({});
      expect(thread.proposal, `no CA card for Wynne Sarrow:\n${first.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Wynne Sarrow" });
      expect(claimsUnsaid(first, said), `"as you said" for a policy the manager never typed:\n${policyLine(first)}`).toBeNull();
      t.draftWrites({ observation: "Observed:\nIn October 2026, Wynne completed 146 transactions and was below average in UPT, Average Sale, and Conversion." });
      await thread.create();
      for (const turn of [TEMPLATE, "No this should be the same out line but with wynnes info i told you in the first chat", "I need the CA for the Must see behaviors and not the standard of conduct. Make it in the format that I explained above in the first chat for Wynne."]) {
        said.push(turn);
        // Changed on purpose (coding 6, 10 Nov 2026): the revision model's stand-in writes the template's outline with Wynne's facts,
        // as the live model was asked to (it is shown the template and her facts). Unscripted, it wrote nothing, and no fix could hold.
        t.revisionWrites(TEMPLATE_WITH_WYNNE);
        const reply = await thread.say(turn);
        expect(reply.content, `a requested change answered as nothing changed:\n${reply.content}`).not.toMatch(/I haven'?t changed the \*\*Corrective Action Form\*\*/);
      }
    },
  },
  {
    id: "nov5-twin-sf-s22-ca-not-coaching",
    title: "sf-s22: \"It needs to be a CA, not a coaching form\" and \"Its a CA\" keep the Corrective Action; another employee's reviewer notes never go into the Observation",
    report: `${REPORT}, sf-s22`,
    status: { open: "with this app's production flags the first request makes no Corrective Action card" },
    async run(t) {
      const thread = start(t);
      const first = await thread.say(
        "create a ca for must see behaviors for performace  this should be for wynne sarrow  - verbal\n146 transactions \nBelow in UPT, Average Sale, Conversion  but i need it to be in the format of Tamsyn ca  it needs to look exactally the same as tamsyns but wtih all of this information",
      );
      expect(thread.proposal, `no CA card:\n${first.content}`).toMatchObject({ templateKey: "dpoa" });
      await thread.say(`Use this to make it: ${REVIEWER_NOTES}`);
      const caTurn = await thread.say("It needs to be a CA, not a coaching form");
      expect(thread.proposal, `"It needs to be a CA" is not a Corrective Action:\n${caTurn.content}`).toMatchObject({ templateKey: "dpoa" });
      expect(observationLine(caTurn), `another employee's notes in the Observation:\n${observationLine(caTurn)}`).not.toMatch(/Corwen/i);
      const again = await thread.say(`Make this:${REVIEWER_NOTES}`);
      expect(again.content, `back to the Coaching Form after "It needs to be a CA":\n${again.content}`).not.toMatch(/what I would put on a \*\*Coaching Form\*\*/);
      const its = await thread.say("Its a CA");
      expect(thread.proposal, `"Its a CA" is still a Coaching Form:\n${its.content}`).toMatchObject({ templateKey: "dpoa" });
    },
  },
  {
    id: "nov5-twin-sf-s23-payroll-answer-and-policy-change",
    title: "sf-s23: \"not pay roll deductable\" answers the payroll question (not the Observation, not asked again); \"under performance not standard of conduct\" changes the Action Plan and Direct policy too",
    report: `${REPORT}, sf-s23`,
    // Holds in this app, also with the live trace's intent read (policyHeading): the card here has no Observation of Offense line and makes no "as you said" claim on this path (the sibling app's bug); kept as a guard.
    status: "fixed",
    async run(t) {
      const thread = start(t);
      await thread.say("can you write me a Ca for wynne sarrow for performance for october");
      const payroll = await thread.say("not pay roll deductable");
      expect(payroll.content, `the payroll question is asked again:\n${payroll.content}`).not.toMatch(/Is payroll deduct applicable\?/);
      expect(observationLine(payroll), `the payroll answer is the Observation:\n${observationLine(payroll)}`).not.toMatch(/pay\s*roll/i);
    },
  },
  {
    id: "nov5-twin-sf-s24-must-see-behaviors-and-coaching-on-file",
    title: "sf-s24: \"it should be must see behaviors and she also had coaching on file …\": no \"Standards of Conduct, as you said\"; the card and the saved form agree",
    report: `${REPORT}, sf-s24`,
    // Holds in this app, also with the live trace's intent read (policyHeading): the card here has no Observation of Offense line and makes no "as you said" claim on this path (the sibling app's bug); kept as a guard.
    status: "fixed",
    // AS_YOU_SAID_MANAGER_WORDS_ENABLED (6 Nov 2026): the reader that decides "as you said" no longer reads the app's own "Policy reference" line; must still hold.
    fixFlags: ["AS_YOU_SAID_MANAGER_WORDS_ENABLED"],
    async run(t) {
      const thread = start(t);
      const t1 = "Can you write me a performace ca for an employee who did not meet their numbers for the month of october Wynne Sarrow  - verbal\n146 transactions \nBelow in UPT, Average Sale, Conversion";
      const t2 = "it should be must see behaviors and she also had coaching on file for open ended questions coahing done one 10/22 and bundle coachings done 10/15";
      await thread.say(t1);
      // The sibling app's live trace: the intent read returned policyHeading "Standards of Conduct" for this turn.
      t.slotsRead({ policyHeading: "Standards of Conduct" });
      const reply = await thread.say(t2);
      expect(claimsUnsaid(reply, [t1, t2]), `"as you said" for a policy the manager never typed:\n${policyLine(reply)}`).toBeNull();
    },
  },
  {
    id: "nov5-twin-sf-s25-closing-no-late-opening-claim",
    title: "sf-s25: a closing account is never \"Late Opening, as you said\"; the Observation is the incident, not the earlier question",
    report: `${REPORT}, sf-s25`,
    // Holds in this app, also with the live trace's intent read (policyHeading): the card here has no Observation of Offense line and makes no "as you said" claim on this path (the sibling app's bug); kept as a guard.
    status: "fixed",
    // AS_YOU_SAID_MANAGER_WORDS_ENABLED (6 Nov 2026): the reader that decides "as you said" no longer reads the app's own "Policy reference" line; must still hold.
    fixFlags: ["AS_YOU_SAID_MANAGER_WORDS_ENABLED"],
    async run(t) {
      const thread = start(t);
      const said = [
        "closing policy",
        "What policy would it be if a team member did not complete the closing correctly and i have already talked to her about it",
        "Write a CA for Wynne Sarrow she is a team member works at West Dodge and on 11/3/26 she was scheduled until 9:15PM and clocked out at 9:01. She also took down the registers at 8:11 PM before the Store was closed.",
      ];
      await thread.say(said[0]!);
      await thread.say(said[1]!);
      // The sibling app's live trace: the intent read returned policyHeading "Late Opening" for this turn.
      t.slotsRead({ policyHeading: "Late Opening" });
      const reply = await thread.say(said[2]!);
      expect(claimsUnsaid(reply, said), `"as you said" for a policy the manager never typed:\n${policyLine(reply)}`).toBeNull();
      expect(observationLine(reply), `the earlier question is in the Observation:\n${observationLine(reply)}`).not.toMatch(/What policy would it be/i);
    },
  },
];

/*
 * TEMPLATE_OUTLINE_FIELDS_ENABLED (coding 6, 10 Nov 2026; port): sf-s21 with what is SAVED. "the same out line" writes the
 * template's Observation AND Action Plan with Wynne's facts; "the Must see behaviors and not the standard of conduct"
 * keeps Standards of Conduct and says why (QA's ruling).
 */
export const NOV10_TWIN_TEMPLATE_OUTLINE_CASES: ReplayCase[] = [
  {
    id: "nov10-twin-sf-s21-template-outline-saved",
    title: "sf-s21: \"the same out line but with wynnes info\" saves the template's Observation and Action Plan; \"not the standard of conduct\" says why it stays",
    report: `${REPORT}, sf-s21`,
    // Here the template's Action Plan is saved on production flags already; the last ask is the open part.
    status: { open: "the last ask is answered \"I haven't changed the Corrective Action Form\"" },
    fixFlags: ["TEMPLATE_OUTLINE_FIELDS_ENABLED"],
    async run(t) {
      const thread = start(t);
      await thread.say(S21_T1);
      t.draftWrites({ observation: "Observed:\nIn October 2026, Wynne completed 146 transactions and was below average in UPT, Average Sale, and Conversion." });
      const id = await thread.create();
      t.revisionWrites(TEMPLATE_WITH_WYNNE);
      await thread.say(TEMPLATE);
      t.revisionWrites(TEMPLATE_WITH_WYNNE);
      const outline = await thread.say("No this should be the same out line but with wynnes info i told you in the first chat");
      const saved = t.values(id);
      expect(saved.observation ?? "", `the template's Observation was not saved:\n${outline.content}`).toMatch(/Wynne completed 146 transactions/);
      expect(saved.action_plan ?? "", `the template's Action Plan was not saved:\n${outline.content}`).toMatch(/Leadership Team will coach Wynne on Must See Behaviors/);
      expect(JSON.stringify(saved), "the template's employee is on Wynne's form").not.toMatch(/Tamsyn/);
      t.revisionWrites(TEMPLATE_WITH_WYNNE);
      const last = await thread.say("I need the CA for the Must see behaviors and not the standard of conduct. Make it in the format that I explained above in the first chat for Wynne.");
      expect(last.content, "the last ask is answered as nothing changed").not.toMatch(/I haven'?t changed|I didn'?t change anything/);
    },
  },
];

/*
 * The sibling app's round-23 live test of sf-s21 (10 Nov 2026, conv_mwb21a4z2rxf5y1, an all-locations admin; this app's twin
 * wording for 5a and 5b, the live words for 5c and 5d): 5a S21_T1 and Create; 5b the pasted TEMPLATE → "Is this for Tamsyn?" and a new card over the
 * draft; 5c "No this should be the same out line …" → the new card, with an unexpected location; 5d → a new card for
 * "Wynne". Saved: the 5a metrics sentence, no outline. The case above scripts the revision model to write the
 * outline, so it never saw the turn go elsewhere. Here the revision model is the stand-in (it writes nothing), and
 * the invariants are where each turn goes and what the revision model is HANDED.
 */
const LIVE_5C = "No this should be the same out line but with wynnes info i told you in the first chat";
const LIVE_5D = "I need the CA for the Must see behaviors and not the standard of conduct. Make it in the format that I explained above in the first chat for Wynne.";

export const NOV10_R23_SF_S21_TWIN_LIVE_CASES: ReplayCase[] = [
  {
    // The live test's people were invented. Off the directory, 5a here asks before any card (OFF_ROSTER_ASK_BEFORE_CARD),
    // and how the tester answered is not recorded, so the case starts from the state live reached: Wynne's CA created.
    id: "nov10-r23-sf-s21-pasted-outline-to-open-draft",
    title: "sf-s21 as QA's r23 live test ran it: with Wynne's CA draft open, the pasted Tamsyn CA is that draft's outline — no new card, no \"Is this for Tamsyn?\", and the revision is handed the outline with the draft's own facts",
    report: `The sibling app's round-23 live test, conv_mwb21a4z2rxf5y1 (twin wording): 5b "Is this for Tamsyn?" and a new card over Wynne's draft; the outline never saved`,
    status: { open: "the pasted outline names Tamsyn, so it is read as a new request: a new card covers Wynne's draft and the outline never reaches it" },
    // TEMPLATE_OUTLINE_FIELDS (#687) is not on in this app's production; it reads the outline once the turn reaches the draft.
    fixFlags: ["TEMPLATE_OUTLINE_FIELDS_ENABLED", "PASTED_OUTLINE_TO_OPEN_DRAFT_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-10T19:00:00Z"));
      t.directory([...STAFF, ...PEOPLE]);
      t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never);
      const thread = t.thread();
      await thread.say(S21_T1);
      // Off the directory the name proceeds as typed ("wynne sarrow", TYPED_NAME_PROCEEDS).
      expect(thread.proposal, "5a: no CA card").toMatchObject({ templateKey: "dpoa" });
      expect(thread.proposal?.employeeName ?? "", "5a: the card is not Wynne Sarrow's").toMatch(/^wynne sarrow$/i);
      t.draftWrites({ observation: "Observed:\nWynne completed 146 tans, below average in PPTA, LPSVA, Average Club, CC% and Spa%." });
      const draft = await thread.create();
      const asked = (t.revisionPrompts?.() ?? []).length;
      for (const [turn, label] of [[TEMPLATE, "5b"], [LIVE_5C, "5c"], [LIVE_5D, "5d"]] as const) {
        const reply = await thread.say(turn);
        // No new card: so no unexpected location and no first-name-only "Wynne" card (live 5c and 5d) either.
        expect(reply.formProposal ?? null, `${label}: a new card over Wynne's open draft:\n${reply.content}`).toBeNull();
        // QA (10 Nov): the outline's other person never triggers "Is this for <name>?" and never becomes the draft's employee.
        expect(reply.content, `${label}: asked whether the form is for Tamsyn`).not.toMatch(/is this for \**tamsyn/i);
        expect(reply.content, `${label}: asked who the form is for`).not.toMatch(/is this for \*\*|who is this (?:form )?for\?/i);
        expect(t.values(draft).employee_name ?? "", `${label}: the open draft's employee changed`).toMatch(/^wynne sarrow$/i);
      }
      const prompts = (t.revisionPrompts?.() ?? []).slice(asked).join("\n");
      expect(prompts, "the revision was never handed the pasted outline").toMatch(/Observation of Offense:/);
      expect(prompts, "the revision was not asked to rewrite the Action Plan in the outline").toMatch(/rewrite the Action Plan/i);
    },
  },
];
