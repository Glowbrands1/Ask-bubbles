import { describe, expect, it } from "vitest";

import { buildPolicyPickUserMessage, POLICY_PICK_SYSTEM_PROMPT } from "./prompt";

/**
 * The approved Step A system text (STEP_A_PROPOSAL section 3), with "or picked
 * a number from the choices offered" added as in design v2, inlined so a
 * change to the prompt is a change to this test.
 */
const APPROVED = [
  "You choose the one section of the company policy manual that an HR form's incident falls under. Use only the manual below.",
  "section_title: copy one heading exactly as listed for the chunk you choose. Never invent or reword a heading.",
  "page: the p.N listed with that heading.",
  "chunk_id: the id of the chunk your quote is copied from.",
  "quote: one or two consecutive sentences from that chunk, character for character, stating the rule the employee broke; at least 8 words; no paraphrase, no cuts, no joining of two places.",
  "If the manager named or chose a section, or picked a number from the choices offered, choose it when the manual has it. If a policy is already on the card, keep it unless the manager's later words describe a different incident or reject it. Prefer the most specific section that describes the incident over a general one, unless the manager named the general one.",
  "confidence: 0 to 1. alternatives: up to 3 other sections that could apply, most likely first, copied the same way; empty if none.",
  "asks_about_policy: true only when the manager's latest message asks which policy applies, what policy was violated, or what to write in a policy field of the form.",
].join("\n");

describe("the policy-pick prompt", () => {
  it("is the approved system text, character for character", () => {
    expect(POLICY_PICK_SYSTEM_PROMPT).toBe(APPROVED);
  });

  it("builds the user message in the approved shape", () => {
    expect(
      buildPolicyPickUserMessage({
        templateName: "Corrective Action",
        todayIso: "2026-11-03",
        cardLine: "**Policy:** Attendance Policy, JBA Policy Manual p.14",
        managerTurns: ["CA for being late", "use the attendance one"],
      }),
    ).toBe(
      [
        "Form: Corrective Action",
        "Today: 2026-11-03",
        "Policy on the card now: **Policy:** Attendance Policy, JBA Policy Manual p.14",
        "",
        "Manager's words for this form, oldest first:",
        "Manager: CA for being late",
        "Manager: use the attendance one",
      ].join("\n"),
    );
    expect(buildPolicyPickUserMessage({ templateName: "Coaching", todayIso: "2026-11-03", cardLine: null, managerTurns: [] })).toContain(
      "Policy on the card now: none",
    );
  });
});
