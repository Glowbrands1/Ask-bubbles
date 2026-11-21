import { describe, expect, it } from "vitest";

import { splitAppCitationLine } from "./app-citation-line";

/* Ported from the sibling app: only the app's own trailing "Policy reference: …, JBA Policy Manual p.N" line is split off. */
describe("splitAppCitationLine", () => {
  it("splits the app's trailing citation line, one or several citations", () => {
    expect(splitAppCitationLine("Observed:\nRemy was late.\n\nPolicy reference: Attendance Policy, JBA Policy Manual p.14")).toEqual({
      body: "Observed:\nRemy was late.",
      line: "Policy reference: Attendance Policy, JBA Policy Manual p.14",
    });
    expect(splitAppCitationLine("Remy was late.\n\nPolicy reference: Attendance Policy, JBA Policy Manual p.14; Dress Code Policy, JBA Policy Manual p.15").line).toBe(
      "Policy reference: Attendance Policy, JBA Policy Manual p.14; Dress Code Policy, JBA Policy Manual p.15",
    );
  });

  it("leaves a typed policy reference that is not the last paragraph, or not the app's shape, in the text", () => {
    expect(splitAppCitationLine("Policy reference: the attendance rules. Remy was late.")).toEqual({ body: "Policy reference: the attendance rules. Remy was late.", line: null });
    expect(splitAppCitationLine("Remy was late.").line).toBeNull();
  });
});
