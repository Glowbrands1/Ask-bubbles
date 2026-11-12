import { describe, expect, it } from "vitest";

import type { ManualChunk } from "@/lib/forms/official-policy-manual";

import { withPolicySetAside } from "@/lib/forms/policy-set-aside";

import { CITED_BLOCK_HEADING, cardCitedSections, withCardPolicyQuoted, withMappedPolicy, withoutCitedPassages } from "./violation-policy";

/*
 * Gate-Bubbles-2's POLICY_CITATION gate (12 Nov 2026), with the pack's manual wording (invented). The callers check the
 * flag; these are the pure readings.
 */
const ATTENDANCE =
  "Each employee knows their schedule and arrives on time. Poor punctuality and absences hurt the team and the client. " +
  "An employee who cannot work a scheduled shift finds a coworker to cover it (See Shift Replacement). A no call or no " +
  "show for a scheduled shift may lead to termination. An employee who will be tardy or absent calls their manager on " +
  "duty at least 2 hours before the shift, unless an emergency makes that impossible. A text message to a manager does " +
  "not count as calling in, and the employee still calls.";
const CHUNKS: ManualChunk[] = [
  { chunkIndex: 0, page: 14, content: ATTENDANCE, section: "Attendance" },
  { chunkIndex: 1, page: 13, content: "**Standards of Conduct** Unauthorized absence from the work area during the workday.*", section: "Standards of Conduct" },
];

describe("on a card, the block quotes only the sections the card cites", () => {
  it("(1) a Coaching card citing the Standards of Conduct quotes it, never Attendance from earlier turns", () => {
    const card = "Here is what I would put on a **Coaching Form**.\n\nStandards of Conduct Policy, JBA Policy Manual p.13";
    expect(cardCitedSections(card, CHUNKS)).toEqual([{ section: "Standards of Conduct", page: 13 }]);
    const out = withCardPolicyQuoted(card, CHUNKS, true);
    expect(out).toContain(`${CITED_BLOCK_HEADING}\n\nStandards of Conduct Policy, JBA Policy Manual p.13\nStandards of Conduct Unauthorized absence`);
    expect(out).not.toMatch(/Attendance/);
  });

  it("a card's **Policy:** line is its citation too", () => {
    const card = "**Policy:** Attendance, from what you described — the policy manual's section on page 14.";
    expect(cardCitedSections(card, CHUNKS)).toEqual([{ section: "Attendance", page: 14 }]);
  });

  it("(2) a card that cites nothing gets no block, so its own sentence about the policy stands", () => {
    const card = "Here is what I would put on a **Coaching Form**.\n\nI'll list the manual's policy that matches what happened on the draft when you create it.";
    expect(withCardPolicyQuoted(card, CHUNKS, true)).toBe(card);
  });

  it("off, or a block already there: unchanged", () => {
    const card = "Standards of Conduct Policy, JBA Policy Manual p.13";
    expect(withCardPolicyQuoted(card, CHUNKS, false)).toBe(card);
    const once = withCardPolicyQuoted(card, CHUNKS, true);
    expect(withCardPolicyQuoted(once, CHUNKS, true)).toBe(once);
  });
});

describe("(3) the quote ends on a whole sentence or word, with no stray '*'", () => {
  it("a long section ends at a sentence with an ellipsis, never \"calling i\"", () => {
    const out = withMappedPolicy("Answer.", ["she was late to her shift"], CHUNKS, true);
    const quote = out.split("JBA Policy Manual p.14\n")[1] ?? "";
    expect(quote).toMatch(/\. …$/);
    expect(quote).not.toMatch(/calling i$/);
  });

  it("emphasis markers are dropped", () => {
    const out = withCardPolicyQuoted("Standards of Conduct Policy, JBA Policy Manual p.13", CHUNKS, true);
    expect(out.split(CITED_BLOCK_HEADING)[1]).not.toContain("*");
  });
});

/*
 * Gate-Bubbles-3's Rpcf (12 Nov 2026): (1) after "take the attendance policy off the form" the card said "**Policy:**
 * none — you took the Attendance policy off" with the Attendance quote still above it; (2) a form menu kept an empty
 * "Policy cited …" heading. A set-aside card quotes nothing, and the heading never stands alone.
 */
describe("Rpcf: no quote for a set-aside policy, never an empty heading", () => {
  const card = "Here is the card.\n\nAttendance Policy, JBA Policy Manual p.14";
  const quotedCard = () => withCardPolicyQuoted(card, CHUNKS, true);

  it("withoutCitedPassages drops the passages asked, and the heading with the last of them", () => {
    expect(withoutCitedPassages(quotedCard(), () => true)).toBe(card);
    expect(withoutCitedPassages(quotedCard(), () => false)).toBe(quotedCard());
    expect(withoutCitedPassages(card, () => true)).toBe(card);
  });

  it("text after the block is kept", () => {
    const withAfter = `${quotedCard()}\n\n**Policy:** none — you took the Attendance policy off.`;
    expect(withoutCitedPassages(withAfter, () => true)).toBe(`${card}\n\n**Policy:** none — you took the Attendance policy off.`);
  });

  it("(1) a card with the Attendance policy set aside quotes nothing", () => {
    const out = withPolicySetAside(quotedCard(), { names: new Set(["attendance"]), any: false } as never);
    expect(out).not.toContain(CITED_BLOCK_HEADING);
    expect(out).toMatch(/\*\*Policy:\*\* none — you took the Attendance policy off/);
  });
});
