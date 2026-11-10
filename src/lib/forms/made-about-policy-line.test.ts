import { describe, expect, it } from "vitest";

import { splitAppCitationLine } from "./app-citation-line";
import { withoutPolicyLines } from "./made-about-policy-line";

/*
 * MADE_ABOUT_POLICY_LINE_REPLACES_ENABLED (ported from the sibling app's live round 15; QA's live Bubbles report, 10 Nov
 * 2026): the revision kept the old account's line in shapes the splitter does not read as the app's own. Every
 * "Policy reference: …" line is taken off, wherever it sits. The person is invented.
 */
const ATTENDANCE_LINE = "Policy reference: Attendance Policy, JBA Policy Manual p.14";
const OBSERVED = "Observed:\nOttoline Ormsworth did not follow the dress code on 10/14/26.";
const EXPECTATION = "Expectation:\nOttoline is expected to follow the dress code on every shift.";
const ACCOUNT = `${OBSERVED}\n\n${EXPECTATION}`;

describe("withoutPolicyLines", () => {
  it("QA's live Bubbles shape: the old line kept at the end is taken off", () => {
    expect(withoutPolicyLines(`${ACCOUNT}\n\n${ATTENDANCE_LINE}`)).toBe(ACCOUNT);
  });

  it("with a trailing period, which the splitter does not read as the app's line", () => {
    const text = `${ACCOUNT}\n\n${ATTENDANCE_LINE}.`;
    expect(splitAppCitationLine(text).line).toBeNull();
    expect(withoutPolicyLines(text)).toBe(ACCOUNT);
  });

  it("mid-text: taken off, and the paragraphs around it keep one blank line between them", () => {
    const text = `${OBSERVED}\n\n${ATTENDANCE_LINE}\n\n${EXPECTATION}`;
    expect(splitAppCitationLine(text).line).toBeNull();
    expect(withoutPolicyLines(text)).toBe(ACCOUNT);
  });

  it("two lines, both references (the sibling's live result): both taken off", () => {
    const text = `${ACCOUNT}\n\n${ATTENDANCE_LINE}.\n\nPolicy reference: Standards of Conduct Policy, JBA Policy Manual p.13; Attendance Policy, JBA Policy Manual p.14`;
    expect(withoutPolicyLines(text)).toBe(ACCOUNT);
  });

  it("any letter case, indented", () => {
    expect(withoutPolicyLines(`${ACCOUNT}\n\n  policy reference: Attendance Policy, JBA Policy Manual p.14`)).toBe(ACCOUNT);
  });

  it("negative: text with no policy line is unchanged (trimmed); a sentence that only mentions a policy reference stays", () => {
    expect(withoutPolicyLines(`${ACCOUNT}\n`)).toBe(ACCOUNT);
    const mention = `${OBSERVED} She was shown the Policy reference: Attendance Policy.\n\n${EXPECTATION}`;
    expect(withoutPolicyLines(mention)).toBe(mention);
  });
});
