import { afterEach, describe, expect, it, vi } from "vitest";

import { withFormDateOnce, withoutFormDate } from "./date-once";

// HR's report (21 Oct 2026), invented name: "create verbal ca for pat rivera, she was late to the store 15 minutes on 10-1-26. no payroll deduct".
const KEYS = new Set(["observation"]);

describe("DATE_ONCE_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off: the account keeps the date", () => {
    const values = { observation: "Pat was late to the store 15 minutes on 10-1-26.", form_date: "2026-10-01" };
    expect(withFormDateOnce(values, "2026-10-01", KEYS)).toEqual(values);
  });

  // Changed on purpose (QA's ruling, 11 Nov 2026): one natural mention of the date stays in the account; only a second
  // and later mention of the same date goes ("written twice").
  it("on: one mention of the form's date stays in the account", () => {
    vi.stubEnv("DATE_ONCE_ENABLED", "true");
    const values = { observation: "Pat was late to the store 15 minutes on 10-1-26.", form_date: "2026-10-01" };
    expect(withFormDateOnce(values, "2026-10-01", KEYS)).toEqual(values);
    expect(withFormDateOnce({ observation: "Ottoline missed the monthly meeting on 10/10/26." }, "2026-10-10", KEYS)).toEqual({
      observation: "Ottoline missed the monthly meeting on 10/10/26.",
    });
  });

  it("on: the same date written twice keeps only its first mention; the rest stays", () => {
    vi.stubEnv("DATE_ONCE_ENABLED", "true");
    expect(
      withFormDateOnce({ observation: "Pat was late to the store on 10-1-26 and clocked in at 9:15 on October 1st, 2026." }, "2026-10-01", KEYS),
    ).toEqual({ observation: "Pat was late to the store on 10-1-26 and clocked in at 9:15." });
    expect(withoutFormDate("She was late on 10-1-26, by 15 minutes, on October 1st, 2026.", "2026-10-01")).toBe("She was late on 10-1-26, by 15 minutes.");
  });

  it("the shapes of the same day count as one date; another day stays", () => {
    expect(withoutFormDate("She was late on 10/1/26 (10/1/26) by 15 minutes.", "2026-10-01")).toBe("She was late on 10/1/26 by 15 minutes.");
    expect(withoutFormDate("She was late on October 1st, 2026, by 15 minutes.", "2026-10-01")).toBe("She was late on October 1st, 2026, by 15 minutes.");
    expect(withoutFormDate("She was late on 10-1-26 and again on 10-8-26.", "2026-10-01")).toBe("She was late on 10-1-26 and again on 10-8-26.");
    expect(withoutFormDate("She was late on 10-1-25.", "2026-10-01")).toBe("She was late on 10-1-25.");
  });

  it("on: a field that would be left with almost nothing keeps its date", () => {
    vi.stubEnv("DATE_ONCE_ENABLED", "true");
    expect(withFormDateOnce({ observation: "Late on 10-1-26." }, "2026-10-01", KEYS)).toEqual({ observation: "Late on 10-1-26." });
  });
});
