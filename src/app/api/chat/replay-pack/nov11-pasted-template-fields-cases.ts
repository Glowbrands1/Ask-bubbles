import { expect, vi } from "vitest";

import { STAFF, type ReplayCase } from "./cases";
import { PEOPLE, S21_T1, TEMPLATE } from "./nov5-pau-sf-s21-s25-twin-cases";

/**
 * ============================================================================
 * A PASTED TEMPLATE FILLS THE OPEN DRAFT'S FIELDS (ported from the sibling app; its round-25 live test, 11 Nov 2026)
 * ============================================================================
 *
 * sf-s21's 5b (twin wording) with PASTED_OUTLINE_TO_OPEN_DRAFT on: with Wynne's Corrective Action draft open, the
 * manager pasted Tamsyn's CA as a template ("Observation of Offense: … Action Plan: …"). In the sibling app's round-25
 * live test the turn stayed on the draft but nothing was saved: "Nothing on the form has changed yet. I couldn't place
 * that on the open Corrective Action Form…". PASTED_TEMPLATE_FIELDS_TO_OPEN_DRAFT_ENABLED: the template's labelled
 * sections fill the open draft's fields, and the template's person is never a person switch. Every person invented.
 */
const FLAG = "PASTED_TEMPLATE_FIELDS_TO_OPEN_DRAFT_ENABLED";
/** The step outline the sibling app's round-25 5c pasted: three lines, with real line breaks. */
const STEPS = "Step 1 - 10/6/26 - Verbal reminder about arriving on time.\nStep 2 - 10/20/26 - Follow-up talk; she said she would leave earlier.\nStep 3 - 11/3/26 - Written follow-up sent.";
const NOTHING_SAVED = /Nothing on the form has changed yet\.\*?\*? I couldn't place that on the open Corrective Action Form/;

export const NOV11_PASTED_TEMPLATE_FIELDS_CASES: ReplayCase[] = [
  {
    // As the twin's r23 case: Wynne is off this app's directory, so the case starts from the state live reached.
    id: "nov11-r25-sf-s21-pasted-template-fills-open-draft",
    title: "sf-s21 5b (twin): the pasted Tamsyn template fills Wynne's open draft's Observation and Action Plan, in Wynne's name",
    report: `The sibling app's round-25 live test (11 Nov 2026), twin wording: 5b "Nothing on the form has changed yet. I couldn't place that on the open Corrective Action Form…"`,
    status: { open: "the pasted outline is read as a new request (PASTED_OUTLINE_TO_OPEN_DRAFT is not on here), so the open draft is unchanged" },
    // TEMPLATE_OUTLINE_FIELDS and PASTED_OUTLINE_TO_OPEN_DRAFT (#728) are not on in this app's production; this flag builds on them.
    fixFlags: ["TEMPLATE_OUTLINE_FIELDS_ENABLED", "PASTED_OUTLINE_TO_OPEN_DRAFT_ENABLED", FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-11T03:30:00Z"));
      t.directory([...STAFF, ...PEOPLE]);
      t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never);
      const thread = t.thread();
      await thread.say(S21_T1);
      expect(thread.proposal, "no CA card").toMatchObject({ templateKey: "dpoa" });
      t.draftWrites({ observation: "Observed:\nWynne completed 146 transactions, below average in UPT, Average Sale and Conversion." });
      const id = await thread.create();
      // The live failure: the revision writes nothing for the pasted template (the stand-in writes nothing by default).
      const reply = await thread.say(TEMPLATE);
      expect(reply.formProposal ?? null, `a new card over Wynne's open draft:\n${reply.content}`).toBeNull();
      expect(reply.content, `asked whether the form is for Tamsyn:\n${reply.content}`).not.toMatch(/is this for \**tamsyn/i);
      expect(reply.content, `nothing was saved:\n${reply.content}`).not.toMatch(NOTHING_SAVED);
      const saved = t.values(id);
      expect(saved.observation ?? "", "the template's Observation is not on Wynne's draft").toMatch(/Must See Behaviors/);
      expect(saved.action_plan ?? "", "the template's Action Plan is not on Wynne's draft").toMatch(/Must See Behaviors/);
      expect(JSON.stringify(saved), "the template's person is on Wynne's form").not.toMatch(/Tamsyn/);
      expect(saved.employee_name ?? "", "the draft's employee changed").toMatch(/^wynne sarrow$/i);
    },
  },
  {
    id: "nov11-r25-5c-pasted-steps-keep-line-breaks",
    title: "round-25 5c (twin): three pasted step lines saved to Prior Actions keep their line breaks",
    report: `The sibling app's round-25 live test (11 Nov 2026), 5c: the pasted step outline was saved to prior_actions on one line, single-spaced`,
    status: { open: "the revision's one-line value is saved as it came" },
    fixFlags: ["TEMPLATE_OUTLINE_FIELDS_ENABLED", "PASTED_OUTLINE_TO_OPEN_DRAFT_ENABLED", FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-11T03:30:00Z"));
      t.directory([...STAFF, ...PEOPLE]);
      t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never);
      const thread = t.thread();
      await thread.say(S21_T1);
      t.draftWrites({ observation: "Observed:\nWynne completed 146 transactions, below average in UPT, Average Sale and Conversion." });
      const id = await thread.create();
      // The live revision's value: the three pasted lines on one line, single-spaced.
      t.revisionWrites({ prior_actions: STEPS.split("\n").join(" ") });
      await thread.say(STEPS);
      expect(t.values(id).prior_actions, "the pasted steps lost their line breaks").toBe(STEPS);
    },
  },
];
