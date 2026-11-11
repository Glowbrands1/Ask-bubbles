import { describe, expect, it } from "vitest";

import { cardChangeSentence, managerDate } from "./card-change-sentence";

const CARD = { formDate: "2026-10-20", warningLevel: null, payrollDeduct: null, locationName: "Kearney", employeeRole: null };

describe("cardChangeSentence", () => {
  it("says each field alone", () => {
    expect(cardChangeSentence({ formDate: "2026-10-19" }, CARD, "Store")).toBe("Change the date to 10/19/2026.");
    expect(cardChangeSentence({ warningLevel: "written" }, CARD, "Store")).toBe("Change: This is a written warning.");
    expect(cardChangeSentence({ payrollDeduct: "no" }, CARD, "Store")).toBe("Change: Payroll deduct no.");
    expect(cardChangeSentence({ locationName: "Lawrence" }, CARD, "Store")).toBe("Change: Store: Lawrence.");
    expect(cardChangeSentence({ employeeRole: "Shift Lead" }, CARD, "Store")).toBe("Change: Job title: Shift Lead.");
  });

  it("says several fields in one turn, the date first", () => {
    expect(
      cardChangeSentence({ formDate: "2026-10-19", warningLevel: "written", payrollDeduct: "yes", employeeRole: "Shift Lead" }, CARD, "Store"),
    ).toBe("Change the date to 10/19/2026. This is a written warning. Payroll deduct yes. Job title: Shift Lead.");
  });

  it("says nothing for a field that did not change, and null when nothing did", () => {
    expect(cardChangeSentence({ formDate: "2026-10-20", locationName: "kearney" }, CARD, "Store")).toBeNull();
    expect(cardChangeSentence({}, CARD, "Store")).toBeNull();
  });

  it("sends nothing for a date that is not a real day", () => {
    expect(cardChangeSentence({ formDate: "2026-02-30", warningLevel: "written" }, CARD, "Store")).toBeNull();
    expect(cardChangeSentence({ formDate: "10/19/2026" }, CARD, "Store")).toBeNull();
  });
});

describe("managerDate", () => {
  it("writes the date the way the readers read it", () => {
    expect(managerDate("2026-10-19")).toBe("10/19/2026");
    expect(managerDate("2026-02-29")).toBeNull();
  });
});
