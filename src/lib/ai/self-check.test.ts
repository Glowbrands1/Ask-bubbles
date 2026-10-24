import { describe, expect, it } from "vitest";

import { selfCheckEnabled } from "@/lib/config/chat-quality-flags";
import type { RosterEmployee } from "@/lib/forms/employee-match";

import { chooseCheckedAnswer, repairMayReplace, selfCheck } from "./self-check";

const MARISSA: RosterEmployee = {
  id: "emp-marissa",
  firstName: "Marissa",
  lastName: "Lempka",
  locationIds: ["loc-66"],
};

const ATTENDANCE = {
  section: "Attendance",
  page: 14,
  printedPage: 14,
  content: "Attendance\nAn employee is expected to be on time.",
};

describe("SELF_CHECK_ENABLED", () => {
  it("is off unless set to 1, true, on, or yes", () => {
    const previous = process.env.SELF_CHECK_ENABLED;
    try {
      for (const value of [undefined, "", "0", "false", "off", "no"]) {
        if (value === undefined) delete process.env.SELF_CHECK_ENABLED;
        else process.env.SELF_CHECK_ENABLED = value;
        expect(selfCheckEnabled()).toBe(false);
      }
      for (const value of ["1", "true", "on", "yes", " YES "]) {
        process.env.SELF_CHECK_ENABLED = value;
        expect(selfCheckEnabled()).toBe(true);
      }
    } finally {
      if (previous === undefined) delete process.env.SELF_CHECK_ENABLED;
      else process.env.SELF_CHECK_ENABLED = previous;
    }
  });

  it("accepts a citation the retrieved chunk carries, and rejects a page or heading it does not", () => {
    const grounded = selfCheck({
      answer: "See Attendance Policy, JBA Policy Manual p.14.",
      chunks: [ATTENDANCE],
      roster: [MARISSA],
    });
    expect(grounded).toEqual([]);

    const inventedPage = selfCheck({
      answer: "See Attendance Policy, JBA Policy Manual p.99.",
      chunks: [ATTENDANCE],
      roster: [MARISSA],
    });
    expect(inventedPage.map((failure) => failure.kind)).toEqual(["citation"]);

    const inventedHeading = selfCheck({
      answer: "See Dress Code Policy, JBA Policy Manual p.14.",
      chunks: [ATTENDANCE],
      roster: [MARISSA],
    });
    expect(inventedHeading.map((failure) => failure.kind)).toEqual(["citation"]);

    const sourceLine = selfCheck({
      answer: "Source: JBA Policy Manual — Attendance, p. 14",
      chunks: [ATTENDANCE],
      roster: [],
    });
    expect(sourceLine).toEqual([]);
  });

  it("a heading in the chunk text counts when the section field is empty", () => {
    const failures = selfCheck({
      answer: "See Late Opening Policy, JBA Policy Manual p.15.",
      chunks: [{ section: null, page: 15, content: "Late Opening\nWhen a store opens late." }],
      roster: [],
    });
    expect(failures).toEqual([]);
  });

  it("an action plan must be two sentences, and an answer with no plan passes", () => {
    const two = selfCheck({
      answer: "Management will review the Attendance policy with the employee. Please confirm the employee understands and will follow the policy.",
      chunks: [],
      roster: [],
    });
    expect(two).toEqual([]);

    const three = selfCheck({
      answer:
        "Management will review the Attendance policy with the employee. $25 will be deducted from the next pay. Please confirm the employee understands and will follow the policy.",
      chunks: [],
      roster: [],
    });
    expect(three.map((failure) => failure.kind)).toEqual(["action_plan"]);

    const none = selfCheck({
      answer: "The attendance section is about being on time.",
      chunks: [ATTENDANCE],
      roster: [],
    });
    expect(none).toEqual([]);
  });

  it("a typed name that Woven does not list is not a failed check", () => {
    // 8f7cf6d failed "Casey Quinn" and the repair then removed the name.
    // The name stays. An empty roster is the same: not proof the person is absent.
    const known = selfCheck({
      answer: "I will file this for Marissa Lempka.",
      chunks: [],
      roster: [MARISSA],
    });
    expect(known).toEqual([]);

    const unknown = selfCheck({
      answer: "I will file this for Casey Quinn.",
      chunks: [],
      roster: [MARISSA],
    });
    expect(unknown).toEqual([]);

    const directoryDown = selfCheck({
      answer: "I will file this for Casey Quinn.",
      chunks: [],
      roster: [],
    });
    expect(directoryDown).toEqual([]);
  });

  it("does not show a repair that drops the typed name or says they are missing from Woven", () => {
    const original = "I will file this for Casey Quinn.";
    const dropped = "I couldn't find that person in the Woven roster.";
    expect(repairMayReplace(original, dropped)).toBe(false);
    expect(chooseCheckedAnswer(original, dropped, [])).toBe(original);
    expect(chooseCheckedAnswer(original, "I couldn't find Casey Quinn in the Woven roster. The form is ready.", [])).toBe(original);
    expect(repairMayReplace(original, "I will file this for Casey Quinn. See Attendance Policy, JBA Policy Manual p.14.")).toBe(true);
  });

  it("keeps the original answer when the repair still fails", () => {
    const original = "See Dress Code Policy, JBA Policy Manual p.3.";
    const repaired = "See Dress Code Policy, JBA Policy Manual p.4.";
    const failures = selfCheck({ answer: repaired, chunks: [ATTENDANCE], roster: [] });
    expect(chooseCheckedAnswer(original, repaired, failures)).toBe(original);
    expect(chooseCheckedAnswer(original, "See Attendance Policy, JBA Policy Manual p.14.", [])).toBe(
      "See Attendance Policy, JBA Policy Manual p.14.",
    );
    expect(chooseCheckedAnswer(original, null, [])).toBe(original);
  });
});
