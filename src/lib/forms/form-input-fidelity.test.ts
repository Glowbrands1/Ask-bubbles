import { afterEach, describe, expect, it } from "vitest";

import { listFormDates } from "./form-date-answer";
import {
  draftDateApplies,
  fidelityAwareTitle,
  fidelityFormDate,
  fidelityGivenDates,
} from "./form-input-fidelity";

const TODAY = "2026-10-24";
const FLAG = "FORM_INPUT_FIDELITY_ENABLED";
const saved = new Map<string, string | undefined>();

function setFlag(on: boolean) {
  if (!saved.has(FLAG)) saved.set(FLAG, process.env[FLAG]);
  if (on) process.env[FLAG] = "1";
  else delete process.env[FLAG];
}

afterEach(() => {
  const value = saved.get(FLAG);
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
});

const POSITION = {
  role: "assistant",
  content:
    "Is this new corrective action a **Verbal Warning** or a **Written Warning**?\n\nWhat is **Pat Rivera**'s position (job title)?",
};

describe("form input fidelity, flag off", () => {
  it("leaves yesterday unset and still reads a bare warning as a job title", () => {
    setFlag(false);
    expect(fidelityFormDate("She was late yesterday.", TODAY, null)).toBeNull();
    expect(fidelityFormDate("She was late on Oct 20.", TODAY, "2026-10-20")).toBe("2026-10-20");
    expect(
      fidelityAwareTitle("verbal", [
        POSITION,
        { role: "user", content: "verbal" },
      ]),
    ).toBe("Verbal");
    expect(draftDateApplies("coaching")).toBe(false);
    expect(draftDateApplies("corrective")).toBe(true);
    expect(fidelityGivenDates("She was late yesterday.", TODAY)).toEqual(
      listFormDates("She was late yesterday.", TODAY).map((found) => found.iso),
    );
  });
});

describe("form input fidelity, flag on", () => {
  it("keeps Oct 20, 10/20, and yesterday, and leaves a missing date unset", () => {
    setFlag(true);
    expect(fidelityFormDate("She was late on Oct 20.", TODAY, null)).toBe("2026-10-20");
    expect(fidelityFormDate("She was late on 10/20.", TODAY, null)).toBe("2026-10-20");
    expect(fidelityFormDate("Date of Occurrence: Oct 20. She was late.", TODAY, null)).toBe("2026-10-20");
    expect(fidelityFormDate("She was late yesterday.", TODAY, null)).toBe("2026-10-23");
    expect(
      fidelityFormDate("create a corrective action for Pat Rivera. She was late yesterday.", TODAY, null),
    ).toBe("2026-10-23");
    expect(fidelityFormDate("Previous warning yesterday.", TODAY, null)).toBeNull();
    expect(fidelityFormDate("Date of Occurrence yesterday. She was late.", TODAY, null)).toBe("2026-10-23");
    expect(fidelityFormDate("She was late.", TODAY, null)).toBeNull();
    expect(fidelityFormDate("She was late on Oct 20 and again on 10/22.", TODAY, null)).toBeNull();
    expect(fidelityFormDate("She was late yesterday.", TODAY, "2026-10-20")).toBe("2026-10-20");
  });

  it("does not save verbal, written, yes, or yesterday as the job title", () => {
    setFlag(true);
    const title = (reply: string) =>
      fidelityAwareTitle(reply, [POSITION, { role: "user", content: reply }]);
    expect(title("verbal")).toBeNull();
    expect(title("written")).toBeNull();
    expect(title("yes")).toBeNull();
    expect(title("yesterday")).toBeNull();
    expect(title("Oct 20")).toBeNull();
    expect(title("10/20")).toBeNull();
    expect(title("operator")).toBe("Operator");
  });

  it("tells a coaching draft the form date, and counts yesterday as a date the manager gave", () => {
    setFlag(true);
    expect(draftDateApplies("coaching")).toBe(true);
    expect(draftDateApplies("corrective")).toBe(true);
    expect(draftDateApplies("epp")).toBe(false);
    expect(fidelityGivenDates("She was late yesterday.", TODAY)).toEqual(["2026-10-23"]);
    expect(fidelityGivenDates("She was late on Oct 20.", TODAY)).toEqual(["2026-10-20"]);
  });
});
