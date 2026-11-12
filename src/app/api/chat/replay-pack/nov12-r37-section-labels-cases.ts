import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { REFUSAL_ROSTER, patch } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * LABELS STAY ON THEIR OWN LINES, AND POLICY REFERENCE KEEPS ITS BLANK LINE (QA's r37 live check in the sibling app,
 * 12 Nov 2026; ported; STEP_B_SECTION_SPACING_ENABLED, on in production here)
 * ============================================================================
 *
 * On coaching Details "Observed:\n…\n\nExpectation:\n…\n\nPolicy reference: …", the turn "make that update: he also
 * ignored a second client" saved the labels pulled onto the text line and no blank line before "Policy reference:".
 * The reader writes the field back in that shape, as live there. The person is invented.
 */
const REQUEST = "create a coaching form for Ottoline Ormsworth, on 11/9 she was rude to a guest";
const DETAILS =
  "Observed:\nOn 11/9, Ottoline Ormsworth was rude to a guest.\n\nExpectation:\nOttoline Ormsworth is expected to greet every guest politely.\n\nPolicy reference: Standards of Conduct, JBA Policy Manual p.12";
const SAID = "make that update: he also ignored a second client";
const WRITTEN =
  "Observed: On 11/9, Ottoline Ormsworth was rude to a guest and ignored a second client.\n\nExpectation: Ottoline Ormsworth is expected to greet every guest politely.\nPolicy reference: Standards of Conduct, JBA Policy Manual p.12";

export const NOV12_R37_SECTION_LABELS_CASES: ReplayCase[] = [
  {
    id: "nov12-r37-section-labels-and-policy-line-kept",
    title: "\"make that update: he also ignored a second client\": the labels stay on their own lines and Policy reference keeps its blank line",
    report: "QA's r37 live check in the sibling app (12 Nov 2026), ported: the labels were pulled onto the text line and the blank line before Policy reference was lost",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-12T16:00:00Z"));
      t.directory(REFUSAL_ROSTER);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(REQUEST);
      t.draftWrites({ coaching_details: DETAILS });
      const id = await thread.create();
      t.patchReads!({ [SAID]: patch("this_form", [{ field: "coaching_details", value: WRITTEN, how: "replace", evidence: "ignored a second client" }]) });
      await thread.say(SAID);
      const details = t.values(id).coaching_details ?? "";
      expect(details, details).toMatch(/ignored a second client/);
      expect(details, `a label was pulled onto the text line:\n${details}`).toMatch(/^Observed:\nOn 11\/9/);
      expect(details, `a label was pulled onto the text line:\n${details}`).toMatch(/\n\nExpectation:\nOttoline/);
      expect(details, `the blank line before Policy reference was lost:\n${details}`).toMatch(/\n\nPolicy reference:/);
    },
  },
];
