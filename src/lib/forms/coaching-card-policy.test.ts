import { describe, expect, it } from "vitest";

import { JBA_MANUAL_CA_CHUNKS } from "@/test/fixtures/jba-manual-ca-sections";

import { withCoachingCardPolicy } from "./coaching-card-policy";

// QA's live test, Ask Bubbles production, 8 Nov 2026 (the person invented).
const SAID = "my employee Marnie Holloway was late on 10-20-26, create a coaching form";
const CARD = "Here is what I would put on a **Coaching Form**.\n\nCreate the draft here when you're ready.";

describe("withCoachingCardPolicy", () => {
  it("cites the Attendance section with its page on a Coaching card for lateness", () => {
    const out = withCoachingCardPolicy({ content: CARD, templateKey: "coaching", notes: SAID, chunks: JBA_MANUAL_CA_CHUNKS });
    expect(out).toMatch(/Attendance Policy, JBA Policy Manual p\.\d+/);
  });

  it("leaves a card alone when it already cites the manual, is not a Coaching card, or the account points at no section", () => {
    const cited = `${CARD}\n\nAttendance Policy, JBA Policy Manual p.14`;
    expect(withCoachingCardPolicy({ content: cited, templateKey: "coaching", notes: SAID, chunks: JBA_MANUAL_CA_CHUNKS })).toBe(cited);
    expect(withCoachingCardPolicy({ content: CARD, templateKey: "dpoa", notes: SAID, chunks: JBA_MANUAL_CA_CHUNKS })).toBe(CARD);
    expect(withCoachingCardPolicy({ content: CARD, templateKey: "coaching", notes: "create a coaching form for Marnie Holloway about upselling", chunks: JBA_MANUAL_CA_CHUNKS })).toBe(CARD);
  });
});
