import { describe, expect, it } from "vitest";

import { accountHasNoSubject, withSlashDates } from "./card-account";

/*
 * QA's live re-test of the loop (21 Nov 2026, A5; Fenna Prewitt is invented): "create verbal ca for <name> for opening
 * store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply and state $25 will be
 * payroll deducted" got the card issue line "Opening store late on 10-1-26." Expected: "<First> opened the store late on
 * 10/1/26."
 */
describe("the card's account has a subject (QA live re-test, A5)", () => {
  it("\"Opening store late on 10-1-26.\" has none", () => {
    expect(accountHasNoSubject("Opening store late on 10-1-26.")).toBe(true);
  });

  it("other subjectless leads: \"not …ing\", \"for …ing\"", () => {
    expect(accountHasNoSubject("Not attending the monthly meeting on 10-20-26.")).toBe(true);
    expect(accountHasNoSubject("for leaving her station without coverage")).toBe(true);
  });

  it("a sentence with its subject is left alone", () => {
    expect(accountHasNoSubject("Fenna opened the store late on 10/1/26.")).toBe(false);
    expect(accountHasNoSubject("Fenna did not attend the monthly meeting on 10-20-26.")).toBe(false);
    expect(accountHasNoSubject("Opening procedures were not followed on 10/1.")).toBe(false);
    expect(accountHasNoSubject("During her shift she left the register open.")).toBe(false);
    expect(accountHasNoSubject("Late Opening.")).toBe(false);
  });
});

describe("a dashed date is written as the issue line writes dates (QA live re-test, A5)", () => {
  it("\"10-1-26\" → \"10/1/26\"", () => {
    expect(withSlashDates("Fenna opened the store late on 10-1-26.")).toBe("Fenna opened the store late on 10/1/26.");
  });

  it("a range, a phone number and a date already slashed are left as typed", () => {
    expect(withSlashDates("She worked 10-12 hours.")).toBe("She worked 10-12 hours.");
    expect(withSlashDates("Call 402-555-1234.")).toBe("Call 402-555-1234.");
    expect(withSlashDates("Late on 11/18/26.")).toBe("Late on 11/18/26.");
    expect(withSlashDates("Code 13-40-26.")).toBe("Code 13-40-26.");
  });
});
